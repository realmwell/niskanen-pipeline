const pptxgen = require("pptxgenjs");

// ─── Color palette: Ocean Professional ───
const C = {
  navy:     "0A1628",
  ocean:    "1B4965",
  sky:      "5FA8D3",
  ice:      "F0F4F8",
  slate:    "1E293B",
  muted:    "64748B",
  white:    "FFFFFF",
  accent:   "0891B2",  // teal accent
  warn:     "D97706",  // amber for warnings
  green:    "059669",  // success green
  lightGray:"E2E8F0",
};

const FONT = { head: "Georgia", body: "Calibri" };

// ─── Factory helpers (fresh objects each time to avoid PptxGenJS mutation) ───
const cardShadow = () => ({ type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.10 });

let pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Max Realmwell";
pres.title = "LangChain PS Solutions Architect Take-Home";

// ═══════════════════════════════════════════════════════════════
// SLIDE 1: Title
// ═══════════════════════════════════════════════════════════════
let s = pres.addSlide();
s.background = { color: C.navy };
// Accent bar at top (offset slightly so it doesn't clip edge)
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s.addText("Niskanen Center\nResearch-to-Content Pipeline", {
  x: 0.8, y: 1.2, w: 8.4, h: 2.0,
  fontFace: FONT.head, fontSize: 38, color: C.white, bold: true,
  lineSpacingMultiple: 1.15, margin: 0,
});
s.addText("LangChain PS Solutions Architect Take-Home (v4)", {
  x: 0.8, y: 3.2, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 18, color: C.lightGray, margin: 0,
});
s.addText("Max Realmwell  |  March 2026", {
  x: 0.8, y: 4.2, w: 8.4, h: 0.4,
  fontFace: FONT.body, fontSize: 14, color: C.sky, margin: 0,
});

// ═══════════════════════════════════════════════════════════════
// SLIDE 2: Agenda
// ═══════════════════════════════════════════════════════════════
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Agenda", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 32, color: C.slate, bold: true, margin: 0,
});

const agendaItems = [
  { num: "1", title: "LangSmith platform architecture", time: "10 min", desc: "Self-hosted deployment on AWS/EKS" },
  { num: "2", title: "Agent development", time: "15 min", desc: "Multi-agent pipeline with LangGraph" },
  { num: "3", title: "Business value", time: "5 min", desc: "Cost model, KPIs, and competitive positioning" },
  { num: "4", title: "Product feedback", time: "10 min", desc: "Friction log and feature requests" },
];

agendaItems.forEach((item, i) => {
  const y = 1.4 + i * 1.0;
  // Number circle
  s.addShape(pres.shapes.OVAL, { x: 0.8, y: y, w: 0.5, h: 0.5, fill: { color: C.ocean } });
  s.addText(item.num, {
    x: 0.8, y: y, w: 0.5, h: 0.5,
    fontFace: FONT.body, fontSize: 18, color: C.white, bold: true, align: "center", valign: "middle",
  });
  s.addText(item.title, {
    x: 1.5, y: y, w: 5.5, h: 0.3,
    fontFace: FONT.head, fontSize: 18, color: C.slate, bold: true, margin: 0,
  });
  s.addText(item.desc, {
    x: 1.5, y: y + 0.3, w: 5.5, h: 0.25,
    fontFace: FONT.body, fontSize: 13, color: C.muted, margin: 0,
  });
  s.addText(item.time, {
    x: 8.2, y: y, w: 1.2, h: 0.5,
    fontFace: FONT.body, fontSize: 14, color: C.accent, bold: true, align: "right", valign: "middle",
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 1: LangSmith Platform Architecture
// ═══════════════════════════════════════════════════════════════

// Section divider
s = pres.addSlide();
s.background = { color: C.ocean };
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s.addText("Part 1", {
  x: 0.8, y: 1.5, w: 8.4, h: 0.6,
  fontFace: FONT.body, fontSize: 20, color: C.sky, margin: 0,
});
s.addText("LangSmith platform architecture", {
  x: 0.8, y: 2.1, w: 8.4, h: 1.0,
  fontFace: FONT.head, fontSize: 36, color: C.white, bold: true, margin: 0,
});
s.addText("Self-hosted deployment on AWS for InnovateCorp", {
  x: 0.8, y: 3.2, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 16, color: C.lightGray, margin: 0,
});

// ─── Slide 4: Cloud provider rationale ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Why AWS?", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 32, color: C.slate, bold: true, margin: 0,
});

const awsReasons = [
  { title: "Official reference architecture", desc: "LangChain publishes a Helm chart tested on EKS. Other clouds require custom adaptation." },
  { title: "InnovateCorp already runs EKS", desc: "Reusing existing cluster reduces provisioning overhead and training cost." },
  { title: "Broadest managed services", desc: "RDS (Postgres), ElastiCache (Redis), S3 for blob storage. All externalized from LangSmith." },
  { title: "Marketplace availability", desc: "LangSmith license can be procured through AWS Marketplace with consolidated billing." },
];

awsReasons.forEach((item, i) => {
  const y = 1.3 + i * 1.0;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: y, w: 0.06, h: 0.7, fill: { color: C.accent } });
  s.addText(item.title, {
    x: 1.1, y: y, w: 8.0, h: 0.35,
    fontFace: FONT.body, fontSize: 16, color: C.slate, bold: true, margin: 0,
  });
  s.addText(item.desc, {
    x: 1.1, y: y + 0.33, w: 8.0, h: 0.35,
    fontFace: FONT.body, fontSize: 13, color: C.muted, margin: 0,
  });
});

// ─── Slide 5: Platform components ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("LangSmith platform components", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const componentRows = [
  [
    { text: "Service", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13, fontFace: FONT.body } },
    { text: "Purpose", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13, fontFace: FONT.body } },
    { text: "Type", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13, fontFace: FONT.body } },
    { text: "Resources", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13, fontFace: FONT.body } },
  ],
  ["Frontend", "React SPA, user-facing UI", "Stateless", "0.5 vCPU, 512Mi"],
  ["Backend", "Core API, auth, projects", "Stateless", "2 vCPU, 4Gi"],
  ["Platform Backend", "Ingestion, processing", "Stateless", "2 vCPU, 4Gi"],
  ["Queue", "Async task processing", "Stateless", "1 vCPU, 2Gi"],
  ["Playground", "Prompt testing", "Stateless", "1 vCPU, 2Gi"],
  ["ACE Backend", "Automations, evals", "Stateless", "1 vCPU, 2Gi"],
];

s.addTable(componentRows, {
  x: 0.8, y: 1.2, w: 8.4,
  colW: [1.8, 2.8, 1.4, 2.4],
  fontSize: 12, fontFace: FONT.body, color: C.slate,
  border: { pt: 0.5, color: C.lightGray },
  rowH: [0.4, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35],
  autoPage: false,
});

s.addText("All six services are stateless. Horizontal Pod Autoscaler handles load spikes.", {
  x: 0.8, y: 4.7, w: 8.4, h: 0.4,
  fontFace: FONT.body, fontSize: 12, color: C.muted, italic: true, margin: 0,
});

// ─── Slide 6: Storage externalization ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Storage externalization strategy", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const storageCards = [
  { title: "PostgreSQL", aws: "Amazon RDS", note: "Version 14+, automated backups, point-in-time recovery" },
  { title: "Redis", aws: "ElastiCache", note: "Version 5+, caching and session store, cluster mode for scale" },
  { title: "ClickHouse", aws: "EC2 (i3en)", note: "Columnar analytics for traces, NVMe storage for write throughput" },
  { title: "Blob storage", aws: "Amazon S3", note: "Attachments, exports, Intelligent Tiering for cost optimization" },
];

storageCards.forEach((card, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 0.8 + col * 4.4;
  const y = 1.3 + row * 2.0;

  s.addShape(pres.shapes.RECTANGLE, {
    x: x, y: y, w: 4.0, h: 1.6,
    fill: { color: C.white }, shadow: cardShadow(),
  });
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: y, w: 4.0, h: 0.06, fill: { color: C.accent } });
  s.addText(card.title, {
    x: x + 0.2, y: y + 0.15, w: 3.6, h: 0.35,
    fontFace: FONT.body, fontSize: 16, color: C.slate, bold: true, margin: 0,
  });
  s.addText(card.aws, {
    x: x + 0.2, y: y + 0.5, w: 3.6, h: 0.3,
    fontFace: FONT.body, fontSize: 14, color: C.accent, bold: true, margin: 0,
  });
  s.addText(card.note, {
    x: x + 0.2, y: y + 0.85, w: 3.6, h: 0.55,
    fontFace: FONT.body, fontSize: 12, color: C.muted, margin: 0,
  });
});

// ─── Slide 7: Deployment architecture ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Deployment architecture", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

// Simplified architecture diagram using shapes
// Internet -> ALB -> EKS -> External stores
const boxH = 0.45;

// Internet
s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 2.3, w: 1.2, h: boxH, fill: { color: C.muted } });
s.addText("Internet", { x: 0.5, y: 2.3, w: 1.2, h: boxH, fontSize: 11, color: C.white, align: "center", valign: "middle", fontFace: FONT.body });

// Arrow
s.addShape(pres.shapes.LINE, { x: 1.7, y: 2.53, w: 0.5, h: 0, line: { color: C.slate, width: 1.5 } });

// ALB + WAF
s.addShape(pres.shapes.RECTANGLE, { x: 2.2, y: 1.9, w: 1.4, h: 1.3, fill: { color: C.white }, line: { color: C.lightGray, width: 1 } });
s.addText("Public subnet", { x: 2.2, y: 1.9, w: 1.4, h: 0.25, fontSize: 9, color: C.muted, align: "center", fontFace: FONT.body });
s.addShape(pres.shapes.RECTANGLE, { x: 2.35, y: 2.2, w: 1.1, h: boxH, fill: { color: C.sky } });
s.addText("ALB + WAF", { x: 2.35, y: 2.2, w: 1.1, h: boxH, fontSize: 10, color: C.white, align: "center", valign: "middle", fontFace: FONT.body, bold: true });
s.addShape(pres.shapes.RECTANGLE, { x: 2.35, y: 2.75, w: 1.1, h: 0.3, fill: { color: "E0F2FE" } });
s.addText("Route 53", { x: 2.35, y: 2.75, w: 1.1, h: 0.3, fontSize: 9, color: C.ocean, align: "center", valign: "middle", fontFace: FONT.body });

// Arrow
s.addShape(pres.shapes.LINE, { x: 3.6, y: 2.53, w: 0.4, h: 0, line: { color: C.slate, width: 1.5 } });

// EKS cluster
s.addShape(pres.shapes.RECTANGLE, { x: 4.0, y: 1.2, w: 2.6, h: 3.7, fill: { color: C.white }, line: { color: C.accent, width: 1.5 } });
s.addText("EKS cluster (private subnet)", { x: 4.0, y: 1.2, w: 2.6, h: 0.3, fontSize: 10, color: C.accent, align: "center", fontFace: FONT.body, bold: true });

const eksServices = ["Frontend", "Backend", "Platform BE", "Queue", "Playground", "ACE BE"];
eksServices.forEach((svc, i) => {
  const sy = 1.6 + i * 0.5;
  s.addShape(pres.shapes.RECTANGLE, { x: 4.2, y: sy, w: 2.2, h: 0.38, fill: { color: C.ice } });
  s.addText(svc, { x: 4.2, y: sy, w: 2.2, h: 0.38, fontSize: 10, color: C.slate, align: "center", valign: "middle", fontFace: FONT.body });
});

// Arrow to external
s.addShape(pres.shapes.LINE, { x: 6.6, y: 2.53, w: 0.4, h: 0, line: { color: C.slate, width: 1.5 } });

// External stores
s.addShape(pres.shapes.RECTANGLE, { x: 7.0, y: 1.2, w: 2.4, h: 3.7, fill: { color: C.white }, line: { color: C.lightGray, width: 1 } });
s.addText("External stores", { x: 7.0, y: 1.2, w: 2.4, h: 0.3, fontSize: 10, color: C.muted, align: "center", fontFace: FONT.body, bold: true });

const stores = [
  { name: "RDS (Postgres)", color: "3B82F6" },
  { name: "ElastiCache (Redis)", color: "EF4444" },
  { name: "EC2 (ClickHouse)", color: C.warn },
  { name: "S3 (Blob)", color: C.green },
];
stores.forEach((store, i) => {
  const sy = 1.65 + i * 0.85;
  s.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: sy, w: 2.0, h: 0.6, fill: { color: C.ice } });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: sy, w: 0.06, h: 0.6, fill: { color: store.color } });
  s.addText(store.name, { x: 7.4, y: sy, w: 1.8, h: 0.6, fontSize: 10, color: C.slate, valign: "middle", fontFace: FONT.body });
});

// ─── Slide 8: Scaling and security ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Scaling and security", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

// Two columns
s.addText("Scaling strategy", {
  x: 0.8, y: 1.2, w: 4.0, h: 0.4,
  fontFace: FONT.body, fontSize: 16, color: C.ocean, bold: true, margin: 0,
});
s.addText([
  { text: "HPA for stateless services (CPU > 70%)", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "ClickHouse replicas with IOPS monitoring", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "RDS vertical scaling + read replicas", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "ElastiCache cluster mode for Redis", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "S3 Intelligent Tiering for blob costs", options: { bullet: true, fontSize: 13, color: C.slate } },
], { x: 0.8, y: 1.6, w: 4.0, h: 2.5, fontFace: FONT.body, paraSpaceAfter: 8 });

s.addText("Security controls", {
  x: 5.2, y: 1.2, w: 4.0, h: 0.4,
  fontFace: FONT.body, fontSize: 16, color: C.ocean, bold: true, margin: 0,
});
s.addText([
  { text: "IRSA (IAM Roles for Service Accounts)", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "AWS Secrets Manager for credentials", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "WAF rate limiting on ALB", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "TLS everywhere (ACM certificates)", options: { bullet: true, breakLine: true, fontSize: 13, color: C.slate } },
  { text: "OIDC/SSO for user authentication", options: { bullet: true, fontSize: 13, color: C.slate } },
], { x: 5.2, y: 1.6, w: 4.0, h: 2.5, fontFace: FONT.body, paraSpaceAfter: 8 });

// Cost callout
s.addShape(pres.shapes.RECTANGLE, {
  x: 0.8, y: 4.3, w: 8.4, h: 0.9,
  fill: { color: C.white }, shadow: cardShadow(),
});
s.addText("Estimated monthly cost", {
  x: 1.0, y: 4.35, w: 3.0, h: 0.4,
  fontFace: FONT.body, fontSize: 14, color: C.muted, margin: 0,
});
s.addText("~$2,400/mo", {
  x: 1.0, y: 4.7, w: 3.0, h: 0.4,
  fontFace: FONT.head, fontSize: 28, color: C.accent, bold: true, margin: 0,
});
s.addText("EKS $73 + RDS $380 + ElastiCache $260 + ClickHouse $530 + S3 $60 + ALB/misc $190", {
  x: 4.0, y: 4.4, w: 5.0, h: 0.7,
  fontFace: FONT.body, fontSize: 11, color: C.muted, valign: "middle", margin: 0,
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Agent Development
// ═══════════════════════════════════════════════════════════════

// Section divider
s = pres.addSlide();
s.background = { color: C.ocean };
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s.addText("Part 2", {
  x: 0.8, y: 1.5, w: 8.4, h: 0.6,
  fontFace: FONT.body, fontSize: 20, color: C.sky, margin: 0,
});
s.addText("Agent development", {
  x: 0.8, y: 2.1, w: 8.4, h: 1.0,
  fontFace: FONT.head, fontSize: 36, color: C.white, bold: true, margin: 0,
});
s.addText("Multi-agent pipeline with LangGraph, Claude, and AWS Bedrock", {
  x: 0.8, y: 3.2, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 16, color: C.lightGray, margin: 0,
});

// ─── Slide 10: Problem statement ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("The problem", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 32, color: C.slate, bold: true, margin: 0,
});

s.addText("Niskanen Center publishes policy research papers. Each paper needs to become a content package for different audiences and platforms.", {
  x: 0.8, y: 1.2, w: 8.4, h: 0.6,
  fontFace: FONT.body, fontSize: 15, color: C.slate, margin: 0,
});

s.addText("7 output formats per paper:", {
  x: 0.8, y: 2.0, w: 8.4, h: 0.4,
  fontFace: FONT.body, fontSize: 15, color: C.ocean, bold: true, margin: 0,
});

const formats = [
  "Tweet (280 chars max)", "LinkedIn post (400-600 chars)", "Bluesky post (250-300 chars)",
  "Newsletter paragraph (120-150 words)", "Congressional one-pager (5-7 bullets)",
  "Full op-ed draft (700-900 words)", "Media outlet recommendations",
];
s.addText(
  formats.map((f, i) => ({ text: f, options: { bullet: true, breakLine: i < formats.length - 1, fontSize: 13, color: C.slate } })),
  { x: 0.8, y: 2.4, w: 8.4, h: 2.5, fontFace: FONT.body, paraSpaceAfter: 4 }
);

s.addText("Each format has different tone, length, and audience requirements. Manual production takes hours per paper.", {
  x: 0.8, y: 4.8, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 13, color: C.muted, italic: true, margin: 0,
});

// ─── Slide 11: Pipeline topology ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Pipeline topology", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

// Flow diagram using shapes
const nodeH = 0.5;
const nodeW = 1.6;

function addNode(slide, x, y, label, color, textColor) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w: nodeW, h: nodeH, fill: { color }, shadow: cardShadow() });
  slide.addText(label, { x, y, w: nodeW, h: nodeH, fontSize: 10, color: textColor || C.white, align: "center", valign: "middle", fontFace: FONT.body, bold: true });
}

function addArrow(slide, x1, y1, x2, y2) {
  slide.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: C.muted, width: 1.2 } });
}

// Row 1: PDF -> Supervisor
addNode(s, 0.5, 1.4, "PDF Extraction", C.muted, C.white);
addArrow(s, 2.1, 1.65, 2.5, 1.65);
addNode(s, 2.5, 1.4, "Supervisor", C.muted, C.white);
addArrow(s, 4.1, 1.65, 4.5, 1.65);

// Row 2: Research Analyst (standalone)
addNode(s, 4.5, 1.4, "Research Analyst", C.ocean, C.white);

// Arrows from RA to 3 parallel
addArrow(s, 5.3, 1.9, 5.3, 2.2);
addArrow(s, 5.3, 1.9, 3.3, 2.2);
addArrow(s, 5.3, 1.9, 7.3, 2.2);

// Row 3: 3 parallel specialists
addNode(s, 2.5, 2.3, "Audience Mapper", C.sky, C.white);
addNode(s, 4.5, 2.3, "Citation Checker", C.sky, C.white);
addNode(s, 6.5, 2.3, "Style Agent", C.sky, C.white);

// Arrows to Content Writer
addArrow(s, 3.3, 2.8, 4.7, 3.2);
addArrow(s, 5.3, 2.8, 5.3, 3.2);
addArrow(s, 7.3, 2.8, 5.9, 3.2);

// Row 4: Content Writer
addNode(s, 4.5, 3.3, "Content Writer", C.ocean, C.white);
addArrow(s, 5.3, 3.8, 5.3, 4.1);

// Row 5: Human Review
addNode(s, 4.5, 4.2, "Human Review", C.warn, C.white);

// Branch arrows
addArrow(s, 4.5, 4.45, 3.0, 4.45);
addArrow(s, 6.1, 4.45, 7.5, 4.45);

// Outcomes
addNode(s, 1.3, 4.2, "Output (JSON)", C.green, C.white);
addNode(s, 7.5, 4.2, "Escalate", "DC2626", C.white);

// Labels
s.addText("approve", { x: 3.2, y: 4.0, w: 1.0, h: 0.2, fontSize: 9, color: C.green, fontFace: FONT.body, italic: true, margin: 0 });
s.addText("escalate", { x: 6.3, y: 4.0, w: 1.0, h: 0.2, fontSize: 9, color: "DC2626", fontFace: FONT.body, italic: true, margin: 0 });

// Revision loop annotation
s.addText("revise (max 2x)", { x: 6.2, y: 3.5, w: 1.5, h: 0.2, fontSize: 9, color: C.warn, fontFace: FONT.body, italic: true, margin: 0 });

// Legend with color indicators
const legendY = 5.0;
s.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: legendY + 0.05, w: 0.25, h: 0.15, fill: { color: C.muted } });
s.addText("Sequential", { x: 1.15, y: legendY, w: 1.2, h: 0.25, fontFace: FONT.body, fontSize: 10, color: C.slate, margin: 0 });
s.addShape(pres.shapes.RECTANGLE, { x: 2.5, y: legendY + 0.05, w: 0.25, h: 0.15, fill: { color: C.sky } });
s.addText("Parallel", { x: 2.85, y: legendY, w: 1.0, h: 0.25, fontFace: FONT.body, fontSize: 10, color: C.slate, margin: 0 });
s.addShape(pres.shapes.RECTANGLE, { x: 4.0, y: legendY + 0.05, w: 0.25, h: 0.15, fill: { color: C.warn } });
s.addText("Human review", { x: 4.35, y: legendY, w: 1.3, h: 0.25, fontFace: FONT.body, fontSize: 10, color: C.slate, margin: 0 });
s.addShape(pres.shapes.RECTANGLE, { x: 5.8, y: legendY + 0.05, w: 0.25, h: 0.15, fill: { color: C.green } });
s.addText("Terminal", { x: 6.15, y: legendY, w: 1.0, h: 0.25, fontFace: FONT.body, fontSize: 10, color: C.slate, margin: 0 });

// ─── Slide 12: Why agents? ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Why agents, not a single prompt?", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const whyItems = [
  { title: "Different tools per task", desc: "Citation Checker needs web search (Tavily). Style Agent needs vector retrieval (ChromaDB). A single prompt can't use both." },
  { title: "Specialized system prompts", desc: "A fact-checker's instructions differ from a communications writer's. Mixing them in one prompt degrades both." },
  { title: "Parallelism", desc: "Three specialists run simultaneously after Research Analyst finishes. A single prompt would process them sequentially." },
  { title: "Independent failure", desc: "If Citation Checker's web search fails, the other agents still complete. Errors accumulate without blocking." },
  { title: "Evaluation per agent", desc: "You can score each agent's output independently. When argument fidelity drops, you know it's the Content Writer, not the Research Analyst." },
];

whyItems.forEach((item, i) => {
  const y = 1.2 + i * 0.85;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: y, w: 0.06, h: 0.6, fill: { color: C.accent } });
  s.addText(item.title, {
    x: 1.1, y: y, w: 8.0, h: 0.3,
    fontFace: FONT.body, fontSize: 14, color: C.slate, bold: true, margin: 0,
  });
  s.addText(item.desc, {
    x: 1.1, y: y + 0.28, w: 8.0, h: 0.35,
    fontFace: FONT.body, fontSize: 12, color: C.muted, margin: 0,
  });
});

// ─── Slide 13: Design decisions ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Design decisions", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const decisions = [
  { decision: "Model selection", detail: "Haiku for extraction (fast, cheap), Sonnet for synthesis (complex multi-format generation)" },
  { decision: "Structured output", detail: "Pydantic models with .with_structured_output() on every agent. No free-text parsing." },
  { decision: "Style retrieval", detail: "ChromaDB with all-MiniLM-L6-v2. Real Niskanen articles, not abstract instructions." },
  { decision: "Error accumulator", detail: "Annotated[list[str], operator.add] reducer. Parallel agents append errors without conflicts." },
  { decision: "Configurable models", detail: "HAIKU_MODEL_ID and SONNET_MODEL_ID env vars. Switch models without code changes." },
];

const decisionRows = [
  [
    { text: "Decision", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "Implementation", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
  ],
  ...decisions.map(d => [
    { text: d.decision, options: { bold: true, fontSize: 12 } },
    { text: d.detail, options: { fontSize: 12 } },
  ]),
];

s.addTable(decisionRows, {
  x: 0.8, y: 1.2, w: 8.4,
  colW: [2.4, 6.0],
  fontFace: FONT.body, color: C.slate,
  border: { pt: 0.5, color: C.lightGray },
  rowH: [0.4, 0.5, 0.5, 0.5, 0.5, 0.5],
  autoPage: false,
});

// ─── Slide 14: Human-in-the-loop ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Human-in-the-loop review", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

s.addText("LangGraph's interrupt() pauses the graph at a checkpoint. The reviewer sees the full content package and chooses one of three actions:", {
  x: 0.8, y: 1.2, w: 8.4, h: 0.6,
  fontFace: FONT.body, fontSize: 14, color: C.slate, margin: 0,
});

const reviewActions = [
  { action: "Approve", desc: "Content is ready. Pipeline saves to JSON and ends.", color: C.green },
  { action: "Revise", desc: "Feedback goes back to Content Writer. Up to 2 revision rounds.", color: C.warn },
  { action: "Escalate", desc: "Flags for senior review. Pipeline ends without publishing.", color: "DC2626" },
];

reviewActions.forEach((item, i) => {
  const x = 0.8 + i * 3.0;
  s.addShape(pres.shapes.RECTANGLE, {
    x: x, y: 2.1, w: 2.7, h: 2.2,
    fill: { color: C.white }, shadow: cardShadow(),
  });
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: 2.1, w: 2.7, h: 0.06, fill: { color: item.color } });
  s.addText(item.action, {
    x: x + 0.2, y: 2.3, w: 2.3, h: 0.4,
    fontFace: FONT.body, fontSize: 18, color: item.color, bold: true, margin: 0,
  });
  s.addText(item.desc, {
    x: x + 0.2, y: 2.8, w: 2.3, h: 1.2,
    fontFace: FONT.body, fontSize: 13, color: C.slate, margin: 0,
  });
});

s.addText("The checkpointer (MemorySaver for dev, PostgresSaver for production) preserves state across the interrupt. Resume with Command(resume={action, feedback}).", {
  x: 0.8, y: 4.6, w: 8.4, h: 0.6,
  fontFace: FONT.body, fontSize: 12, color: C.muted, italic: true, margin: 0,
});

// ─── Slide 15: Evaluation framework ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Evaluation framework", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const evalRows = [
  [
    { text: "Evaluator", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "Type", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "What it measures", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
  ],
  [
    { text: "argument_fidelity", options: { bold: true, fontSize: 12, fontFace: "Consolas" } },
    "LLM-as-judge",
    "Does the tweet preserve the paper's thesis without distortion?",
  ],
  [
    { text: "fact_grounding_rate", options: { bold: true, fontSize: 12, fontFace: "Consolas" } },
    "Deterministic",
    "What fraction of verified claims appear in the content?",
  ],
  [
    { text: "tone_calibration", options: { bold: true, fontSize: 12, fontFace: "Consolas" } },
    "LLM-as-judge",
    "Is the one-pager jargon-free enough for congressional staff?",
  ],
  [
    { text: "format_compliance", options: { bold: true, fontSize: 12, fontFace: "Consolas" } },
    "Deterministic",
    "Character limits, word counts, bullet counts, Bottom line present?",
  ],
];

s.addTable(evalRows, {
  x: 0.8, y: 1.2, w: 8.4,
  colW: [2.2, 1.6, 4.6],
  fontFace: FONT.body, color: C.slate, fontSize: 12,
  border: { pt: 0.5, color: C.lightGray },
  rowH: [0.4, 0.55, 0.55, 0.55, 0.55],
  autoPage: false,
});

s.addText("Test dataset: 5 real Niskanen papers across immigration, fiscal policy, healthcare, and regulation domains.", {
  x: 0.8, y: 4.1, w: 8.4, h: 0.4,
  fontFace: FONT.body, fontSize: 13, color: C.muted, margin: 0,
});

s.addText("Two LLM-as-judge evaluators use Haiku for cost efficiency. Two deterministic evaluators use regex and string matching.", {
  x: 0.8, y: 4.5, w: 8.4, h: 0.4,
  fontFace: FONT.body, fontSize: 13, color: C.muted, margin: 0,
});

// ─── Slide 16: LangSmith tracing ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("LangSmith tracing", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

s.addText("Every pipeline run is auto-traced. Two environment variables, zero instrumentation code.", {
  x: 0.8, y: 1.1, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 15, color: C.slate, margin: 0,
});

const tracePoints = [
  { title: "Full graph timeline", desc: "See which agents ran in parallel vs. sequentially, with exact timing." },
  { title: "Per-agent token counts", desc: "Research Analyst uses the most input tokens (full paper). Content Writer uses the most output tokens (7 formats)." },
  { title: "Prompt inspection", desc: "Click into any agent to see the exact system prompt, user message, and structured output." },
  { title: "Error propagation", desc: "If Citation Checker fails on a Tavily search, you see the error in the trace alongside successful agents." },
  { title: "Cost per run", desc: "Token counts translate directly to cost. Roughly 2 cents per paper with Haiku." },
];

tracePoints.forEach((item, i) => {
  const y = 1.7 + i * 0.75;
  s.addShape(pres.shapes.OVAL, { x: 0.8, y: y + 0.05, w: 0.2, h: 0.2, fill: { color: C.accent } });
  s.addText(item.title, {
    x: 1.2, y: y, w: 3.0, h: 0.3,
    fontFace: FONT.body, fontSize: 13, color: C.slate, bold: true, margin: 0,
  });
  s.addText(item.desc, {
    x: 1.2, y: y + 0.28, w: 8.0, h: 0.35,
    fontFace: FONT.body, fontSize: 12, color: C.muted, margin: 0,
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Business Value
// ═══════════════════════════════════════════════════════════════

s = pres.addSlide();
s.background = { color: C.ocean };
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s.addText("Part 3", {
  x: 0.8, y: 1.5, w: 8.4, h: 0.6,
  fontFace: FONT.body, fontSize: 20, color: C.sky, margin: 0,
});
s.addText("Business value", {
  x: 0.8, y: 2.1, w: 8.4, h: 1.0,
  fontFace: FONT.head, fontSize: 36, color: C.white, bold: true, margin: 0,
});
s.addText("Cost model, KPIs, and competitive positioning", {
  x: 0.8, y: 3.2, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 16, color: C.lightGray, margin: 0,
});

// ─── Slide 18: Cost model ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Cost per paper", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

// Big number callout
s.addShape(pres.shapes.RECTANGLE, {
  x: 0.8, y: 1.2, w: 3.5, h: 1.8,
  fill: { color: C.white }, shadow: cardShadow(),
});
s.addText("~$0.02", {
  x: 0.8, y: 1.3, w: 3.5, h: 1.0,
  fontFace: FONT.head, fontSize: 54, color: C.accent, bold: true, align: "center", margin: 0,
});
s.addText("per paper (all agents)", {
  x: 0.8, y: 2.2, w: 3.5, h: 0.4,
  fontFace: FONT.body, fontSize: 14, color: C.muted, align: "center", margin: 0,
});

// Breakdown
const costRows = [
  [
    { text: "Agent", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 12 } },
    { text: "Input tokens", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 12 } },
    { text: "Output tokens", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 12 } },
    { text: "Cost", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 12 } },
  ],
  ["Research Analyst", "~8,000", "~500", "$0.003"],
  ["Audience Mapper", "~600", "~300", "$0.001"],
  ["Citation Checker", "~3,000", "~800", "$0.002"],
  ["Style Agent", "~2,000", "~400", "$0.001"],
  ["Content Writer", "~4,000", "~3,000", "$0.005"],
  [{ text: "Total", options: { bold: true } }, { text: "~17,600", options: { bold: true } }, { text: "~5,000", options: { bold: true } }, { text: "$0.011", options: { bold: true } }],
];

s.addTable(costRows, {
  x: 4.8, y: 1.2, w: 4.6,
  colW: [1.5, 1.1, 1.1, 0.9],
  fontFace: FONT.body, color: C.slate, fontSize: 11,
  border: { pt: 0.5, color: C.lightGray },
  autoPage: false,
});

s.addText("+ Tavily search: ~$0.01/paper (5-10 queries at free tier rate)", {
  x: 4.8, y: 4.0, w: 4.6, h: 0.3,
  fontFace: FONT.body, fontSize: 11, color: C.muted, margin: 0,
});

s.addText("At 100 papers/month: roughly $2 in LLM costs. The human reviewer's time is the real expense.", {
  x: 0.8, y: 4.6, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 13, color: C.slate, italic: true, margin: 0,
});

// ─── Slide 19: KPIs ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("KPI impact", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const kpis = [
  { metric: "Time per paper", before: "4-6 hours", after: "30 min review", improvement: "~90% reduction" },
  { metric: "Format consistency", before: "Variable", after: "Structured output", improvement: "Measurable via evaluators" },
  { metric: "Fact accuracy", before: "Manual checking", after: "Automated verification", improvement: "Every claim scored" },
  { metric: "Cost per paper", before: "$200+ (staff time)", after: "~$0.02 + review time", improvement: "99% LLM cost reduction" },
];

const kpiRows = [
  [
    { text: "Metric", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "Before", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "After", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "Impact", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
  ],
  ...kpis.map(k => [
    { text: k.metric, options: { bold: true, fontSize: 12 } },
    k.before,
    k.after,
    { text: k.improvement, options: { color: C.green, bold: true, fontSize: 12 } },
  ]),
];

s.addTable(kpiRows, {
  x: 0.8, y: 1.2, w: 8.4,
  colW: [2.1, 2.0, 2.1, 2.2],
  fontFace: FONT.body, color: C.slate, fontSize: 12,
  border: { pt: 0.5, color: C.lightGray },
  rowH: [0.4, 0.5, 0.5, 0.5, 0.5],
  autoPage: false,
});

// ─── Slide 20: Competitive positioning ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Why LangGraph over alternatives?", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const compRows = [
  [
    { text: "Framework", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "Strengths", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
    { text: "Gaps for this use case", options: { fill: { color: C.ocean }, color: C.white, bold: true, fontSize: 13 } },
  ],
  [
    { text: "LangGraph", options: { bold: true, color: C.accent, fontSize: 12 } },
    "Graph topology, interrupt/resume, checkpointing, LangSmith integration",
    "Fan-out docs could be clearer; Bedrock structured output can be flaky",
  ],
  [
    { text: "CrewAI", options: { bold: true, fontSize: 12 } },
    "Simple multi-agent setup, role-based agents",
    "No built-in graph topology, limited checkpointing, no interrupt/resume",
  ],
  [
    { text: "AutoGen", options: { bold: true, fontSize: 12 } },
    "Conversational agents, group chat patterns",
    "Designed for agent conversations, not structured pipelines with fan-out",
  ],
  [
    { text: "OpenAI Agents SDK", options: { bold: true, fontSize: 12 } },
    "Simple tool-use agents, hosted by OpenAI",
    "No graph topology, no human-in-the-loop interrupt, vendor lock-in",
  ],
];

s.addTable(compRows, {
  x: 0.5, y: 1.2, w: 9.0,
  colW: [1.7, 3.5, 3.8],
  fontFace: FONT.body, color: C.slate, fontSize: 11,
  border: { pt: 0.5, color: C.lightGray },
  rowH: [0.4, 0.6, 0.55, 0.55, 0.55],
  autoPage: false,
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Product Feedback
// ═══════════════════════════════════════════════════════════════

s = pres.addSlide();
s.background = { color: C.ocean };
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s.addText("Part 4", {
  x: 0.8, y: 1.5, w: 8.4, h: 0.6,
  fontFace: FONT.body, fontSize: 20, color: C.sky, margin: 0,
});
s.addText("Product feedback", {
  x: 0.8, y: 2.1, w: 8.4, h: 1.0,
  fontFace: FONT.head, fontSize: 36, color: C.white, bold: true, margin: 0,
});
s.addText("Friction log highlights and feature requests", {
  x: 0.8, y: 3.2, w: 8.4, h: 0.5,
  fontFace: FONT.body, fontSize: 16, color: C.lightGray, margin: 0,
});

// ─── Slide 22: LangChain friction ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("LangChain friction", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const lcFriction = [
  { issue: "Package version confusion", detail: "Prompt spec referenced versions that don't exist on PyPI (langchain>=1.2.10). Had to look up real versions.", time: "10 min" },
  { issue: "Tavily import deprecation", detail: "langchain-community.tools.tavily_search is deprecated. New package (langchain-tavily) not prominent in docs.", time: "5 min" },
  { issue: "Structured output failures on Bedrock", detail: "ChatBedrockConverse.with_structured_output() sometimes returns malformed JSON. No built-in retry.", time: "30 min" },
  { issue: "Bedrock model ID format", detail: "Inference profile IDs (us. prefix) required but not documented in langchain-aws.", time: "20 min" },
];

lcFriction.forEach((item, i) => {
  const y = 1.1 + i * 1.1;
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y: y, w: 8.4, h: 0.9,
    fill: { color: C.white }, shadow: cardShadow(),
  });
  s.addText(item.issue, {
    x: 1.0, y: y + 0.05, w: 6.5, h: 0.3,
    fontFace: FONT.body, fontSize: 14, color: C.slate, bold: true, margin: 0,
  });
  s.addText(item.detail, {
    x: 1.0, y: y + 0.38, w: 6.5, h: 0.4,
    fontFace: FONT.body, fontSize: 11, color: C.muted, margin: 0,
  });
  s.addText(item.time, {
    x: 7.8, y: y + 0.05, w: 1.2, h: 0.9,
    fontFace: FONT.body, fontSize: 13, color: C.warn, bold: true, align: "right", valign: "middle", margin: 0,
  });
});

// ─── Slide 23: LangGraph friction ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("LangGraph friction", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const lgFriction = [
  { issue: "Fan-out with data dependencies (biggest time sink)", detail: "Docs describe fan-out but don't warn that parallel nodes can't read each other's state updates. Discovered the race condition at runtime.", time: "45 min" },
  { issue: "stream_mode='updates' yields non-dict events", detail: "Interrupt events aren't dicts, which crashes dict unpacking. Not documented.", time: "15 min" },
  { issue: "Command(resume=...) pattern", detail: "Relationship between interrupt() return value and Command(resume=...) is buried in reference docs, not the tutorial.", time: "10 min" },
];

lgFriction.forEach((item, i) => {
  const y = 1.1 + i * 1.4;
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y: y, w: 8.4, h: 1.1,
    fill: { color: C.white }, shadow: cardShadow(),
  });
  s.addText(item.issue, {
    x: 1.0, y: y + 0.08, w: 6.5, h: 0.35,
    fontFace: FONT.body, fontSize: 14, color: C.slate, bold: true, margin: 0,
  });
  s.addText(item.detail, {
    x: 1.0, y: y + 0.45, w: 6.5, h: 0.5,
    fontFace: FONT.body, fontSize: 11, color: C.muted, margin: 0,
  });
  s.addText(item.time, {
    x: 7.8, y: y + 0.08, w: 1.2, h: 1.0,
    fontFace: FONT.body, fontSize: 13, color: C.warn, bold: true, align: "right", valign: "middle", margin: 0,
  });
});

// ─── Slide 24: Feature requests ───
s = pres.addSlide();
s.background = { color: C.ice };
s.addText("Feature requests", {
  x: 0.8, y: 0.4, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 28, color: C.slate, bold: true, margin: 0,
});

const requests = [
  { req: "with_structured_output() should support max_retries", desc: "Bedrock structured output failures are common. Built-in retry with backoff would save everyone the same workaround.", fw: "LangChain" },
  { req: "Fan-out docs: add dependency warning", desc: "A callout box saying 'nodes in the same super-step cannot see each other's state' would have saved me 45 minutes.", fw: "LangGraph" },
  { req: "Evaluation tutorial: complete end-to-end example", desc: "Show the full data flow from dataset -> pipeline run -> evaluator(run, example) with annotations on what each parameter contains.", fw: "LangSmith" },
  { req: "Auto-detect Bedrock inference profile IDs", desc: "langchain-aws could add the 'us.' prefix automatically when it detects a raw Bedrock model ID.", fw: "langchain-aws" },
];

requests.forEach((item, i) => {
  const y = 1.1 + i * 1.1;
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y: y, w: 8.4, h: 0.9,
    fill: { color: C.white }, shadow: cardShadow(),
  });
  s.addText(item.req, {
    x: 1.0, y: y + 0.05, w: 7.0, h: 0.3,
    fontFace: FONT.body, fontSize: 14, color: C.slate, bold: true, margin: 0,
  });
  s.addText(item.desc, {
    x: 1.0, y: y + 0.38, w: 7.0, h: 0.4,
    fontFace: FONT.body, fontSize: 11, color: C.muted, margin: 0,
  });
  s.addText(item.fw, {
    x: 7.8, y: y + 0.05, w: 1.2, h: 0.9,
    fontFace: FONT.body, fontSize: 11, color: C.accent, bold: true, align: "right", valign: "middle", margin: 0,
  });
});

// ═══════════════════════════════════════════════════════════════
// SLIDE 25: Summary
// ═══════════════════════════════════════════════════════════════
s = pres.addSlide();
s.background = { color: C.navy };
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s.addText("Summary", {
  x: 0.8, y: 0.5, w: 8.4, h: 0.7,
  fontFace: FONT.head, fontSize: 32, color: C.white, bold: true, margin: 0,
});

const summaryItems = [
  "LangSmith self-hosted on AWS: 6 stateless services, externalized storage, ~$2,400/mo",
  "Multi-agent pipeline: 6 agents, fan-out parallelism, human-in-the-loop review",
  "4 custom evaluators: 2 LLM-as-judge, 2 deterministic, scored on real Niskanen papers",
  "Cost: roughly 2 cents per paper in LLM costs",
  "Friction log: ~3 hours total, biggest issues in fan-out docs and Bedrock model access",
];

s.addText(
  summaryItems.map((item, i) => ({
    text: item,
    options: { bullet: true, breakLine: i < summaryItems.length - 1, fontSize: 15, color: C.white },
  })),
  { x: 0.8, y: 1.4, w: 8.4, h: 3.2, fontFace: FONT.body, paraSpaceAfter: 14 }
);

s.addText("github.com/realmwell/niskanen-pipeline", {
  x: 0.8, y: 4.8, w: 8.4, h: 0.4,
  fontFace: FONT.body, fontSize: 16, color: C.accent, margin: 0,
});

// ─── Add slide numbers to all slides ───
pres.slides.forEach((slide, idx) => {
  const isDark = [0, 2, 8, 16, 20, 24].includes(idx); // title, section dividers, summary
  slide.addText(`${idx + 1}`, {
    x: 9.1, y: 5.25, w: 0.6, h: 0.3,
    fontFace: FONT.body, fontSize: 10,
    color: isDark ? C.sky : C.muted,
    align: "right", valign: "middle", margin: 0,
  });
});

// ─── Write file ───
const outputPath = process.argv[2] || "langchain-takehome.pptx";
pres.writeFile({ fileName: outputPath }).then(() => {
  console.log(`Presentation saved to: ${outputPath}`);
  console.log(`Total slides: 25`);
});
