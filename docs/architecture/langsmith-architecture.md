# LangSmith Self-Hosted Platform: AWS Deployment Architecture

## 1. Executive Summary

This document provides a deployment architecture for the LangSmith observability platform on Amazon Web Services (AWS), targeting a mid-scale enterprise (~50 developers, ~10M traces/month). The design uses Amazon Elastic Kubernetes Service (EKS) to orchestrate LangSmith's six microservices, externalizes all stateful storage to managed AWS services (RDS, ElastiCache, S3), and runs ClickHouse on dedicated EC2 instances for analytical queries.

The architecture prioritizes operational simplicity, data durability, and horizontal scalability. All components run within a single VPC across three Availability Zones, with public access restricted to an Application Load Balancer fronted by AWS WAF.

**Key design choices:**
- Helm-based deployment using LangSmith's official chart
- Externalized storage for zero-downtime upgrades and independent scaling
- IRSA (IAM Roles for Service Accounts) for credential-free service authentication
- ClickHouse on EC2 rather than managed alternatives, following LangSmith's documented requirements

---

## 2. Cloud Provider Selection Rationale

**Selected: Amazon Web Services (AWS)**

| Factor | AWS | GCP | Azure |
|--------|-----|-----|-------|
| Official reference architecture | Yes (documented) | Partial | No |
| Managed Kubernetes | EKS (mature) | GKE | AKS |
| ClickHouse support | EC2 + EBS (documented pattern) | GCE | VM |
| Marketplace availability | LangSmith Helm chart | Limited | Limited |
| Enterprise adoption | Broadest | Growing | Enterprise-focused |

AWS was selected because:
1. **Official support**: LangSmith provides AWS-specific deployment documentation and Helm chart configurations.
2. **Existing infrastructure**: InnovateCorp already runs workloads on EKS, reducing operational learning curve.
3. **Managed storage breadth**: RDS (PostgreSQL), ElastiCache (Redis), and S3 cover all LangSmith's externalized storage needs as first-class services.
4. **ClickHouse pattern**: LangSmith's documentation recommends ClickHouse on EC2 with gp3 EBS volumes for OLAP workloads, which maps cleanly to AWS primitives.

---

## 3. LangSmith Platform Components

LangSmith self-hosted consists of six containerized services deployed as Kubernetes Deployments. Component details as of the LangSmith self-hosted documentation (last accessed March 2026):

| Service | Purpose | Type | CPU Request | Memory Request | Replicas (baseline) |
|---------|---------|------|-------------|----------------|---------------------|
| **Frontend** | React SPA + Nginx reverse proxy | Stateless | 0.25 vCPU | 256 Mi | 2 |
| **Backend** | Core API server (traces, projects, runs) | Stateless | 1 vCPU | 2 Gi | 3 |
| **Platform Backend** | Auth, org management, billing | Stateless | 0.5 vCPU | 1 Gi | 2 |
| **Queue** | Async job processing (evaluations, exports) | Stateless | 0.5 vCPU | 1 Gi | 2 |
| **Playground** | LLM playground proxy | Stateless | 0.25 vCPU | 512 Mi | 1 |
| **ACE Backend** | Annotation/evaluation orchestration | Stateless | 0.5 vCPU | 1 Gi | 2 |

All six services are **stateless** -- they rely on external storage for persistence. This is the critical property that enables zero-downtime rolling updates: terminate any pod, and a replacement picks up immediately with no data loss.

---

## 4. Storage Externalization Strategy

LangSmith requires four storage systems. The self-hosted Helm chart bundles internal instances of each, but production deployments should externalize them to managed services for durability, backup, and independent scaling.

### 4.1 PostgreSQL → Amazon RDS

| Parameter | Value |
|-----------|-------|
| Engine | PostgreSQL 14+ (LangSmith minimum) |
| Instance | db.r6g.xlarge (4 vCPU, 32 GB) |
| Multi-AZ | Yes |
| Storage | gp3, 100 GB initial, autoscaling enabled |
| Backup | Automated daily snapshots, 7-day retention |

**Why externalize**: PostgreSQL stores organization data, project metadata, and user accounts. Data loss here means losing all LangSmith configuration. RDS provides automated failover, point-in-time recovery, and patch management that would require dedicated DBA effort on self-managed Postgres.

### 4.2 Redis → Amazon ElastiCache

| Parameter | Value |
|-----------|-------|
| Engine | Redis OSS 5+ (LangSmith minimum; 7.x recommended) |
| Node type | cache.r6g.large (2 vCPU, 13 GB) |
| Cluster mode | Disabled (single-shard, 1 primary + 1 replica) |
| Encryption | In-transit (TLS) + at-rest |

**Why externalize**: Redis handles caching, session state, and rate limiting. While Redis data is ephemeral (reconstructible from PostgreSQL), an ElastiCache failure without a replica would cause temporary service degradation. ElastiCache provides automatic failover in ~30 seconds vs. manual intervention for self-managed Redis.

**Note on version**: The assignment prompt specifies "Redis 7+" but LangSmith's self-hosted documentation states the minimum requirement is "Redis OSS 5+". The Helm chart's default image uses Redis 7.x. We recommend Redis 7.x on ElastiCache for performance improvements, but 5.x is the documented minimum.

### 4.3 ClickHouse → EC2 Instances

| Parameter | Value |
|-----------|-------|
| Instance type | r6i.2xlarge (8 vCPU, 64 GB) per node |
| Storage | gp3 EBS, 500 GB, 6000 IOPS, 400 MB/s throughput |
| Cluster size | 3 nodes (1 primary, 2 replicas) |
| Replication | ReplicatedMergeTree with ZooKeeper/ClickHouse Keeper |

**Why EC2 (not managed)**: ClickHouse is LangSmith's analytical engine for trace queries, aggregations, and dashboards. No fully managed ClickHouse service on AWS matches LangSmith's documented requirements. ClickHouse Cloud exists but requires separate account management. EC2 with gp3 volumes gives full control over ClickHouse version compatibility and IOPS tuning.

**Critical operational note**: ClickHouse IOPS is the primary scaling bottleneck for LangSmith. When trace ingestion volume grows, the first symptom is increased query latency. The remediation is increasing EBS IOPS (gp3 supports up to 16,000 IOPS without volume resizing) before adding more nodes.

### 4.4 Blob Storage → Amazon S3

| Parameter | Value |
|-----------|-------|
| Bucket | `langsmith-{account-id}-{region}` |
| Storage class | S3 Intelligent-Tiering |
| Versioning | Enabled |
| Lifecycle | Transition to Infrequent Access after 90 days |

**Why externalize**: S3 stores trace payloads (inputs/outputs), run artifacts, and dataset files. These can be large (LLM responses are often 1-10 KB per trace). S3's durability (11 nines) and cost model (pay per GB stored) make it the natural choice. Intelligent-Tiering automatically moves older traces to cheaper storage tiers.

---

## 5. Data Flow Architecture

### 5.1 Write Path (Trace Ingestion)

```
SDK Client → ALB → Backend Service → ClickHouse (trace metadata)
                                   → S3 (trace payloads via presigned URLs)
                                   → PostgreSQL (project/run metadata)
                                   → Redis (cache invalidation)
```

The Backend receives trace data from LangSmith SDKs via HTTPS. It splits the payload:
- **Structured metadata** (timestamps, token counts, latencies) goes to ClickHouse for analytical queries
- **Large payloads** (input/output text, tool calls) go to S3 via presigned URLs
- **Relational data** (project membership, run relationships) goes to PostgreSQL
- **Cache entries** in Redis are invalidated for any affected dashboards

### 5.2 Read Path (Dashboard/Query)

```
Browser → ALB → Frontend (static assets) → Backend API
                                         → ClickHouse (aggregation queries)
                                         → PostgreSQL (metadata lookups)
                                         → S3 (payload retrieval)
                                         → Redis (cache hits)
```

Dashboard queries hit Redis cache first. Cache misses trigger ClickHouse queries for aggregate data and PostgreSQL lookups for metadata. Individual trace payloads are fetched from S3 via presigned URLs served directly to the browser.

### 5.3 Async Path (Evaluations/Exports)

```
Backend → Redis (job queue) → Queue Service → ClickHouse (read traces)
                                             → S3 (read/write artifacts)
                                             → Backend (results callback)
```

Long-running operations (dataset evaluations, CSV exports, annotation queue processing) are dispatched to the Queue service via Redis job queues. This prevents slow operations from blocking API response times.

---

## 6. Deployment Architecture

### 6.1 Network Topology

The deployment uses a standard three-tier VPC architecture:

- **Public subnets** (3 AZs): Application Load Balancer only
- **Private subnets** (3 AZs): EKS worker nodes, ClickHouse EC2 instances
- **Isolated subnets** (3 AZs): RDS, ElastiCache (no internet access)

```
┌─────────────────────────────────────────────────────────────────┐
│ VPC: 10.0.0.0/16                                                │
│                                                                  │
│  ┌─────────────── Public Subnets ──────────────┐                │
│  │  ALB + WAF          Route 53 (DNS)          │                │
│  │  langsmith.innovatecorp.com                  │                │
│  └──────────────────────┬───────────────────────┘                │
│                         │                                        │
│  ┌─────────────── Private Subnets ─────────────┐                │
│  │  EKS Worker Nodes (m6i.xlarge, 3 nodes)     │                │
│  │  ┌──────────────────────────────────┐        │                │
│  │  │ Frontend (2)  Backend (3)        │        │                │
│  │  │ Platform (2)  Queue (2)          │        │                │
│  │  │ Playground (1) ACE (2)           │        │                │
│  │  └──────────────────────────────────┘        │                │
│  │                                              │                │
│  │  ClickHouse EC2 (r6i.2xlarge, 3 nodes)      │                │
│  └──────────────────────┬───────────────────────┘                │
│                         │                                        │
│  ┌─────────────── Isolated Subnets ────────────┐                │
│  │  RDS PostgreSQL (Multi-AZ)                   │                │
│  │  ElastiCache Redis (Primary + Replica)       │                │
│  └──────────────────────────────────────────────┘                │
│                                                                  │
│  S3 Bucket (VPC Gateway Endpoint)                                │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Kubernetes Deployment

LangSmith is deployed via the official Helm chart:

```bash
helm repo add langsmith https://langchain-ai.github.io/helm/
helm install langsmith langsmith/langsmith \
  --namespace langsmith \
  --create-namespace \
  -f values-production.yaml
```

Key `values-production.yaml` overrides:
- External PostgreSQL connection string (via Secrets Manager)
- External Redis endpoint
- External ClickHouse connection details
- S3 bucket configuration with IRSA role ARN
- Ingress annotations for ALB controller
- Resource requests/limits per service
- HPA (Horizontal Pod Autoscaler) configurations

### 6.3 Ingress & DNS

- **ALB Ingress Controller**: Routes HTTPS traffic to Frontend and Backend services
- **AWS WAF**: Rate limiting, IP allowlisting, OWASP Core Rule Set
- **Route 53**: `langsmith.innovatecorp.com` CNAME to ALB
- **ACM Certificate**: TLS termination at ALB

---

## 7. Scaling Strategy

### 7.1 Stateless Services (EKS)

All six LangSmith services scale horizontally via HPA:

| Service | Scale Metric | Min Pods | Max Pods | Target |
|---------|-------------|----------|----------|--------|
| Backend | CPU utilization | 3 | 10 | 70% |
| Frontend | CPU utilization | 2 | 5 | 80% |
| Platform Backend | CPU utilization | 2 | 5 | 70% |
| Queue | Queue depth (custom) | 2 | 8 | 100 pending jobs |
| Playground | CPU utilization | 1 | 3 | 80% |
| ACE Backend | CPU utilization | 2 | 5 | 70% |

### 7.2 ClickHouse (EC2)

ClickHouse scaling follows a two-phase approach:
1. **Phase 1: Vertical IOPS scaling** -- increase gp3 IOPS from baseline 3000 to 6000 to 16000 (no downtime, no data migration)
2. **Phase 2: Horizontal scaling** -- add read replicas for query distribution (requires data replication setup)

**Monitoring trigger**: When p95 query latency exceeds 2 seconds sustained over 15 minutes, increase IOPS. When IOPS is maxed and latency remains high, add replicas.

### 7.3 PostgreSQL (RDS)

- **Vertical scaling**: Resize instance class during maintenance window (brief downtime with Multi-AZ)
- **Read replicas**: Add Aurora read replicas for dashboard metadata queries if write instance CPU exceeds 70%

### 7.4 Redis (ElastiCache)

- Enable cluster mode only if memory usage exceeds 80% of current node size
- Scale node type vertically before sharding (operational simplicity)

### 7.5 S3

- No scaling required -- S3 scales automatically
- Enable S3 Intelligent-Tiering for cost optimization on aging trace data
- Set lifecycle policy to move objects >90 days to Infrequent Access

---

## 8. Security and Compliance

### 8.1 Network Security

- **VPC isolation**: All compute and storage in private/isolated subnets
- **Security groups**: Least-privilege rules (e.g., only EKS nodes can reach ClickHouse on port 8123/9000)
- **VPC endpoints**: S3 Gateway Endpoint (no internet traversal for S3 traffic), Interface Endpoints for Secrets Manager and STS
- **No public IPs**: Only ALB has public-facing ENIs

### 8.2 Identity and Access

- **IRSA (IAM Roles for Service Accounts)**: Each LangSmith service gets a dedicated IAM role via Kubernetes service account annotation. No long-lived credentials stored in pods.
- **Secrets Manager**: Database passwords and API keys stored in AWS Secrets Manager, injected via External Secrets Operator or CSI driver.
- **OIDC/SSO**: LangSmith supports SAML 2.0 and OIDC for user authentication. Connect to InnovateCorp's existing identity provider.

### 8.3 Encryption

- **In-transit**: TLS 1.2+ everywhere (ALB termination, RDS connections, ElastiCache, ClickHouse)
- **At-rest**: RDS and EBS encrypted with KMS customer-managed keys. S3 SSE-S3 (or SSE-KMS for compliance).
- **ElastiCache**: In-transit encryption (TLS) + at-rest encryption enabled

### 8.4 WAF Rules

AWS WAF on the ALB with:
- Rate limiting: 1000 requests/minute per IP
- AWS Managed Rules: Core Rule Set, Known Bad Inputs
- IP allowlist for internal networks (optional)
- Geographic restrictions if needed

---

## 9. Operational Considerations

### 9.1 Failure Modes

| Failure | Symptom | Impact | Mitigation |
|---------|---------|--------|------------|
| ClickHouse IOPS saturation | Traces created but not visible in UI; dashboard queries timeout | Users cannot search or view recent traces | Monitor `disk_io_time_ms` and `query_duration_p95`; increase gp3 IOPS |
| Redis failure | Slow page loads, session drops | Temporary degradation, no data loss | ElastiCache automatic failover (~30s) |
| RDS failover | Brief API errors during switchover | 30-60s of write failures | Multi-AZ automatic failover; retry logic in clients |
| S3 unavailability | Trace payloads show "loading..." | Cannot view trace inputs/outputs | S3 has 99.99% availability SLA; no action needed |
| Backend pod crash | 503 errors for subset of requests | Partial API unavailability | HPA maintains min 3 replicas; Kubernetes restarts pod |
| Queue backlog | Evaluations and exports delayed | Non-blocking; real-time features unaffected | Scale Queue pods via HPA on queue depth |

### 9.2 Troubleshooting: "Traces Created but Not Visible"

This is the most common operational issue, caused by ingestion backpressure:

1. **Check ClickHouse health**: `SELECT * FROM system.metrics WHERE metric LIKE '%Delay%'`
2. **Check EBS IOPS**: CloudWatch `VolumeReadOps` + `VolumeWriteOps` vs. provisioned IOPS
3. **Check Backend logs**: Look for ClickHouse connection timeouts or retry messages
4. **Check Redis**: `INFO memory` -- if memory is full, writes may be rejected
5. **Check queue depth**: If async processing is backed up, traces may be queued but not yet written

**Resolution priority**: IOPS increase (most common) → Backend pod scaling → ClickHouse replica addition

### 9.3 Monitoring Stack

- **CloudWatch**: EKS, RDS, ElastiCache, S3 metrics
- **Prometheus + Grafana**: Kubernetes pod metrics, ClickHouse JMX metrics
- **CloudWatch Alarms**: ClickHouse disk IOPS > 80% provisioned, RDS CPU > 70%, Redis memory > 80%
- **PagerDuty/Opsgenie integration**: Critical alerts for storage failures and sustained high latency

### 9.4 Backup Strategy

| System | Method | Frequency | Retention |
|--------|--------|-----------|-----------|
| PostgreSQL | RDS automated snapshots | Daily + PITR | 7 days |
| ClickHouse | EBS snapshots via AWS Backup | Daily | 14 days |
| S3 | Versioning + cross-region replication | Continuous | 30 days (versions) |
| Redis | ElastiCache snapshots | Daily | 3 days |

---

## 10. Cost Estimation

Monthly cost estimate for mid-scale deployment (~50 developers, ~10M traces/month):

| Component | Service | Instance/Config | Monthly Cost (est.) |
|-----------|---------|-----------------|---------------------|
| EKS Control Plane | EKS | 1 cluster | $73 |
| EKS Worker Nodes | EC2 | 3x m6i.xlarge (On-Demand) | $432 |
| ClickHouse | EC2 | 3x r6i.2xlarge (Reserved 1yr) | $780 |
| ClickHouse Storage | EBS gp3 | 3x 500 GB, 6000 IOPS | $180 |
| PostgreSQL | RDS | db.r6g.xlarge Multi-AZ | $550 |
| Redis | ElastiCache | cache.r6g.large + replica | $310 |
| Load Balancer | ALB | 1 ALB + data processing | $50 |
| S3 Storage | S3 | ~500 GB/month (Intelligent-Tiering) | $12 |
| WAF | AWS WAF | 1 Web ACL + rules | $20 |
| Data Transfer | VPC | ~100 GB/month outbound | $9 |
| Secrets Manager | Secrets Manager | 5 secrets | $2 |
| DNS | Route 53 | 1 hosted zone | $1 |
| **Total** | | | **~$2,419/month** |

**Cost optimization options:**
- Reserved Instances or Savings Plans for EC2/RDS: ~30-40% savings
- Spot Instances for EKS worker nodes (non-production): ~60% savings
- S3 lifecycle policies to move older traces to Glacier: reduces S3 costs by ~50%
- Right-sizing after 1 month of production metrics

---

## 11. References

1. LangSmith Self-Hosted Documentation: https://docs.smith.langchain.com/self_hosting (last accessed March 2026)
2. LangSmith Helm Chart: https://github.com/langchain-ai/helm (last accessed March 2026)
3. LangSmith Architecture Overview: https://docs.smith.langchain.com/self_hosting/architecture (last accessed March 2026)
4. AWS EKS Best Practices: https://aws.github.io/aws-eks-best-practices/ (last accessed March 2026)
5. LangSmith Release Notes: https://docs.smith.langchain.com/self_hosting/release_notes (last accessed March 2026)
6. ClickHouse on AWS Documentation: https://clickhouse.com/docs/en/install (last accessed March 2026)
7. Amazon RDS for PostgreSQL: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html (last accessed March 2026)
8. Amazon ElastiCache for Redis: https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/ (last accessed March 2026)
