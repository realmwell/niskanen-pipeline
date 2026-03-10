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
  Download,
  Menu,
  X,
  Edit3,
  RotateCcw,
  Trash2,
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
  { key: "twitter_posts", label: "Twitter", limit: 280, unit: "chars", count: 5, platform: "Twitter/X" },
  { key: "linkedin_posts", label: "LinkedIn", limit: null, count: 3, platform: "LinkedIn" },
  { key: "bluesky_posts", label: "Bluesky", limit: 300, unit: "chars", count: 5, platform: "Bluesky" },
  { key: "newsletter_paragraph", label: "Newsletter", limit: 165, unit: "words" },
  { key: "congressional_one_pager", label: "One-Pager", limit: null },
  { key: "full_oped", label: "Op-Ed", limit: null },
  { key: "media_outlet_recommendations", label: "Media Recs", limit: null },
  { key: "instagram_post", label: "Instagram", limit: null, platform: "Instagram" },
  { key: "instagram_story", label: "IG Story", limit: null, platform: "Instagram Stories" },
];

const SOCIAL_FORMATS = new Set(["twitter_posts", "linkedin_posts", "bluesky_posts", "instagram_post", "instagram_story"]);
const DOC_FORMATS = new Set(["newsletter_paragraph", "congressional_one_pager", "full_oped", "media_outlet_recommendations"]);

const AGENT_DESCRIPTIONS = {
  research: "Extracts the paper's central thesis, supporting evidence, policy implications, and confidence caveats. This grounds all downstream content in the paper's actual findings.",
  audience: "Identifies 3-5 target audience segments and calibrates tone for each output format. The content writer uses these tone recommendations to adjust voice across Twitter, LinkedIn, newsletters, and policy documents.",
  citation: "Pulls verifiable claims from the research and checks each against live web sources via Tavily search. Only verified claims with source URLs are passed to the content writer.",
  style: "Analyzes the article's sentence structure, rhetorical patterns, and characteristic phrases. The content writer mirrors these patterns to keep output consistent with Niskanen's voice.",
};

function measure(text, unit) {
  if (!text || typeof text !== "string") return 0;
  if (unit === "words") return text.trim().split(/\s+/).length;
  return text.length;
}

/* Format complex content fields (one-pager, media recs, Instagram) for display */
function formatForDisplay(value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  // Congressional one-pager: structured JSON with the_ask, the_problem, etc.
  if (value.the_ask || value.title || value["The Problem"] || value["the_problem"]) {
    const lines = [];
    const title = value.title || value.Title || "";
    if (title) lines.push(title, "");

    if (value.the_ask) {
      lines.push("THE ASK");
      lines.push(`  ${value.the_ask}`, "");
    }

    const sections = [
      ["The Problem", value["The Problem"] || value["the_problem"]],
      ["The Evidence", value["The Evidence"] || value["the_evidence"]],
      ["Key Recommendations", value["The Proposal"] || value["the_proposal"] || value["Key Recommendations"] || value["key_recommendations"]],
    ];

    for (const [heading, items] of sections) {
      if (!items) continue;
      lines.push(heading.toUpperCase());
      const arr = Array.isArray(items) ? items : [items];
      for (const item of arr) lines.push(`  \u2022 ${item}`);
      lines.push("");
    }

    const bottom = value["Bottom line:"] || value["bottom_line"] || value["Bottom line"] || "";
    if (bottom) lines.push(`BOTTOM LINE: ${bottom}`, "");

    const contact = value.contact || "";
    if (contact) lines.push(contact);
    return lines.join("\n");
  }

  // Media outlet recommendations: structured JSON with primary_targets, pitch_angles, etc.
  if (value["PRIMARY TARGETS"] || value["primary_targets"]) {
    const lines = [];

    const formatTargets = (targets, heading) => {
      if (!targets || !targets.length) return;
      lines.push(heading);
      for (const item of targets) {
        if (typeof item === "string") {
          lines.push(`  \u2022 ${item}`);
        } else if (item.outlet) {
          const urlSuffix = item.url ? ` [${item.url}]` : "";
          lines.push(`  \u2022 ${item.outlet}${item.section ? ` (${item.section})` : ""}${urlSuffix}`);
          if (item.beat) lines.push(`    Beat: ${item.beat}`);
          if (item.pitch_angle) lines.push(`    Angle: ${item.pitch_angle}`);
          if (item.why) lines.push(`    Why: ${item.why}`);
          if (item.rationale) lines.push(`    ${item.rationale}`);
        } else {
          lines.push(`  \u2022 ${item.name || JSON.stringify(item)}`);
        }
      }
      lines.push("");
    };

    formatTargets(value["PRIMARY TARGETS"] || value["primary_targets"], "PRIMARY TARGETS");
    formatTargets(value["SECONDARY TARGETS"] || value["secondary_targets"], "SECONDARY TARGETS");

    const pitchAngles = value["pitch_angles"] || [];
    if (pitchAngles.length) {
      lines.push("PITCH ANGLES");
      for (const pa of pitchAngles) {
        if (typeof pa === "string") {
          lines.push(`  \u2022 ${pa}`);
        } else {
          lines.push(`  \u2022 ${pa.angle || pa.suggested_headline || ""}`);
          if (pa.suggested_headline && pa.angle) lines.push(`    Headline: ${pa.suggested_headline}`);
        }
      }
      lines.push("");
    }

    const timingHooks = value["timing_hooks"] || value["TIMING"] || value["timing"] || [];
    if (timingHooks) {
      lines.push("TIMING HOOKS");
      const arr = Array.isArray(timingHooks) ? timingHooks : [timingHooks];
      for (const t of arr) lines.push(`  \u2022 ${t}`);
      lines.push("");
    }

    const beats = value["BEAT REPORTERS"] || value["beat_reporters"] || [];
    if (beats.length || typeof beats === "string") {
      lines.push("BEAT REPORTERS");
      const arr = Array.isArray(beats) ? beats : [beats];
      for (const b of arr) lines.push(`  \u2022 ${b}`);
      lines.push("");
    }

    const pitchEmail = value["pitch_email_draft"] || "";
    if (pitchEmail) {
      lines.push("PITCH EMAIL DRAFT");
      lines.push(pitchEmail);
      lines.push("");
    }

    return lines.join("\n");
  }

  // Instagram Post: {visual_description, caption, hashtags, alt_text, cta}
  if (value.visual_description || value.caption) {
    const lines = [];
    if (value.visual_description) {
      lines.push("VISUAL CONCEPT");
      lines.push(value.visual_description, "");
    }
    if (value.caption) {
      lines.push("CAPTION");
      lines.push(value.caption, "");
    }
    if (value.hashtags) {
      lines.push("HASHTAGS");
      const tags = Array.isArray(value.hashtags) ? value.hashtags.join("  ") : value.hashtags;
      lines.push(tags, "");
    }
    if (value.alt_text) {
      lines.push("ALT TEXT");
      lines.push(value.alt_text, "");
    }
    if (value.cta) {
      lines.push("CTA");
      lines.push(value.cta);
    }
    return lines.join("\n");
  }

  // Instagram Story: {frames, poll_question, link_sticker_text}
  if (value.frames) {
    const lines = [];
    lines.push("STORY SEQUENCE");
    const frames = Array.isArray(value.frames) ? value.frames : [];
    frames.forEach((frame, i) => {
      const typeLabel = (frame.type || "frame").toUpperCase().replace("_", " ");
      lines.push(`  ${i + 1}. [${typeLabel}]`);
      if (frame.text) lines.push(`     ${frame.text}`);
      if (frame.visual_note) lines.push(`     Visual: ${frame.visual_note}`);
    });
    lines.push("");

    if (value.poll_question) {
      lines.push("POLL");
      lines.push(`  ${value.poll_question}`, "");
    }
    if (value.link_sticker_text) {
      lines.push("LINK STICKER");
      lines.push(`  ${value.link_sticker_text}`);
    }
    return lines.join("\n");
  }

  // Fallback: pretty-print JSON
  return JSON.stringify(value, null, 2);
}

/* Render media recs with clickable outlet links */
function MediaRecsDisplay({ data }) {
  if (!data) return null;
  const primary = data["PRIMARY TARGETS"] || data["primary_targets"] || [];
  const secondary = data["SECONDARY TARGETS"] || data["secondary_targets"] || [];
  const pitchAngles = data["pitch_angles"] || [];
  const timingHooks = data["timing_hooks"] || data["TIMING"] || data["timing"] || [];
  const pitchEmail = data["pitch_email_draft"] || "";

  const renderTargets = (targets, heading) => {
    if (!targets?.length) return null;
    return (
      <div className="media-recs-section">
        <h4>{heading}</h4>
        {targets.map((item, i) => {
          if (typeof item === "string") return <div key={i} className="media-target">{item}</div>;
          return (
            <div key={i} className="media-target">
              <div className="media-target-name">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.outlet} <ExternalLink size={12} />
                  </a>
                ) : item.outlet}
                {item.section && <span className="media-target-section">({item.section})</span>}
              </div>
              {item.beat && <div className="media-target-detail">Beat: {item.beat}</div>}
              {item.pitch_angle && <div className="media-target-detail">Angle: {item.pitch_angle}</div>}
              {item.why && <div className="media-target-detail">Why: {item.why}</div>}
              {item.rationale && <div className="media-target-detail">{item.rationale}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="media-recs-display">
      {renderTargets(primary, "PRIMARY TARGETS")}
      {renderTargets(secondary, "SECONDARY TARGETS")}
      {pitchAngles.length > 0 && (
        <div className="media-recs-section">
          <h4>PITCH ANGLES</h4>
          {pitchAngles.map((pa, i) => (
            <div key={i} className="media-target">
              {typeof pa === "string" ? pa : (
                <>
                  <div className="media-target-name">{pa.angle || pa.suggested_headline || ""}</div>
                  {pa.suggested_headline && pa.angle && <div className="media-target-detail">Headline: {pa.suggested_headline}</div>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {timingHooks && (Array.isArray(timingHooks) ? timingHooks : [timingHooks]).length > 0 && (
        <div className="media-recs-section">
          <h4>TIMING HOOKS</h4>
          {(Array.isArray(timingHooks) ? timingHooks : [timingHooks]).map((t, i) => (
            <div key={i} className="media-target">{t}</div>
          ))}
        </div>
      )}
      {pitchEmail && (
        <div className="media-recs-section">
          <h4>PITCH EMAIL DRAFT</h4>
          <pre className="pitch-email-pre">{pitchEmail}</pre>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  Pipeline — real article fetch + multi-agent pipeline via backend           */
/* ========================================================================== */

const API_BASE = import.meta.env.PROD
  ? "https://v1tofkjpy6.execute-api.us-east-1.amazonaws.com"
  : "";

async function runPipeline(url, onStep, onDone, onError) {
  try {
    onStep(1);
    const jobId = crypto.randomUUID();
    const apiPromise = fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, jobId }),
    });

    await pause(400);
    onStep(2);
    await pause(1200);
    onStep(3);
    await pause(600);
    onStep(4);

    let data;
    try {
      const res = await apiPromise;
      data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 503 || res.status === 504) {
          data = await pollForResult(jobId, onStep);
        } else {
          throw new Error(data.error || "Pipeline failed");
        }
      }
    } catch (fetchErr) {
      if (fetchErr.message?.includes("Pipeline failed")) throw fetchErr;
      data = await pollForResult(jobId, onStep);
    }

    onStep(5);
    await pause(300);
    onStep(6);
    await pause(200);
    onDone(data);
  } catch (err) {
    onError(err.message);
  }
}

async function pollForResult(jobId, onStep) {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await pause(3000);
    if (i === 2) onStep(5);
    if (i === 5) onStep(6);
    try {
      const res = await fetch(`${API_BASE}/api/status/${jobId}`);
      if (res.status === 404) continue;
      const data = await res.json();
      if (data.status === "running") continue;
      if (data.status === "error") throw new Error(data.error || "Pipeline failed");
      if (data.success) return data;
    } catch (pollErr) {
      if (pollErr.message?.includes("Pipeline failed")) throw pollErr;
    }
  }
  throw new Error("Pipeline timed out after 90 seconds");
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ========================================================================== */
/*  Shared Components                                                          */
/* ========================================================================== */

function Nav({ page, setPage, dark, setDark }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { id: "home", label: "Home", icon: Home },
    { id: "pipeline", label: "Pipeline", icon: Workflow },
    { id: "evals", label: "Evals", icon: BarChart3 },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="nav-brand" onClick={() => { setPage("home"); setMenuOpen(false); }}>
          NISKANEN
        </span>
        <button className="nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className={`nav-links${menuOpen ? " nav-links-open" : ""}`}>
          {links.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link${page === id ? " active" : ""}`}
              onClick={() => { setPage(id); setMenuOpen(false); }}
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
    { label: "Article Fetch", detail: "Extract text from policy paper URL", color: "var(--teal)", dot: "var(--teal)" },
    { label: "Research Analyst", detail: "Thesis, evidence, implications", color: "var(--blue)", dot: "var(--blue)" },
    { label: "Parallel Agents", detail: "Audience + Citations + Style (concurrent)", color: "var(--amber)", dot: "var(--amber)" },
    { label: "Content Writer", detail: "Claude Sonnet generates 9 formats", color: "var(--blue)", dot: "var(--blue)" },
    { label: "Human Review", detail: "Approve, edit, or regenerate per format", color: "var(--teal)", dot: "var(--teal)" },
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
            <span className="hero-badge">LangChain PS Take-Home</span>
          </div>
          <h1 className="anim-fade-up d1">
            Niskanen Content Pipeline
          </h1>
          <p className="hero-desc anim-fade-up d2">
            Convert policy research papers into publication-ready content packages
            across nine formats. Five AI agents analyze, fact-check, match style, and
            write -- with per-format human review before anything ships.
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
            <span className="model">AWS Bedrock</span>
            <span className="sep">|</span>
            <span className="model">Claude Haiku + Sonnet</span>
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
          <MetricHighlight value="9" label="Output Formats" sublabel="Tweet to Instagram story" />
          <MetricHighlight value="5" label="AI Agents" sublabel="Fan-out parallel execution" />
          <MetricHighlight value="~$0.17" label="Per Paper" sublabel="Haiku analysis + Sonnet writing" />
          <MetricHighlight value="HITL" label="Human Review" sublabel="Per-format approve/edit/reject" />
        </div>
      </section>

      {/* Feature Cards */}
      <section className="section">
        <div className="container">
          <div className="section-header anim-fade-up">
            <h2>Five agents. One pipeline.</h2>
            <p>
              Each paper flows through specialized agents that extract research,
              map audiences, verify facts, match Niskanen's voice, and generate
              content -- all coordinated by a fan-out/fan-in topology.
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
              description="Analyzes the input article's sentence structure, rhetorical moves, and vocabulary patterns so the content writer can mirror Niskanen's voice."
              accentColor="teal"
              actionLabel="Learn more"
              onAction={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            />
            <FeatureCard
              icon={Pen}
              title="Content Writing"
              description="Claude Sonnet synthesizes all agent outputs into nine publication-ready formats, respecting fact-check results and audience tone."
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
              <h2 className="anim-fade-up d1">Paper to Content in Five Steps</h2>
              <p className="anim-fade-up d2">
                Every article URL flows through text extraction, research analysis,
                three parallel specialist agents, and content generation. Per-format
                human review ensures nothing publishes without editorial sign-off.
              </p>
              <div className="code-block anim-fade-up d3">
                <span className="comment">{"// Pipeline topology (JS fan-out/fan-in)"}</span><br />
                <span className="func">fetch_article</span><br />
                {"  -> "}
                <span className="func">research_analyst</span><br />
                {"  -> "}
                <span className="keyword">fan_out</span>{"("}<br />
                {"       "}
                <span className="func">audience_mapper</span>{","}<br />
                {"       "}
                <span className="func">citation_checker</span>{","}<br />
                {"       "}
                <span className="func">style_analyst</span><br />
                {"     )  -> "}
                <span className="keyword">fan_in</span><br />
                {"  -> "}
                <span className="func">content_writer</span> {"-> "}
                <span className="keyword">review</span>{"()  "}
                <span className="comment">{"// per-format HITL"}</span><br />
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
              The pipeline runs on AWS Lambda and costs nothing at idle. You pay only
              for Bedrock API calls (~$0.17/paper with dynamic Haiku+Sonnet routing) and
              negligible Lambda compute. S3 static hosting and CloudFront CDN are within
              free-tier limits for demo usage.
            </p>
          </div>
          <ArchLayer
            label="Orchestration"
            labelColor="var(--teal)"
            borderColor="var(--teal)"
            services={[
              { icon: "\u{1F9E9}", name: "JS Pipeline", desc: "Fan-out/fan-in topology" },
              { icon: "\u{2601}\u{FE0F}", name: "AWS Lambda", desc: "Serverless compute" },
              { icon: "\u{1F4E6}", name: "API Gateway", desc: "HTTP API + CORS" },
              { icon: "\u{270B}", name: "HITL Review", desc: "Per-format approval" },
            ]}
          />
          <ArchLayer
            label="AI Models"
            labelColor="var(--green)"
            borderColor="var(--green)"
            services={[
              { icon: "\u{1F9E0}", name: "Claude Haiku", desc: "4 analysis agents" },
              { icon: "\u{270D}\u{FE0F}", name: "Claude Sonnet", desc: "Content writer" },
              { icon: "\u{1F4CB}", name: "Dynamic Routing", desc: "Cost-quality balance" },
              { icon: "\u{1F50D}", name: "Tavily Search", desc: "Fact verification" },
            ]}
          />
          <ArchLayer
            label="Infrastructure"
            labelColor="var(--amber)"
            borderColor="var(--amber)"
            services={[
              { icon: "\u{1F4BE}", name: "S3", desc: "Static hosting + jobs" },
              { icon: "\u{1F310}", name: "CloudFront", desc: "CDN distribution" },
              { icon: "\u{1F4C4}", name: "Readability", desc: "Article extraction" },
              { icon: "\u{1F4C2}", name: "docx", desc: "Package generation" },
            ]}
          />
          <ArchLayer
            label="Observability"
            labelColor="var(--blue)"
            borderColor="var(--blue)"
            services={[
              { icon: "\u{1F50E}", name: "LangSmith", desc: "Trace every run" },
              { icon: "\u{1F4CA}", name: "Evaluators", desc: "4 custom metrics" },
              { icon: "\u{1F4D1}", name: "Annotations", desc: "Human feedback loop" },
              { icon: "\u{1F4B0}", name: "Cost Tracking", desc: "Per-paper estimates" },
            ]}
          />
        </div>
      </section>

      {/* Automated Posting Vision */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-header anim-fade-up">
            <h2>The Automation Roadmap</h2>
            <p>
              This pipeline is built to become the backbone of a think tank's communications workflow.
            </p>
          </div>
          <div className="use-grid">
            {[
              { icon: Send, title: "Social media auto-posting", text: "Once approved, social content will post directly to Twitter, Bluesky, LinkedIn, and Instagram via their APIs. Each platform's content is reviewed and approved individually before posting." },
              { icon: BookOpen, title: "Newsletter distribution", text: "Newsletter content routes to Mailchimp or Buttondown after approval. The pipeline generates the paragraph, an editor signs off, and it flows into the next issue." },
              { icon: FileText, title: "Document packages", text: "Op-eds, one-pagers, and media recommendations download as a .docx Comms Package for continued refinement, distribution to Hill staff, and submission to outlets." },
              { icon: DollarSign, title: "Zero idle cost", text: "The pipeline runs on AWS Lambda and costs nothing when not in use. You pay only for Bedrock API calls (~$0.17/paper with Haiku+Sonnet routing) and negligible Lambda compute. This scales linearly with usage." },
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

      {/* Use Cases */}
      <section className="section">
        <div className="container">
          <div className="section-header anim-fade-up">
            <h2>What this pipeline does</h2>
          </div>
          <div className="use-grid">
            {[
              { icon: FileText, title: "Generate 9 content formats", text: "From a single policy paper: 5 tweets, 3 LinkedIn posts, 5 Bluesky posts, newsletter paragraph, congressional one-pager, full op-ed, media placement recommendations, Instagram post, and Instagram story -- each with relevant hashtags." },
              { icon: Shield, title: "Verify claims before publishing", text: "The citation checker searches the web for each statistical claim in the paper and flags anything it can't corroborate. Only verified claims with source URLs reach the content writer." },
              { icon: Users, title: "Match audience and tone", text: "The audience mapper tailors tone per format -- punchy for Twitter, professional for LinkedIn, jargon-free for Congress." },
              { icon: Palette, title: "Write in Niskanen's voice", text: "The style agent analyzes the input article's sentence structure, rhetorical patterns, and vocabulary. The content writer mirrors these patterns so output sounds like the organization, not a chatbot." },
              { icon: Eye, title: "Per-format human review", text: "Each of the nine formats gets individual approve, edit, or reject controls. Social approvals simulate posting to the platform. Document approvals add to the .docx Comms Package." },
              { icon: DollarSign, title: "Dynamic model routing", text: "Claude Haiku handles four analysis agents (~$0.02 total). Claude Sonnet writes the content (~$0.15). This keeps per-paper cost around $0.17 while delivering high-quality writing where it matters." },
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
      <section className="section section-alt">
        <div className="container">
          <div style={{ marginBottom: "2.5rem" }}>
            <span className="section-badge badge-blue">Agent Routing</span>
            <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 1.875rem)", fontWeight: 700, color: "var(--foreground)" }}>
              Five agents. Two models.
            </h2>
            <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--muted-fg)", maxWidth: "36rem" }}>
              Analysis agents use Claude Haiku for speed and cost. The content
              writer uses Claude Sonnet for quality. Three agents run in parallel
              after the research analyst completes.
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
                ["Research Analyst", "Claude Haiku", "Thesis, evidence, implications", "Sequential (first)"],
                ["Audience Mapper", "Claude Haiku", "Tone + complexity per format", "Parallel"],
                ["Citation Checker", "Claude Haiku + Tavily", "Verify statistical claims", "Parallel"],
                ["Style Analyst", "Claude Haiku", "Extract writing patterns", "Parallel"],
                ["Content Writer", "Claude Sonnet", "Generate 9-format package", "Sequential (last)"],
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
            Paste a Niskanen Center article URL and watch the pipeline
            generate a full content package in under a minute.
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
            The pipeline coordinates five agents -- a research analyst, audience
            mapper, citation checker, style analyst, and content writer. Three of
            those agents (audience, citation, style) run in parallel after the
            research analyst completes. The content writer waits for all three to
            finish before generating nine output formats.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            Human-in-the-loop review is built in at the format level. After content
            generation, each of the nine formats gets individual approve, edit, or
            reject controls. Rejecting a format regenerates only that specific output
            using the cached intermediate agent data -- no need to re-run the full
            pipeline. Social format approvals show a mock of the automated posting
            flow. Document format approvals add to the downloadable .docx Comms Package.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            The evaluation framework includes four custom metrics: argument
            fidelity (does the tweet match the thesis?), fact grounding rate (are
            claims backed by verified sources?), tone calibration (is the
            one-pager jargon-free?), and format compliance (is the tweet under
            280 characters?).
          </p>
          <p style={{ marginBottom: "1rem" }}>
            The pipeline uses dynamic model routing to balance cost and quality.
            The four analysis agents (Research Analyst, Audience Mapper, Citation
            Checker, Style Analyst) run on Claude 3.5 Haiku for fast, cheap
            structured extraction. The Content Writer, which produces all
            publication-ready outputs, runs on Claude Sonnet for higher-quality
            long-form generation. This routing is configurable via environment
            variables (BEDROCK_MODEL_ID for analysis, SONNET_MODEL_ID for
            writing), letting operators tune the cost-quality tradeoff. The
            approach keeps per-paper cost around $0.17 while delivering
            Sonnet-quality writing where it matters most.
          </p>
          <p>
            Everything runs on AWS. Claude via Bedrock, Tavily free tier for web
            search, LangSmith for tracing. The pipeline runs on Lambda and costs
            nothing at idle. You pay only for Bedrock API calls and negligible
            Lambda compute. S3 static hosting and CloudFront CDN are within
            free-tier limits for demo usage. This architecture scales linearly
            with usage and requires no standing infrastructure.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/*  Agent Work Panels -- proof of intermediate agent outputs                   */
/* ========================================================================== */

function AgentPanel({ title, accent, icon: Icon, timing, description, defaultOpen, children }) {
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
      {open && (
        <div className="agent-panel-body">
          {description && <p className="agent-panel-desc">{description}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

function ResearchPanel({ data, timing }) {
  if (!data) return null;
  return (
    <AgentPanel title="Research Analysis" accent="blue" icon={Search} timing={timing} description={AGENT_DESCRIPTIONS.research}>
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
    <AgentPanel title="Audience Mapping" accent="green" icon={Users} timing={timing} description={AGENT_DESCRIPTIONS.audience}>
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
    <AgentPanel title="Citation Verification" accent="amber" icon={Shield} timing={timing} description={AGENT_DESCRIPTIONS.citation}>
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
    <AgentPanel title="Style Analysis" accent="teal" icon={Palette} timing={timing} description={AGENT_DESCRIPTIONS.style}>
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
/*  Pipeline Flow Visualization                                                */
/* ========================================================================== */

function PipelineFlowDiagram({ currentStep, status }) {
  const nodes = [
    { id: "fetch", label: "Fetch", step: 1, x: 0, y: 50 },
    { id: "research", label: "Research", step: 2, x: 1, y: 50 },
    { id: "audience", label: "Audience", step: 3, x: 2, y: 15 },
    { id: "citation", label: "Citation", step: 4, x: 2, y: 50 },
    { id: "style", label: "Style", step: 5, x: 2, y: 85 },
    { id: "writer", label: "Writer", step: 6, x: 3, y: 50 },
    { id: "review", label: "Review", step: 7, x: 4, y: 50 },
  ];

  const edges = [
    { from: "fetch", to: "research" },
    { from: "research", to: "audience" },
    { from: "research", to: "citation" },
    { from: "research", to: "style" },
    { from: "audience", to: "writer" },
    { from: "citation", to: "writer" },
    { from: "style", to: "writer" },
    { from: "writer", to: "review" },
  ];

  const getNodeState = (step) => {
    if (status === "done" || status === "review") return "done";
    if (step < currentStep) return "done";
    if (step === currentStep) return "active";
    // Steps 3,4,5 are parallel -- if currentStep >= 3, all three are active
    if ([3, 4, 5].includes(step) && currentStep >= 3 && currentStep <= 5) return "active";
    return "idle";
  };

  return (
    <div className="pipeline-flow-diagram">
      <svg className="pipeline-flow-svg" viewBox="0 0 500 100" preserveAspectRatio="xMidYMid meet">
        {edges.map(({ from, to }) => {
          const fromNode = nodes.find((n) => n.id === from);
          const toNode = nodes.find((n) => n.id === to);
          const x1 = fromNode.x * 115 + 50;
          const y1 = fromNode.y;
          const x2 = toNode.x * 115 + 50;
          const y2 = toNode.y;
          const fromState = getNodeState(fromNode.step);
          const isActive = fromState === "done" || fromState === "active";
          return (
            <line
              key={`${from}-${to}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              className={`flow-connector ${isActive ? "active" : ""}`}
            />
          );
        })}
      </svg>
      <div className="pipeline-flow-nodes">
        {nodes.map((node) => {
          const state = getNodeState(node.step);
          return (
            <div
              key={node.id}
              className={`flow-node node-${state}`}
              style={{ left: `${(node.x / 4) * 100}%`, top: `${node.y}%` }}
            >
              <span>{node.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Evals Page -- LangSmith observability, annotations, AI assessment          */
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

  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState(null);

  const [evals, setEvals] = useState([]);
  const [evalsLoading, setEvalsLoading] = useState(false);

  const [annotateRunId, setAnnotateRunId] = useState("");
  const [ratings, setRatings] = useState({
    content_quality: 0, factual_accuracy: 0, tone: 0, actionability: 0, overall: 0,
  });
  const [annotateNotes, setAnnotateNotes] = useState("");
  const [annotateStatus, setAnnotateStatus] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);

  const [assessTimeRange, setAssessTimeRange] = useState("7d");
  const [assessment, setAssessment] = useState(null);
  const [assessLoading, setAssessLoading] = useState(false);
  const [assessError, setAssessError] = useState(null);

  const loadRuns = useCallback(() => {
    setRunsLoading(true);
    setRunsError(null);
    fetch(`${API_BASE}/api/traces?limit=20`)
      .then((r) => r.json())
      .then((d) => { setRuns(d.runs || []); setRunsLoading(false); })
      .catch((e) => { setRunsError(e.message); setRunsLoading(false); });
  }, []);

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

  const generateAssessment = async () => {
    setAssessLoading(true);
    setAssessError(null);
    try {
      const traceResp = await fetch(`${API_BASE}/api/traces?limit=50`);
      if (!traceResp.ok) {
        const errData = await traceResp.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch traces (${traceResp.status})`);
      }
      const traceData = await traceResp.json();
      const runs = traceData?.runs || [];
      if (runs.length === 0) {
        throw new Error("No pipeline runs found. Run the pipeline at least once before generating an assessment.");
      }
      const resp = await fetch(`${API_BASE}/api/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceData, timeRange: assessTimeRange }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Assessment failed (${resp.status})`);
      }
      const d = await resp.json();
      setAssessment(d.assessment);
    } catch (e) {
      setAssessError(e.message);
    }
    setAssessLoading(false);
  };

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
              Traces appear automatically when LANGSMITH_API_KEY is configured.
            </p>
          </div>
        </div>

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
  const [activeTab, setActiveTab] = useState("twitter_posts");
  const [errors, setErrors] = useState([]);
  const [articleMeta, setArticleMeta] = useState(null);

  // Per-format HITL state
  const [formatStatus, setFormatStatus] = useState({});
  const [editedContent, setEditedContent] = useState({});
  const [editingFormat, setEditingFormat] = useState(null);
  const [editText, setEditText] = useState("");
  const [regenerating, setRegenerating] = useState(null);

  const allApproved = FORMATS.every((f) => formatStatus[f.key] === "approved");

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
      setArticleMeta(null);
      setFormatStatus({});
      setEditedContent({});
      setEditingFormat(null);
      setRegenerating(null);
      runPipeline(
        url,
        (step) => setCurrentStep(step),
        (data) => {
          setAgentData({
            research_summary: data.research_summary,
            audience_map: data.audience_map,
            fact_check_report: data.fact_check_report,
            style_patterns: data.style_patterns,
          });
          setAgentTimings(data.agent_timings);
          setArticleMeta(data.article || null);
          setContentPackage(data.content);
          setCurrentStep(7);
          setStatus("review");
          // Initialize all formats as pending
          const initial = {};
          FORMATS.forEach((f) => { initial[f.key] = "pending"; });
          setFormatStatus(initial);
        },
        (errMsg) => {
          setErrors((prev) => [...prev, errMsg]);
          setStatus("error");
        }
      );
    },
    [url]
  );

  const clearResults = useCallback(() => {
    setStatus("idle");
    setCurrentStep(0);
    setContentPackage(null);
    setAgentData(null);
    setAgentTimings(null);
    setArticleMeta(null);
    setFormatStatus({});
    setEditedContent({});
    setEditingFormat(null);
    setRegenerating(null);
    setErrors([]);
  }, []);

  const handleApprove = useCallback((formatKey) => {
    setFormatStatus((prev) => ({ ...prev, [formatKey]: "approved" }));
  }, []);

  const handleStartEdit = useCallback((formatKey) => {
    const current = editedContent[formatKey] || contentPackage?.[formatKey];
    const displayText = typeof current === "string" ? current : formatForDisplay(current);
    setEditText(displayText);
    setEditingFormat(formatKey);
    setFormatStatus((prev) => ({ ...prev, [formatKey]: "editing" }));
  }, [editedContent, contentPackage]);

  const handleSaveEdit = useCallback((formatKey) => {
    setEditedContent((prev) => ({ ...prev, [formatKey]: editText }));
    setEditingFormat(null);
    setFormatStatus((prev) => ({ ...prev, [formatKey]: "pending" }));
  }, [editText]);

  const handleCancelEdit = useCallback((formatKey) => {
    setEditingFormat(null);
    setFormatStatus((prev) => ({ ...prev, [formatKey]: "pending" }));
  }, []);

  const handleReject = useCallback(async (formatKey) => {
    if (!agentData || !articleMeta) return;
    setRegenerating(formatKey);
    setFormatStatus((prev) => ({ ...prev, [formatKey]: "rejected" }));
    try {
      const res = await fetch(`${API_BASE}/api/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formatKey,
          article: articleMeta,
          research: agentData.research_summary,
          audience: agentData.audience_map,
          facts: agentData.fact_check_report,
          style: agentData.style_patterns,
        }),
      });
      const data = await res.json();
      if (data.success && data.content) {
        setContentPackage((prev) => ({ ...prev, [formatKey]: data.content }));
        setEditedContent((prev) => {
          const next = { ...prev };
          delete next[formatKey];
          return next;
        });
      }
    } catch (err) {
      setErrors((prev) => [...prev, `Regenerate failed: ${err.message}`]);
    }
    setRegenerating(null);
    setFormatStatus((prev) => ({ ...prev, [formatKey]: "pending" }));
  }, [agentData, articleMeta]);

  const downloadDocx = useCallback(async () => {
    if (!contentPackage) return;
    try {
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
      const { saveAs } = await import("file-saver");

      const title = articleMeta?.title || "Content Package";
      const sections = [];

      sections.push(
        new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
        new Paragraph({ text: "" }),
      );
      if (articleMeta?.author) {
        sections.push(new Paragraph({ children: [new TextRun({ text: `Author: ${articleMeta.author}`, italics: true })] }));
      }
      sections.push(
        new Paragraph({ children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString()}`, italics: true })] }),
        new Paragraph({ text: "" }),
      );

      for (const fmt of FORMATS) {
        const raw = editedContent[fmt.key] || contentPackage[fmt.key];
        if (!raw) continue;

        sections.push(
          new Paragraph({ text: fmt.label, heading: HeadingLevel.HEADING_1 }),
        );

        // Handle arrays (multiple social posts)
        if (Array.isArray(raw)) {
          raw.forEach((item, idx) => {
            const text = typeof item === "string" ? item : formatForDisplay(item);
            sections.push(
              new Paragraph({ text: `${fmt.label} ${idx + 1} of ${raw.length}`, heading: HeadingLevel.HEADING_2 }),
              ...text.split("\n").map((line) => new Paragraph({ text: line })),
              new Paragraph({ text: "" }),
            );
          });
        } else {
          const displayText = typeof raw === "string" ? raw : formatForDisplay(raw);
          sections.push(
            ...displayText.split("\n").map((line) => new Paragraph({ text: line })),
            new Paragraph({ text: "" }),
          );
        }
      }

      const doc = new Document({ sections: [{ children: sections }] });
      const blob = await Packer.toBlob(doc);
      const safeName = title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_").slice(0, 50);
      saveAs(blob, `${safeName}_content_package.docx`);
    } catch (err) {
      console.error("Failed to generate .docx:", err);
    }
  }, [contentPackage, editedContent, articleMeta]);

  // Get active content (respecting edits and array formats)
  const rawContent = editedContent[activeTab] || contentPackage?.[activeTab] || "";
  const activeMeta = FORMATS.find((f) => f.key === activeTab);
  const isArrayFormat = Array.isArray(rawContent);
  const activeContent = isArrayFormat ? rawContent : formatForDisplay(rawContent);

  // Determine if we should render MediaRecsDisplay specially
  const isMediaRecs = activeTab === "media_outlet_recommendations" &&
    rawContent && typeof rawContent === "object" && !Array.isArray(rawContent) &&
    (rawContent["PRIMARY TARGETS"] || rawContent["primary_targets"]);

  return (
    <div className="pipeline-page">
      <div className="container">
        {/* Upload */}
        <div className="upload-zone anim-fade-up">
          <div className="upload-zone-header">
            <h2>Process a policy paper</h2>
            {contentPackage && (
              <button className="btn btn-sm btn-outline" onClick={clearResults} title="Clear results">
                <Trash2 size={14} /> Clear
              </button>
            )}
          </div>
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

        {/* Pipeline Flow Visualization */}
        {status !== "idle" && (
          <div className="anim-fade-up">
            <PipelineFlowDiagram currentStep={currentStep} status={status} />
          </div>
        )}

        {/* Step Progress */}
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

        {/* Content Package with per-format HITL controls */}
        {contentPackage && (
          <div className="content-card anim-fade-up">
            <div className="content-card-header">
              <h3>Content Package</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {agentTimings?.content_writer && (
                  <span className="agent-panel-timing">
                    <Clock size={12} /> {(agentTimings.content_writer / 1000).toFixed(1)}s
                  </span>
                )}
                <button
                  className={`btn btn-sm ${allApproved ? "btn-primary" : "btn-outline"}`}
                  onClick={downloadDocx}
                  title={allApproved ? "Download approved content" : "Download current content"}
                >
                  <Download size={14} /> .docx
                </button>
              </div>
            </div>
            <div className="tabs">
              {FORMATS.map((f) => {
                const fStatus = formatStatus[f.key];
                const statusCls = fStatus === "approved" ? " tab-approved"
                  : fStatus === "rejected" ? " tab-rejected"
                  : "";
                return (
                  <button
                    key={f.key}
                    className={`tab${activeTab === f.key ? " active" : ""}${statusCls}`}
                    onClick={() => setActiveTab(f.key)}
                  >
                    {fStatus === "approved" && <CheckCircle size={12} />}
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div className="tab-content">
              {/* Editing mode */}
              {editingFormat === activeTab ? (
                <div className="edit-mode">
                  <textarea
                    className="edit-textarea"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={12}
                  />
                  <div className="edit-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => handleSaveEdit(activeTab)}>
                      Save
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => handleCancelEdit(activeTab)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : regenerating === activeTab ? (
                <div className="regenerating-state">
                  <Loader2 size={24} className="spin" />
                  <p>Regenerating {activeMeta?.label}...</p>
                </div>
              ) : isMediaRecs ? (
                <MediaRecsDisplay data={rawContent} />
              ) : isArrayFormat ? (
                /* Render array of posts (multiple tweets, linkedin, bluesky) */
                <div className="array-posts">
                  {rawContent.map((item, idx) => {
                    const text = typeof item === "string" ? item : formatForDisplay(item);
                    const count = activeMeta?.limit ? measure(text, activeMeta.unit) : null;
                    const over = activeMeta?.limit && count > activeMeta.limit;
                    return (
                      <div key={idx} className="array-post-item">
                        <div className="array-post-header">
                          <span className="array-post-num">{activeMeta?.label} {idx + 1} of {rawContent.length}</span>
                          {count !== null && (
                            <span className={`char-count-inline${over ? " over" : ""}`}>
                              {count} {activeMeta.unit}{activeMeta.limit ? ` / ${activeMeta.limit}` : ""}
                            </span>
                          )}
                        </div>
                        <pre className="array-post-text">{text}</pre>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Single-value format */
                <>
                  <pre>{activeContent}</pre>
                  {activeMeta?.limit && (
                    <div className={`char-count${measure(activeContent, activeMeta.unit) > activeMeta.limit ? " over" : ""}`}>
                      {measure(activeContent, activeMeta.unit)} {activeMeta.unit}
                      {` / ${activeMeta.limit} limit`}
                      {measure(activeContent, activeMeta.unit) > activeMeta.limit && " -- over limit"}
                    </div>
                  )}
                </>
              )}

              {/* Per-format HITL controls */}
              {(status === "review" || status === "done") && editingFormat !== activeTab && regenerating !== activeTab && (
                <div className="hitl-controls">
                  <div className="hitl-status">
                    <span className={`hitl-badge hitl-${formatStatus[activeTab] || "pending"}`}>
                      {(formatStatus[activeTab] || "pending").charAt(0).toUpperCase() + (formatStatus[activeTab] || "pending").slice(1)}
                    </span>
                  </div>
                  <div className="hitl-actions">
                    <button
                      className="btn btn-sm btn-green"
                      onClick={() => handleApprove(activeTab)}
                      disabled={formatStatus[activeTab] === "approved"}
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleStartEdit(activeTab)}
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      className="btn btn-sm btn-warn"
                      onClick={() => handleReject(activeTab)}
                    >
                      <RotateCcw size={14} /> Reject & Regenerate
                    </button>
                  </div>

                  {/* Approval confirmation messages */}
                  {formatStatus[activeTab] === "approved" && SOCIAL_FORMATS.has(activeTab) && (
                    <div className="hitl-approved-banner social-banner">
                      <Send size={18} />
                      <div>
                        <strong>Approved for {activeMeta?.platform || "social"}</strong>
                        <p>Once automated, this system would post directly to {activeMeta?.platform}. Content saved to your .docx package.</p>
                      </div>
                    </div>
                  )}
                  {formatStatus[activeTab] === "approved" && DOC_FORMATS.has(activeTab) && (
                    <div className="hitl-approved-banner doc-banner">
                      <FileText size={18} />
                      <div>
                        <strong>Approved</strong>
                        <p>This will be included in your downloadable .docx Comms Package for further refinement and distribution.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* All-approved banner */}
        {allApproved && Object.keys(formatStatus).length > 0 && (
          <div className="done-banner anim-fade-up">
            <h3>All formats approved</h3>
            <p>
              Your content package is ready. Download the .docx Comms Package above.
              Social content is queued for automated posting once platform integrations are connected.
            </p>
          </div>
        )}

        {/* Agent Work Panels */}
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

        {/* Empty state */}
        {status === "idle" && !contentPackage && (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--muted-fg)" }}>
            <FileText size={48} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
            <p style={{ fontSize: "0.9375rem", maxWidth: "28rem", margin: "0 auto" }}>
              Enter a Niskanen Center article URL above to generate a content
              package with nine formats: tweets, LinkedIn posts, Bluesky posts,
              newsletter, one-pager, op-ed, media placement recommendations,
              Instagram post, and Instagram story.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  App Root -- CSS display toggling for persistent state                      */
/* ========================================================================== */

export default function App() {
  const [page, setPage] = useState("home");
  const [dark, setDark] = useState(true);

  return (
    <div className={`app${dark ? "" : " light"}`}>
      <Nav page={page} setPage={setPage} dark={dark} setDark={setDark} />

      <div style={{ display: page === "home" ? "block" : "none" }}>
        <LandingPage setPage={setPage} />
      </div>
      <div style={{ display: page === "pipeline" ? "block" : "none" }}>
        <PipelinePage />
      </div>
      <div style={{ display: page === "evals" ? "block" : "none" }}>
        <EvalsPage />
      </div>
      <div style={{ display: page === "about" ? "block" : "none" }}>
        <AboutPage />
      </div>

      <Footer />
    </div>
  );
}
