import { useState, useCallback, useEffect } from "react";
import {
  FileText,
  Search,
  Users,
  CheckCircle,
  Pen,
  ArrowRight,
  Play,
  BookOpen,
  BarChart3,
  Shield,
  Palette,
  Zap,
  DollarSign,
  Eye,
  Sun,
  Moon,
  Home,
  Workflow,
  Info,
  Github,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Clock,
  Star,
  Activity,
  MessageSquare,
  RefreshCw,
  Send,
  ArrowLeft,
  Loader2,
  Target,
  XCircle,
} from "lucide-react";

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const STEPS = [
  "Fetch Article",
  "Research Analyst",
  "Audience Mapper",
  "Citation Checker",
  "Style Analyst",
  "Content Writer",
  "Review",
];

const FORMATS = [
  { key: "twitter_post", label: "Twitter", limit: 280, unit: "chars" },
  { key: "linkedin_post", label: "LinkedIn", limit: null },
  { key: "bluesky_post", label: "Bluesky", limit: 300, unit: "chars" },
  { key: "newsletter_paragraph", label: "Newsletter", limit: 165, unit: "words" },
  { key: "congressional_one_pager", label: "One-Pager", limit: null },
  { key: "full_oped", label: "Op-Ed", limit: null },
  { key: "media_outlet_recommendations", label: "Media Recs", limit: null },
];

function measure(text, unit) {
  if (!text || typeof text !== "string") return 0;
  if (unit === "words") return text.trim().split(/\s+/).length;
  return text.length;
}

/* Format complex content fields (one-pager, media recs) for display */
function formatForDisplay(value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  // Congressional one-pager: {title, "The Problem": [...], "The Evidence": [...], ...}
  if (value.title || value["The Problem"] || value["the_problem"]) {
    const lines = [];
    const title = value.title || value.Title || "";
    if (title) lines.push(title, "");

    const sections = [
      ["The Problem", value["The Problem"] || value["the_problem"]],
      ["The Evidence", value["The Evidence"] || value["the_evidence"]],
      ["The Proposal", value["The Proposal"] || value["the_proposal"] || value["Key Recommendations"] || value["key_recommendations"]],
    ];

    for (const [heading, items] of sections) {
      if (!items) continue;
      lines.push(heading.toUpperCase());
      const arr = Array.isArray(items) ? items : [items];
      for (const item of arr) lines.push(`  \u2022 ${item}`);
      lines.push("");
    }

    const bottom = value["Bottom line:"] || value["bottom_line"] || value["Bottom line"] || "";
    if (bottom) lines.push(`Bottom line: ${bottom}`);
    return lines.join("\n");
  }

  // Media outlet recommendations: {PRIMARY TARGETS: [...], SECONDARY TARGETS: [...], ...}
  if (value["PRIMARY TARGETS"] || value["primary_targets"]) {
    const lines = [];
    const primary = value["PRIMARY TARGETS"] || value["primary_targets"] || [];
    if (primary.length) {
      lines.push("PRIMARY TARGETS");
      for (const item of primary) {
        if (typeof item === "string") {
          lines.push(`  \u2022 ${item}`);
        } else {
          lines.push(`  \u2022 ${item.outlet || item.name}: ${item.rationale || item.reason || ""}`);
        }
      }
      lines.push("");
    }

    const secondary = value["SECONDARY TARGETS"] || value["secondary_targets"] || [];
    if (secondary.length) {
      lines.push("SECONDARY TARGETS");
      for (const item of secondary) {
        if (typeof item === "string") {
          lines.push(`  \u2022 ${item}`);
        } else {
          lines.push(`  \u2022 ${item.outlet || item.name}: ${item.rationale || item.reason || ""}`);
        }
      }
      lines.push("");
    }

    const beats = value["BEAT REPORTERS"] || value["beat_reporters"] || [];
    if (beats.length || typeof beats === "string") {
      lines.push("BEAT REPORTERS");
      const arr = Array.isArray(beats) ? beats : [beats];
      for (const b of arr) lines.push(`  \u2022 ${b}`);
      lines.push("");
    }

    const timing = value["TIMING"] || value["timing"] || "";
    if (timing) lines.push(`TIMING: ${timing}`);
    return lines.join("\n");
  }

  // Fallback: pretty-print JSON
  return JSON.stringify(value, null, 2);
}

/* ========================================================================== */
/*  Pipeline — real article fetch + multi-agent pipeline via backend           */
/* ========================================================================== */

// In dev, Vite proxies /api to localhost:3002.
// In production, call the API Gateway directly.
const API_BASE = import.meta.env.PROD
  ? "https://v1tofkjpy6.execute-api.us-east-1.amazonaws.com"
  : "";

async function runPipeline(url, onStep, onDone, onError) {
  try {
    onStep(1); // Fetch Article
    await pause(400);

    // Fire the real API call (multi-agent pipeline runs on backend)
    const apiPromise = fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    onStep(2); // Research Analyst
    await pause(1200);
    onStep(3); // Audience Mapper
    await pause(600);
    onStep(4); // Citation Checker

    // Wait for the actual API response
    const res = await apiPromise;
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Pipeline failed");
    }

    onStep(5); // Style Analyst
    await pause(300);
    onStep(6); // Content Writer
    await pause(200);

    // Pass the FULL response (intermediate + content)
    onDone(data);
  } catch (err) {
    onError(err.message);
  }
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ========================================================================== */
/*  Shared Components                                                          */
/* ========================================================================== */

function Nav({ page, setPage, dark, setDark }) {
  const links = [
    { id: "home", label: "Home", icon: Home },
    { id: "pipeline", label: "Pipeline", icon: Workflow },
    { id: "evals", label: "Evals", icon: BarChart3 },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="nav-brand" onClick={() => setPage("home")}>
          NISKANEN
        </span>
        <div className="nav-links">
          {links.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link${page === id ? " active" : ""}`}
              onClick={() => setPage(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="nav-right">
          <button
            className="theme-btn"
            onClick={() => setDark(!dark)}
            aria-label="Toggle theme"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>Niskanen Content Pipeline by Max Greenberg. LangChain PS Take-Home, March 2026.</span>
        <div className="footer-links">
          <a
            href="https://github.com/realmwell/niskanen-pipeline"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ========================================================================== */
/*  Landing Page Components                                                    */
/* ========================================================================== */

function MetricHighlight({ value, label, sublabel }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-sub">{sublabel}</div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, accentColor, onAction, actionLabel }) {
  return (
    <div className="feature-card anim-fade-up">
      <div className={`feature-icon ${accentColor}`}>
        <Icon size={20} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="feature-link" onClick={onAction}>
        {actionLabel} <ArrowRight size={14} />
      </button>
    </div>
  );
}

function DataFlowDiagram() {
  const steps = [
    { label: "PDF Upload", detail: "Extract text from policy paper", color: "var(--teal)", dot: "var(--teal)" },
    { label: "Supervisor", detail: "Validate extraction, route pipeline", color: "var(--blue)", dot: "var(--blue)" },
    { label: "Research Analyst", detail: "Thesis, evidence, implications", color: "var(--green)", dot: "var(--green)" },
    { label: "Parallel Agents", detail: "Audience + Citations + Style (concurrent)", color: "var(--amber)", dot: "var(--amber)" },
    { label: "Content Writer", detail: "Claude Sonnet generates 7 formats", color: "var(--blue)", dot: "var(--blue)" },
    { label: "Human Review", detail: "Approve, revise, or escalate", color: "var(--teal)", dot: "var(--teal)" },
  ];

  return (
    <div className="flow-timeline">
      <div className="flow-line" />
      {steps.map((s) => (
        <div key={s.label} className="flow-step">
          <div className="flow-dot" style={{ background: s.dot }} />
          <div className="flow-step-bar" style={{ borderColor: s.color }}>
            <p>{s.label}</p>
            <p>{s.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArchLayer({ label, labelColor, borderColor, services }) {
  return (
    <div className="arch-layer" style={{ borderColor }}>
      <span className="arch-label" style={{ color: labelColor }}>{label}</span>
      <div className="arch-services">
        {services.map((s) => (
          <div key={s.name} className="arch-service">
            <div className="emoji">{s.icon}</div>
            <div className="name">{s.name}</div>
            <div className="desc">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Landing Page                                                               */
/* ========================================================================== */

function LandingPage({ setPage }) {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-inner">
          <div className="anim-fade-up">
            <span className="hero-badge">Powered by LangChain</span>
          </div>
          <h1 className="anim-fade-up d1">
            Niskanen Content Pipeline
          </h1>
          <p className="hero-desc anim-fade-up d2">
            Convert policy research papers into publication-ready content packages
            across seven formats. Six AI agents analyze, fact-check, match style, and
            write -- with human review before anything ships.
          </p>
          <div className="hero-buttons anim-fade-up d3">
            <button className="btn-hero btn-hero-primary" onClick={() => setPage("pipeline")}>
              <Play size={16} /> Run the Pipeline
            </button>
            <button className="btn-hero btn-hero-ghost" onClick={() => {
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
            }}>
              How It Works <ArrowRight size={16} />
            </button>
          </div>

          <div className="hero-models anim-fade d4">
            <span className="label">Built with</span>
            <span className="model">LangGraph</span>
            <span className="sep">|</span>
            <span className="model">Claude 3.5</span>
            <span className="sep">|</span>
            <span className="model">LangSmith</span>
          </div>

          <div className="hero-meta anim-fade d5">
            <span>Prepared by Max Greenberg</span>
            <span>|</span>
            <span>LangChain PS Take-Home</span>
            <span>|</span>
            <span>March 2026</span>
          </div>
        </div>
      </section>

      {/* Metrics Row */}
      <section className="metrics-row">
        <div className="metrics-grid">
          <MetricHighlight value="7" label="Output Formats" sublabel="Tweet to full op-ed" />
          <MetricHighlight value="6" label="AI Agents" sublabel="Parallel execution" />
          <MetricHighlight value="<$0.05" label="Per Paper" sublabel="Claude API cost" />
          <MetricHighlight value="HITL" label="Human Review" sublabel="Approve before publish" />
        </div>
      </section>

      {/* Feature Cards */}
      <section className="section">
        <div className="container">
          <div className="section-header anim-fade-up">
            <h2>Six agents. One pipeline.</h2>
            <p>
              Each paper flows through specialized agents that extract research,
              map audiences, verify facts, match Niskanen's voice, and generate
              content -- all coordinated by LangGraph.
            </p>
          </div>
          <div className="features-grid">
            <FeatureCard
              icon={Search}
              title="Research Analysis"
              description="Extracts thesis, key evidence, policy implications, and domain classification from the full paper text using Claude Haiku."
              accentColor="amber"
              actionLabel="Learn more"
              onAction={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            />
            <FeatureCard
              icon={Shield}
              title="Fact Checking"
              description="Pulls statistical claims from the research summary and verifies each against web sources via Tavily search. Flags unverified claims."
              accentColor="blue"
              actionLabel="Learn more"
              onAction={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            />
            <FeatureCard
              icon={Palette}
              title="Style Matching"
              description="Retrieves existing Niskanen publications from ChromaDB and extracts writing patterns -- sentence length, rhetorical moves, voice."
              accentColor="teal"
              actionLabel="Learn more"
              onAction={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            />
            <FeatureCard
              icon={Pen}
              title="Content Writing"
              description="Claude Sonnet synthesizes all agent outputs into seven publication-ready formats, respecting fact-check results and audience tone."
              accentColor="green"
              actionLabel="Try the pipeline"
              onAction={() => setPage("pipeline")}
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="section section-alt">
        <div className="container">
          <div className="flow-section">
            <div className="flow-left">
              <span className="section-badge badge-teal">Data Flow</span>
              <h2 className="anim-fade-up d1">Paper to Content in Six Steps</h2>
              <p className="anim-fade-up d2">
                Every PDF flows through extraction, analysis, parallel specialist
                agents, and content generation. The human-in-the-loop checkpoint
                ensures nothing publishes without editorial sign-off.
              </p>
              <div className="code-block anim-fade-up d3">
                <span className="comment">{"// LangGraph pipeline topology"}</span><br />
                <span className="func">pdf_extract</span> {"-> "}
                <span className="func">supervisor</span><br />
                {"  -> "}
                <span className="keyword">fan_out</span>{"("}<br />
                {"       "}
                <span className="func">research_analyst</span>{","}<br />
                {"       "}
                <span className="func">audience_mapper</span>{","}<br />
                {"       "}
                <span className="func">citation_checker</span>{","}<br />
                {"       "}
                <span className="func">style_agent</span><br />
                {"     )  -> "}
                <span className="keyword">fan_in</span><br />
                {"  -> "}
                <span className="func">content_writer</span> {"-> "}
                <span className="keyword">interrupt</span>{"()  "}
                <span className="comment">{"// human review"}</span><br />
                {"  -> "}
                <span className="func">output</span>
              </div>
            </div>
            <div style={{ paddingTop: "2rem" }}>
              <DataFlowDiagram />
            </div>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="section">
        <div className="container">
          <div className="section-header anim-fade-up">
            <h2>Stack Architecture</h2>
            <p>
              Every service runs on a free tier or local runtime.
              Zero idle cost. The production path replaces local stores
              with AWS managed services.
            </p>
          </div>
          <ArchLayer
            label="Orchestration"
            labelColor="var(--teal)"
            borderColor="var(--teal)"
            services={[
              { icon: "\u{1F9E9}", name: "LangGraph", desc: "StateGraph + fan-out" },
              { icon: "\u{1F504}", name: "MemorySaver", desc: "Checkpointer" },
              { icon: "\u{270B}", name: "interrupt()", desc: "Human-in-the-loop" },
              { icon: "\u{2601}\u{FE0F}", name: "AWS Lambda", desc: "Serverless deploy" },
            ]}
          />
          <ArchLayer
            label="AI Models"
            labelColor="var(--green)"
            borderColor="var(--green)"
            services={[
              { icon: "\u{1F9E0}", name: "Claude Haiku", desc: "Analysis agents" },
              { icon: "\u{270D}\u{FE0F}", name: "Claude Sonnet", desc: "Content writer" },
              { icon: "\u{1F4CB}", name: "Structured Output", desc: "Pydantic models" },
              { icon: "\u{1F50D}", name: "Tavily Search", desc: "Fact verification" },
            ]}
          />
          <ArchLayer
            label="Data & Retrieval"
            labelColor="var(--amber)"
            borderColor="var(--amber)"
            services={[
              { icon: "\u{1F4DA}", name: "ChromaDB", desc: "Style corpus vectors" },
              { icon: "\u{1F4C4}", name: "PyPDF", desc: "PDF extraction" },
              { icon: "\u{1F4C2}", name: "Niskanen Corpus", desc: "8+ writing samples" },
              { icon: "\u{1F4BE}", name: "S3", desc: "PDF + output storage" },
            ]}
          />
          <ArchLayer
            label="Observability"
            labelColor="var(--blue)"
            borderColor="var(--blue)"
            services={[
              { icon: "\u{1F50E}", name: "LangSmith", desc: "Trace every run" },
              { icon: "\u{1F4CA}", name: "Evaluators", desc: "4 custom metrics" },
              { icon: "\u{1F4D1}", name: "Datasets", desc: "8-10 test papers" },
              { icon: "\u{1F4B0}", name: "Cost Tracking", desc: "Per-paper estimates" },
            ]}
          />
        </div>
      </section>

      {/* Use Cases */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-header anim-fade-up">
            <h2>What this pipeline does</h2>
          </div>
          <div className="use-grid">
            {[
              { icon: FileText, title: "Generate 7 content formats", text: "From a single policy paper: tweet, LinkedIn post, Bluesky post, newsletter paragraph, congressional one-pager, full op-ed, and media placement recommendations." },
              { icon: Shield, title: "Verify claims before publishing", text: "The citation checker searches the web for each statistical claim in the paper and flags anything it can't corroborate." },
              { icon: Users, title: "Match audience and tone", text: "The audience mapper tailors tone per format -- punchy for Twitter, professional for LinkedIn, jargon-free for Congress." },
              { icon: Palette, title: "Write in Niskanen's voice", text: "ChromaDB stores existing Niskanen publications. The style agent extracts patterns so generated content sounds like the organization, not a chatbot." },
              { icon: Eye, title: "Human review before publish", text: "LangGraph's interrupt() pauses the pipeline for editorial approval. Approve, request revision, or escalate -- nothing ships automatically." },
              { icon: DollarSign, title: "Run at minimal cost", text: "Claude Haiku handles four analysis agents, Sonnet writes content. Full pipeline costs under $0.05 per paper." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="use-item">
                <div className="use-icon"><Icon size={18} /></div>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Table */}
      <section className="section">
        <div className="container">
          <div style={{ marginBottom: "2.5rem" }}>
            <span className="section-badge badge-blue">Agent Routing</span>
            <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 1.875rem)", fontWeight: 700, color: "var(--foreground)" }}>
              Six agents. Two models.
            </h2>
            <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--muted-fg)", maxWidth: "36rem" }}>
              Analysis agents use Claude Haiku for speed and cost. The content
              writer uses Claude Sonnet for quality. Four agents run in parallel.
            </p>
          </div>
          <table className="styled-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Model</th>
                <th>Role</th>
                <th>Execution</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Supervisor", "Claude Haiku", "Validate extraction, route", "Sequential"],
                ["Research Analyst", "Claude Haiku", "Thesis, evidence, implications", "Sequential"],
                ["Audience Mapper", "Claude Haiku", "Tone + complexity per format", "Parallel"],
                ["Citation Checker", "Claude Haiku + Tavily", "Verify statistical claims", "Parallel"],
                ["Style Agent", "Claude Haiku + ChromaDB", "Extract writing patterns", "Parallel"],
                ["Content Writer", "Claude Sonnet", "Generate 7-format package", "Sequential"],
              ].map((row, i) => (
                <tr key={i}>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                  <td>{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="cta-inner">
          <h2>See it in action</h2>
          <p>
            Upload a Niskanen Center policy paper and watch the pipeline
            generate a full content package in under 30 seconds.
          </p>
          <div className="cta-buttons">
            <button className="btn-hero btn-hero-primary" onClick={() => setPage("pipeline")}>
              <Play size={16} /> Run the Pipeline
            </button>
            <a
              className="btn-hero btn-hero-ghost"
              href="https://github.com/realmwell/niskanen-pipeline"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github size={16} /> View on GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

/* ========================================================================== */
/*  About Page                                                                 */
/* ========================================================================== */

function AboutPage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: "48rem" }}>
        <span className="section-badge badge-green">About</span>
        <h2 style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "1.5rem" }}>
          Why this exists
        </h2>
        <div style={{ fontSize: "0.9375rem", color: "var(--muted-fg)", lineHeight: 1.8 }}>
          <p style={{ marginBottom: "1rem" }}>
            This is a take-home submission for a LangChain Professional Services
            Solutions Architect role. The assignment asked for two things: a
            conceptual architecture for deploying LangSmith on AWS, and a working
            multi-agent pipeline that converts policy papers into content packages.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            The pipeline uses LangGraph to coordinate six agents -- a supervisor,
            research analyst, audience mapper, citation checker, style agent, and
            content writer. Four of those agents run in parallel via LangGraph's
            fan-out/fan-in pattern. The content writer waits for all four to
            finish before generating seven output formats.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            Human-in-the-loop review is built in using LangGraph's interrupt()
            mechanism. The pipeline pauses after content generation and waits for
            an editor to approve, request revision, or escalate. Nothing publishes
            without human sign-off.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            The evaluation framework includes four custom metrics: argument
            fidelity (does the tweet match the thesis?), fact grounding rate (are
            claims backed by verified sources?), tone calibration (is the
            one-pager jargon-free?), and format compliance (is the tweet under
            280 characters?).
          </p>
          <p>
            Everything runs on free tiers. Claude via AWS Bedrock, Tavily free
            tier for web search, ChromaDB for local vector storage, LangSmith
            free tier for tracing. Total cost per paper is under $0.05.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/*  Agent Work Panels — proof of intermediate agent outputs                    */
/* ========================================================================== */

function AgentPanel({ title, accent, icon: Icon, timing, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen !== false);
  const timingStr = timing ? `${(timing / 1000).toFixed(1)}s` : null;

  return (
    <div className={`agent-panel agent-${accent}`}>
      <div className="agent-panel-header" onClick={() => setOpen(!open)}>
        <div className="agent-panel-title">
          <Icon size={16} />
          <span>{title}</span>
          {timingStr && (
            <span className="agent-panel-timing">
              <Clock size={12} /> {timingStr}
            </span>
          )}
        </div>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>
      {open && <div className="agent-panel-body">{children}</div>}
    </div>
  );
}

function ResearchPanel({ data, timing }) {
  if (!data) return null;
  return (
    <AgentPanel title="Research Analysis" accent="blue" icon={Search} timing={timing}>
      <div className="agent-section">
        <div className="agent-label">Thesis</div>
        <div className="agent-thesis">{data.thesis}</div>
      </div>

      {data.key_evidence?.length > 0 && (
        <div className="agent-section">
          <div className="agent-label">Key Evidence</div>
          <ol className="agent-evidence-list">
            {data.key_evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ol>
        </div>
      )}

      {data.policy_implications?.length > 0 && (
        <div className="agent-section">
          <div className="agent-label">Policy Implications</div>
          <ul className="agent-bullet-list">
            {data.policy_implications.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="agent-section agent-meta-row">
        {data.domain && (
          <span className="agent-tag agent-tag-blue">{data.domain.replace(/_/g, " ")}</span>
        )}
        {data.confidence_caveats?.map((c, i) => (
          <span key={i} className="agent-tag agent-tag-muted">{c}</span>
        ))}
      </div>
    </AgentPanel>
  );
}

function AudiencePanel({ data, timing }) {
  if (!data) return null;
  return (
    <AgentPanel title="Audience Mapping" accent="green" icon={Users} timing={timing}>
      {data.audiences?.length > 0 && (
        <div className="agent-section">
          <div className="agent-label">Target Audiences</div>
          <div className="agent-tags">
            {data.audiences.map((a, i) => (
              <span key={i} className="agent-tag agent-tag-green">{a.replace(/_/g, " ")}</span>
            ))}
          </div>
        </div>
      )}

      {data.tone_by_format && (
        <div className="agent-section">
          <div className="agent-label">Tone by Format</div>
          <table className="agent-tone-table">
            <tbody>
              {Object.entries(data.tone_by_format).map(([format, tone]) => (
                <tr key={format}>
                  <td className="tone-format">{format}</td>
                  <td className="tone-desc">{tone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.complexity_level && (
        <div className="agent-section">
          <div className="agent-label">Complexity Level</div>
          <span className="agent-tag agent-tag-green">{data.complexity_level}</span>
        </div>
      )}
    </AgentPanel>
  );
}

function CitationPanel({ data, timing }) {
  if (!data) return null;
  const score = data.overall_confidence_score || 0;
  const pct = Math.round(score * 100);

  return (
    <AgentPanel title="Citation Verification" accent="amber" icon={Shield} timing={timing}>
      <div className="agent-section">
        <div className="agent-label">Overall Confidence</div>
        <div className="confidence-bar-wrap">
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{ width: `${pct}%`, background: pct >= 60 ? "var(--green)" : pct >= 30 ? "var(--amber)" : "var(--red)" }}
            />
          </div>
          <span className="confidence-pct">{pct}%</span>
        </div>
        <div className="confidence-note">
          {data.verified_claims?.length || 0} verified, {data.unverified_claims?.length || 0} unverified via Tavily web search
        </div>
      </div>

      {data.verified_claims?.length > 0 && (
        <div className="agent-section">
          {data.verified_claims.map((c, i) => (
            <div key={i} className="claim-item claim-verified">
              <span className="claim-badge badge-verified"><CheckCircle size={14} /> Verified</span>
              <div className="claim-text">{c.claim}</div>
              {c.source_url && (
                <a className="claim-source" href={c.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} /> {c.source_title || "Source"}
                </a>
              )}
              {c.notes && <div className="claim-notes">{c.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {data.unverified_claims?.length > 0 && (
        <div className="agent-section">
          {data.unverified_claims.map((c, i) => (
            <div key={i} className="claim-item claim-unverified">
              <span className="claim-badge badge-unverified"><AlertCircle size={14} /> {c.status === "not_checked" ? "Not checked" : "Unverified"}</span>
              <div className="claim-text">{c.claim}</div>
              {c.notes && <div className="claim-notes">{c.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </AgentPanel>
  );
}

function StylePanel({ data, timing }) {
  if (!data) return null;
  return (
    <AgentPanel title="Style Analysis" accent="teal" icon={Palette} timing={timing}>
      {data.sentence_length_avg && (
        <div className="agent-section">
          <div className="agent-label">Average Sentence Length</div>
          <span className="agent-stat">{data.sentence_length_avg} words</span>
        </div>
      )}

      {data.rhetorical_moves?.length > 0 && (
        <div className="agent-section">
          <div className="agent-label">Rhetorical Moves</div>
          <div className="agent-tags">
            {data.rhetorical_moves.map((m, i) => (
              <span key={i} className="agent-tag agent-tag-teal">{m}</span>
            ))}
          </div>
        </div>
      )}

      {data.avoided_phrases?.length > 0 && (
        <div className="agent-section">
          <div className="agent-label">Avoided Phrases</div>
          <div className="agent-tags">
            {data.avoided_phrases.map((p, i) => (
              <span key={i} className="agent-tag agent-tag-muted">{p}</span>
            ))}
          </div>
        </div>
      )}

      {data.sample_passages?.length > 0 && (
        <div className="agent-section">
          <div className="agent-label">Sample Passages</div>
          {data.sample_passages.map((p, i) => (
            <blockquote key={i} className="agent-passage">{p}</blockquote>
          ))}
        </div>
      )}
    </AgentPanel>
  );
}

/* ========================================================================== */
/*  Evals Page — LangSmith observability, annotations, AI assessment           */
/* ========================================================================== */

const EVALS_TABS = [
  { id: "runs", label: "Pipeline Runs", icon: Activity },
  { id: "evals", label: "Eval Dashboard", icon: BarChart3 },
  { id: "annotate", label: "Annotations", icon: MessageSquare },
  { id: "assess", label: "Assessment", icon: Target },
];

function fmtDate(iso) {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDuration(start, end) {
  if (!start || !end) return "--";
  const ms = new Date(end) - new Date(start);
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTokens(n) {
  if (!n) return "--";
  return n > 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function fmtCost(c) {
  if (!c && c !== 0) return "--";
  return `$${c.toFixed(4)}`;
}

function StatusBadge({ status }) {
  const cls = status === "success" ? "badge-verified"
    : status === "error" ? "badge-disputed"
    : "badge-unverified";
  return <span className={`claim-badge ${cls}`}>{status || "unknown"}</span>;
}

function StarRating({ value, onChange, size = 18 }) {
  return (
    <span className="star-rating">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={`star-icon ${s <= value ? "star-filled" : "star-empty"}`}
          onClick={() => onChange(s)}
        />
      ))}
    </span>
  );
}

/* -- Trace Detail sub-view ------------------------------------------------- */

function TraceDetail({ runId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedNode, setExpandedNode] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/traces/${runId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [runId]);

  if (loading) return <div className="evals-loading"><Loader2 size={20} className="spin" /> Loading trace...</div>;
  if (error) return <div className="evals-error"><XCircle size={16} /> {error}</div>;
  if (!data) return null;

  const { root, children = [] } = data;
  const rootStart = root?.start_time ? new Date(root.start_time).getTime() : 0;
  const rootEnd = root?.end_time ? new Date(root.end_time).getTime() : rootStart + 1;
  const totalMs = rootEnd - rootStart || 1;

  return (
    <div className="trace-detail">
      <button className="trace-back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Back to runs
      </button>

      <div className="trace-header">
        <h3>{root?.name || "Pipeline Run"}</h3>
        <div className="trace-meta">
          <span><Clock size={14} /> {fmtDuration(root?.start_time, root?.end_time)}</span>
          <span><Zap size={14} /> {fmtTokens(root?.total_tokens)} tokens</span>
          <StatusBadge status={root?.status} />
        </div>
      </div>

      <h4 className="trace-section-title">Execution timeline</h4>
      <div className="trace-timeline">
        {children.map((child) => {
          const cStart = child.start_time ? new Date(child.start_time).getTime() : rootStart;
          const cEnd = child.end_time ? new Date(child.end_time).getTime() : cStart;
          const left = ((cStart - rootStart) / totalMs) * 100;
          const width = Math.max(((cEnd - cStart) / totalMs) * 100, 2);
          const isError = child.status === "error";
          const isExpanded = expandedNode === child.id;

          return (
            <div key={child.id} className="timeline-row">
              <div className="timeline-label">{child.name}</div>
              <div className="timeline-bar-wrap">
                <div
                  className={`timeline-bar ${isError ? "timeline-bar-error" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => setExpandedNode(isExpanded ? null : child.id)}
                  title={`${fmtDuration(child.start_time, child.end_time)} | ${fmtTokens(child.total_tokens)} tokens`}
                >
                  <span className="timeline-bar-text">
                    {fmtDuration(child.start_time, child.end_time)}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className="timeline-detail">
                  <div className="timeline-detail-grid">
                    <div>
                      <h5>Input</h5>
                      <pre className="json-viewer">{JSON.stringify(child.inputs, null, 2)?.slice(0, 2000)}</pre>
                    </div>
                    <div>
                      <h5>Output</h5>
                      <pre className="json-viewer">{JSON.stringify(child.outputs, null, 2)?.slice(0, 2000)}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {root?.error && (
        <div className="trace-error-box">
          <h4><XCircle size={16} /> Error</h4>
          <pre>{root.error}</pre>
        </div>
      )}
    </div>
  );
}

/* -- Main EvalsPage -------------------------------------------------------- */

function EvalsPage() {
  const [activeTab, setActiveTab] = useState("runs");
  const [selectedRunId, setSelectedRunId] = useState(null);

  // Runs tab state
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState(null);

  // Evals tab state
  const [evals, setEvals] = useState([]);
  const [evalsLoading, setEvalsLoading] = useState(false);

  // Annotate tab state
  const [annotateRunId, setAnnotateRunId] = useState("");
  const [ratings, setRatings] = useState({
    content_quality: 0, factual_accuracy: 0, tone: 0, actionability: 0, overall: 0,
  });
  const [annotateNotes, setAnnotateNotes] = useState("");
  const [annotateStatus, setAnnotateStatus] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);

  // Assess tab state
  const [assessTimeRange, setAssessTimeRange] = useState("7d");
  const [assessment, setAssessment] = useState(null);
  const [assessLoading, setAssessLoading] = useState(false);
  const [assessError, setAssessError] = useState(null);

  // Fetch runs
  const loadRuns = useCallback(() => {
    setRunsLoading(true);
    setRunsError(null);
    fetch(`${API_BASE}/api/traces?limit=20`)
      .then((r) => r.json())
      .then((d) => { setRuns(d.runs || []); setRunsLoading(false); })
      .catch((e) => { setRunsError(e.message); setRunsLoading(false); });
  }, []);

  // Fetch evals
  const loadEvals = useCallback(() => {
    setEvalsLoading(true);
    fetch(`${API_BASE}/api/evals`)
      .then((r) => r.json())
      .then((d) => { setEvals(d.evaluations || []); setEvalsLoading(false); })
      .catch(() => setEvalsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "runs" && runs.length === 0) loadRuns();
    if (activeTab === "evals" && evals.length === 0) loadEvals();
  }, [activeTab]);

  // Submit annotations
  const submitAnnotations = async () => {
    if (!annotateRunId) return;
    setAnnotateStatus("submitting");
    try {
      for (const [key, score] of Object.entries(ratings)) {
        if (score > 0) {
          await fetch(`${API_BASE}/api/annotate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              run_id: annotateRunId,
              key,
              score: score / 5,
              comment: annotateNotes || undefined,
            }),
          });
        }
      }
      setAnnotateStatus("done");
    } catch (e) {
      setAnnotateStatus("error: " + e.message);
    }
  };

  // Generate recommendations
  const generateRecs = async () => {
    if (!annotateRunId) return;
    setRecsLoading(true);
    try {
      const traceResp = await fetch(`${API_BASE}/api/traces/${annotateRunId}`);
      const traceData = await traceResp.json();
      const resp = await fetch(`${API_BASE}/api/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceData, annotations: ratings }),
      });
      const d = await resp.json();
      setRecommendations(d.assessment);
    } catch (e) {
      setRecommendations({ error: e.message });
    }
    setRecsLoading(false);
  };

  // Generate assessment
  const generateAssessment = async () => {
    setAssessLoading(true);
    setAssessError(null);
    try {
      const traceResp = await fetch(`${API_BASE}/api/traces?limit=50`);
      const traceData = await traceResp.json();
      const resp = await fetch(`${API_BASE}/api/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceData, timeRange: assessTimeRange }),
      });
      const d = await resp.json();
      setAssessment(d.assessment);
    } catch (e) {
      setAssessError(e.message);
    }
    setAssessLoading(false);
  };

  // If viewing trace detail, show that instead
  if (selectedRunId) {
    return (
      <section className="section evals-page">
        <div className="container">
          <TraceDetail runId={selectedRunId} onBack={() => setSelectedRunId(null)} />
        </div>
      </section>
    );
  }

  return (
    <section className="section evals-page">
      <div className="container">
        <div className="evals-header">
          <div>
            <span className="section-badge badge-blue">Observability</span>
            <h2 className="evals-title">Pipeline Evaluations</h2>
            <p className="evals-subtitle">
              LangSmith traces, evaluation scores, annotations, and AI-generated assessments.
            </p>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="evals-tabs">
          {EVALS_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`evals-tab ${activeTab === id ? "evals-tab-active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Pipeline Runs */}
        {activeTab === "runs" && (
          <div className="evals-panel">
            <div className="evals-panel-header">
              <h3>Recent pipeline runs</h3>
              <button className="evals-refresh" onClick={loadRuns} disabled={runsLoading}>
                <RefreshCw size={14} className={runsLoading ? "spin" : ""} />
                Refresh
              </button>
            </div>

            {runsError && <div className="evals-error"><XCircle size={16} /> {runsError}</div>}

            {runsLoading && runs.length === 0 ? (
              <div className="evals-loading"><Loader2 size={20} className="spin" /> Loading runs from LangSmith...</div>
            ) : runs.length === 0 ? (
              <div className="evals-empty">
                <Activity size={32} />
                <p>No pipeline runs found. Run the pipeline to generate traces, or check that LANGSMITH_API_KEY is configured.</p>
              </div>
            ) : (
              <div className="runs-table-wrap">
                <table className="runs-table">
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Tokens</th>
                      <th>Cost</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.run_id} className="runs-row" onClick={() => setSelectedRunId(run.run_id)}>
                        <td className="runs-name">{run.name || "pipeline"}</td>
                        <td><StatusBadge status={run.status} /></td>
                        <td>{fmtDuration(run.start_time, run.end_time)}</td>
                        <td>{fmtTokens(run.total_tokens)}</td>
                        <td>{fmtCost(run.total_cost)}</td>
                        <td className="runs-date">{fmtDate(run.start_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Evaluation Dashboard */}
        {activeTab === "evals" && (
          <div className="evals-panel">
            <div className="evals-panel-header">
              <h3>Evaluation results</h3>
              <button className="evals-refresh" onClick={loadEvals} disabled={evalsLoading}>
                <RefreshCw size={14} className={evalsLoading ? "spin" : ""} />
                Refresh
              </button>
            </div>

            {evalsLoading && evals.length === 0 ? (
              <div className="evals-loading"><Loader2 size={20} className="spin" /> Loading evaluations...</div>
            ) : evals.length === 0 ? (
              <div className="evals-empty">
                <BarChart3 size={32} />
                <p>No evaluation results yet. Run <code>python evaluation/run_evals.py</code> to generate scores, or check LANGSMITH_API_KEY.</p>
              </div>
            ) : (
              <>
                <div className="eval-metrics-row">
                  <div className="eval-metric-card">
                    <span className="eval-metric-value">{evals.length}</span>
                    <span className="eval-metric-label">Total runs</span>
                  </div>
                  <div className="eval-metric-card">
                    <span className="eval-metric-value">
                      {evals.filter((e) => e.status === "success").length}
                    </span>
                    <span className="eval-metric-label">Successful</span>
                  </div>
                  <div className="eval-metric-card">
                    <span className="eval-metric-value">
                      {evals.filter((e) => e.status === "error").length}
                    </span>
                    <span className="eval-metric-label">Errors</span>
                  </div>
                  <div className="eval-metric-card">
                    <span className="eval-metric-value">
                      {evals.length > 0
                        ? (evals.reduce((sum, e) => sum + (e.total_tokens || 0), 0) / evals.length / 1000).toFixed(1) + "k"
                        : "--"}
                    </span>
                    <span className="eval-metric-label">Avg tokens</span>
                  </div>
                </div>

                <div className="eval-explainer">
                  <h4>Evaluator descriptions</h4>
                  <div className="eval-explainer-grid">
                    <div><strong>argument_fidelity</strong> (LLM-as-judge): Does the tweet preserve the paper's thesis?</div>
                    <div><strong>fact_grounding_rate</strong> (Deterministic): Fraction of verified claims in the content.</div>
                    <div><strong>tone_calibration</strong> (LLM-as-judge): Is the one-pager jargon-free for Hill staff?</div>
                    <div><strong>format_compliance</strong> (Deterministic): Do character/word counts meet spec?</div>
                  </div>
                </div>

                <div className="runs-table-wrap">
                  <table className="runs-table">
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Tokens</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evals.map((ev, i) => (
                        <tr key={ev.id || i}>
                          <td className="runs-name">{ev.name || `eval-${i + 1}`}</td>
                          <td><StatusBadge status={ev.status} /></td>
                          <td>{fmtDuration(ev.start_time, ev.end_time)}</td>
                          <td>{fmtTokens(ev.total_tokens)}</td>
                          <td className="runs-date">{fmtDate(ev.start_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 3: Annotations */}
        {activeTab === "annotate" && (
          <div className="evals-panel">
            <div className="evals-panel-header">
              <h3>Annotate pipeline output</h3>
            </div>

            <div className="annotate-layout">
              <div className="annotate-form">
                <label className="annotate-label">
                  Run ID
                  <input
                    type="text"
                    className="annotate-input"
                    placeholder="Paste a LangSmith run ID..."
                    value={annotateRunId}
                    onChange={(e) => setAnnotateRunId(e.target.value)}
                  />
                  {runs.length > 0 && (
                    <div className="annotate-quick-picks">
                      {runs.slice(0, 3).map((r) => (
                        <button key={r.run_id} className="annotate-pick" onClick={() => setAnnotateRunId(r.run_id)}>
                          {r.name || "run"} ({fmtDate(r.start_time)})
                        </button>
                      ))}
                    </div>
                  )}
                </label>

                <div className="rating-grid">
                  {Object.keys(ratings).map((key) => (
                    <div key={key} className="rating-row">
                      <span className="rating-label">{key.replace(/_/g, " ")}</span>
                      <StarRating
                        value={ratings[key]}
                        onChange={(v) => setRatings((prev) => ({ ...prev, [key]: v }))}
                      />
                    </div>
                  ))}
                </div>

                <label className="annotate-label">
                  Notes
                  <textarea
                    className="annotate-textarea"
                    rows={3}
                    placeholder="Optional comments..."
                    value={annotateNotes}
                    onChange={(e) => setAnnotateNotes(e.target.value)}
                  />
                </label>

                <div className="annotate-actions">
                  <button
                    className="btn-primary"
                    onClick={submitAnnotations}
                    disabled={!annotateRunId || annotateStatus === "submitting"}
                  >
                    <Send size={14} />
                    {annotateStatus === "submitting" ? "Submitting..." : "Submit annotations"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={generateRecs}
                    disabled={!annotateRunId || recsLoading}
                  >
                    <Target size={14} />
                    {recsLoading ? "Generating..." : "Generate recommendations"}
                  </button>
                </div>

                {annotateStatus === "done" && (
                  <div className="annotate-success">Annotations saved to LangSmith.</div>
                )}
                {annotateStatus?.startsWith("error") && (
                  <div className="evals-error"><XCircle size={16} /> {annotateStatus}</div>
                )}
              </div>

              {/* Recommendations panel */}
              {recommendations && !recommendations.error && (
                <div className="recs-panel">
                  <div className="recs-cards">
                    <div className="rec-card rec-card-tech">
                      <h4><Shield size={16} /> Technical recommendations</h4>
                      {(recommendations.technical_recommendations || []).map((rec, i) => (
                        <div key={i} className="rec-item">
                          <strong>{rec.action}</strong>
                          <span className={`rec-effort effort-${rec.effort}`}>{rec.effort} effort</span>
                          <p>{rec.impact}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rec-card rec-card-exec">
                      <h4><DollarSign size={16} /> Executive recommendations</h4>
                      {(recommendations.executive_recommendations || []).map((rec, i) => (
                        <div key={i} className="rec-item">
                          <strong>#{rec.priority}: {rec.action}</strong>
                          <p>{rec.impact}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Assessment Module */}
        {activeTab === "assess" && (
          <div className="evals-panel">
            <div className="evals-panel-header">
              <h3>Pipeline assessment</h3>
            </div>

            <div className="assess-controls">
              <label className="annotate-label">
                Time range
                <select
                  className="annotate-input"
                  value={assessTimeRange}
                  onChange={(e) => setAssessTimeRange(e.target.value)}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="all">All time</option>
                </select>
              </label>
              <button
                className="btn-primary"
                onClick={generateAssessment}
                disabled={assessLoading}
              >
                {assessLoading ? (
                  <><Loader2 size={14} className="spin" /> Generating...</>
                ) : (
                  <><Target size={14} /> Generate assessment</>
                )}
              </button>
            </div>

            {assessError && <div className="evals-error"><XCircle size={16} /> {assessError}</div>}

            {!assessment && !assessLoading && (
              <div className="evals-empty">
                <Target size={32} />
                <p>
                  Click "Generate assessment" to analyze all pipeline runs in the selected time range.
                  The AI assessment produces findings, recommendations for both technical and executive audiences,
                  and suggested next runs.
                </p>
              </div>
            )}

            {assessment && !assessment.error && (
              <div className="assessment-report">
                {assessment.executive_summary && (
                  <div className="assess-summary">
                    <h4>Executive summary</h4>
                    <p>{assessment.executive_summary}</p>
                  </div>
                )}

                {assessment.findings?.length > 0 && (
                  <div className="assess-section">
                    <h4>Findings</h4>
                    {assessment.findings.map((f, i) => (
                      <div key={i} className={`assess-finding severity-${f.severity}`}>
                        <div className="finding-header">
                          <strong>{f.title}</strong>
                          <span className={`severity-badge severity-${f.severity}`}>{f.severity}</span>
                        </div>
                        <p>{f.detail}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="recs-cards">
                  {assessment.technical_recommendations?.length > 0 && (
                    <div className="rec-card rec-card-tech">
                      <h4><Shield size={16} /> Technical recommendations</h4>
                      {assessment.technical_recommendations.map((rec, i) => (
                        <div key={i} className="rec-item">
                          <strong>{rec.action}</strong>
                          <span className={`rec-effort effort-${rec.effort}`}>{rec.effort} effort</span>
                          <p>{rec.impact}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {assessment.executive_recommendations?.length > 0 && (
                    <div className="rec-card rec-card-exec">
                      <h4><DollarSign size={16} /> Executive recommendations</h4>
                      {assessment.executive_recommendations.map((rec, i) => (
                        <div key={i} className="rec-item">
                          <strong>#{rec.priority}: {rec.action}</strong>
                          <p>{rec.impact}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ========================================================================== */
/*  Pipeline Page                                                              */
/* ========================================================================== */

function PipelinePage() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [contentPackage, setContentPackage] = useState(null);
  const [agentData, setAgentData] = useState(null);
  const [agentTimings, setAgentTimings] = useState(null);
  const [activeTab, setActiveTab] = useState("twitter_post");
  const [feedback, setFeedback] = useState("");
  const [errors, setErrors] = useState([]);
  const [decision, setDecision] = useState("");

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!url.trim()) return;
      setStatus("running");
      setCurrentStep(1);
      setErrors([]);
      setContentPackage(null);
      setAgentData(null);
      setAgentTimings(null);
      setDecision("");
      setFeedback("");
      runPipeline(
        url,
        (step) => setCurrentStep(step),
        (data) => {
          // Store intermediate agent outputs
          setAgentData({
            research_summary: data.research_summary,
            audience_map: data.audience_map,
            fact_check_report: data.fact_check_report,
            style_patterns: data.style_patterns,
          });
          setAgentTimings(data.agent_timings);
          setContentPackage(data.content);
          setCurrentStep(7);
          setStatus("review");
        },
        (errMsg) => {
          setErrors((prev) => [...prev, errMsg]);
          setStatus("error");
        }
      );
    },
    [url]
  );

  const handleReview = useCallback((action) => {
    setDecision(action);
    if (action === "approve") {
      setCurrentStep(7);
      setStatus("done");
    } else if (action === "revise") {
      setStatus("running");
      setCurrentStep(5);
      setTimeout(() => {
        setCurrentStep(6);
        setStatus("review");
        setDecision("");
      }, 2500);
    } else {
      setStatus("done");
    }
  }, []);

  const rawContent = contentPackage?.[activeTab] || "";
  const activeContent = formatForDisplay(rawContent);
  const activeMeta = FORMATS.find((f) => f.key === activeTab);
  const count = activeMeta?.limit ? measure(activeContent, activeMeta.unit) : null;
  const isOver = activeMeta?.limit && count > activeMeta.limit;

  return (
    <div className="pipeline-page">
      <div className="container">
        {/* Upload */}
        <div className="upload-zone anim-fade-up">
          <h2>Process a policy paper</h2>
          <form className="input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Paste a Niskanen Center article URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={status === "running"}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={status === "running" || !url.trim()}
            >
              {status === "running" ? (
                <><span className="spinner" /> Processing...</>
              ) : (
                <><Play size={16} /> Run Pipeline</>
              )}
            </button>
          </form>
        </div>

        {/* Status */}
        {status !== "idle" && (
          <div className="status-card anim-fade-up">
            <h3>Pipeline Progress</h3>
            <div className="steps">
              {STEPS.map((label, i) => {
                const stepNum = i + 1;
                let cls = "step";
                if (stepNum < currentStep) cls += " completed";
                else if (stepNum === currentStep) cls += " active";
                return (
                  <div key={label} className={cls}>
                    <div className="step-dot">
                      {stepNum < currentStep ? "\u2713" : stepNum}
                    </div>
                    <div className="step-label">{label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="errors">
            <h4>Errors</h4>
            <ul>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Agent Work Panels — proof of intermediate agent outputs */}
        {agentData && (
          <div className="agent-panels anim-fade-up">
            <h3 className="agent-panels-heading">Agent Work</h3>
            <p className="agent-panels-desc">
              Each panel below shows the output of an individual agent in the pipeline.
              These intermediate results were used to inform the final content package.
            </p>
            <ResearchPanel
              data={agentData.research_summary}
              timing={agentTimings?.research_analyst}
            />
            <AudiencePanel
              data={agentData.audience_map}
              timing={agentTimings?.audience_mapper}
            />
            <CitationPanel
              data={agentData.fact_check_report}
              timing={agentTimings?.citation_checker}
            />
            <StylePanel
              data={agentData.style_patterns}
              timing={agentTimings?.style_analyst}
            />
          </div>
        )}

        {/* Content */}
        {contentPackage && (
          <div className="content-card anim-fade-up">
            <div className="content-card-header">
              <h3>Content Package</h3>
              {agentTimings?.content_writer && (
                <span className="agent-panel-timing">
                  <Clock size={12} /> {(agentTimings.content_writer / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <div className="tabs">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  className={`tab${activeTab === f.key ? " active" : ""}`}
                  onClick={() => setActiveTab(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="tab-content">
              <pre>{activeContent}</pre>
              {count !== null && (
                <div className={`char-count${isOver ? " over" : ""}`}>
                  {count} {activeMeta.unit}
                  {activeMeta.limit && ` / ${activeMeta.limit} limit`}
                  {isOver && " -- over limit"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Review */}
        {status === "review" && (
          <div className="review-card anim-fade-up">
            <h3>Human Review</h3>
            <div className="review-actions">
              <button className="btn btn-green" onClick={() => handleReview("approve")}>
                <CheckCircle size={16} /> Approve
              </button>
              <button className="btn btn-warn" onClick={() => handleReview("revise")}>
                <Pen size={16} /> Revise
              </button>
              <button className="btn btn-red" onClick={() => handleReview("escalate")}>
                Escalate
              </button>
            </div>
            <textarea
              className="feedback-input"
              placeholder="Optional: add feedback for the content writer..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
        )}

        {/* Done */}
        {status === "done" && (
          <div className="done-banner anim-fade-up">
            <h3>
              {decision === "approve"
                ? "Content approved and saved"
                : "Escalated to editorial team"}
            </h3>
            <p>
              {decision === "approve"
                ? "The content package has been written to outputs/ as JSON. View the full trace in LangSmith."
                : "This paper has been flagged for manual review. The pipeline state is preserved for resumption."}
            </p>
          </div>
        )}

        {/* Empty state */}
        {status === "idle" && (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--muted-fg)" }}>
            <FileText size={48} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
            <p style={{ fontSize: "0.9375rem", maxWidth: "28rem", margin: "0 auto" }}>
              Enter a Niskanen Center article URL above to generate a content
              package with seven formats: tweet, LinkedIn, Bluesky, newsletter,
              one-pager, op-ed, and media placement recommendations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  App Root                                                                   */
/* ========================================================================== */

export default function App() {
  const [page, setPage] = useState("home");
  const [dark, setDark] = useState(true);

  return (
    <div className={`app${dark ? "" : " light"}`}>
      <Nav page={page} setPage={setPage} dark={dark} setDark={setDark} />

      {page === "home" && <LandingPage setPage={setPage} />}
      {page === "pipeline" && <PipelinePage />}
      {page === "evals" && <EvalsPage />}
      {page === "about" && <AboutPage />}

      <Footer />
    </div>
  );
}
