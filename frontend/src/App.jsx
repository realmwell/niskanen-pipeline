import { useState, useEffect, useCallback } from "react";

const STEPS = [
  "Upload",
  "Extract PDF",
  "Supervisor",
  "Research Analyst",
  "Parallel Agents",
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
  if (!text) return 0;
  if (unit === "words") return text.trim().split(/\s+/).length;
  return text.length;
}

// Simulated pipeline run for demo purposes.
// In production this would call API Gateway -> Lambda -> LangGraph.
function simulatePipeline(url, onStep, onDone, onError) {
  const delays = [800, 1500, 600, 2000, 3000, 2500];
  let step = 1;

  function advance() {
    if (step > 6) {
      onDone(makeDemoPackage(url));
      return;
    }
    onStep(step);
    setTimeout(() => {
      step++;
      advance();
    }, delays[step - 1]);
  }

  advance();
}

function makeDemoPackage(url) {
  return {
    twitter_post:
      "New research from @NiskanenCenter: Unemployment insurance hasn't been meaningfully updated since 1935. A dynamic UI system tied to local labor market conditions would reach workers faster and reduce long-term unemployment spells.",
    linkedin_post:
      "The U.S. unemployment insurance system was designed for a 1935 labor market. Nearly 90 years later, the fundamental structure remains unchanged despite dramatic shifts in how Americans work.\n\nNew research from the Niskanen Center proposes a dynamic UI framework that automatically adjusts benefit duration and replacement rates based on local labor market conditions. The key finding: states with more responsive UI systems saw 12% shorter unemployment spells and better long-term earnings outcomes for displaced workers.\n\nThe policy implications extend beyond UI itself -- this model could reshape how we think about automatic stabilizers across the social safety net.",
    bluesky_post:
      "Unemployment insurance hasn't been meaningfully updated since 1935. New Niskanen research proposes tying benefits to local labor market conditions -- states that tried this approach saw 12% shorter unemployment spells.",
    newsletter_paragraph:
      "This week we released new research on modernizing unemployment insurance. The core argument: a system designed in 1935 cannot adequately serve a 2024 labor market. The paper proposes a dynamic framework where benefit duration and replacement rates automatically adjust based on local economic conditions. States that have experimented with responsive UI systems saw measurably shorter unemployment spells and better long-term outcomes for displaced workers. The full paper examines four state-level case studies and proposes model legislation for congressional consideration.",
    congressional_one_pager:
      "MODERNIZING UNEMPLOYMENT INSURANCE\n\nThe Problem\nThe U.S. unemployment insurance system has not been structurally updated since the Social Security Act of 1935. Current UI:\n- Uses fixed benefit durations regardless of local economic conditions\n- Replaces only 30-40% of prior wages in most states\n- Excludes gig workers, part-time employees, and self-employed individuals\n- Takes 3-6 weeks to deliver first payments during recessions\n\nThe Evidence\n- States with trigger-based UI extensions saw 12% shorter unemployment spells\n- Dynamic replacement rates improved re-employment earnings by 8%\n- Faster benefit delivery reduced household debt accumulation by 15%\n- Four state case studies confirm these findings across diverse labor markets\n\nThe Proposal\n- Tie benefit duration to local unemployment rates using automatic triggers\n- Index replacement rates to regional cost of living\n- Expand eligibility to include non-traditional workers\n- Modernize delivery infrastructure for same-week payment processing\n\nBottom line: A dynamic unemployment insurance system that responds to local labor market conditions would reduce unemployment duration, improve worker outcomes, and function as a more effective automatic stabilizer during economic downturns.",
    full_oped:
      "The unemployment insurance system Americans rely on was built for a labor market that no longer exists. When the Social Security Act of 1935 created UI, most workers held single full-time jobs with one employer for decades. The system was designed accordingly: fixed benefit durations, flat replacement rates, and eligibility rules tied to traditional employment.\n\nNearly 90 years later, the American labor market looks nothing like that. Gig work, contract employment, and multiple part-time jobs are common. Workers change jobs more frequently. Recessions hit different regions at different speeds. Yet the fundamental UI structure remains unchanged.\n\nNew research from the Niskanen Center examines what happens when states break from this rigid model. The findings are clear: dynamic UI systems that adjust to local conditions produce better outcomes.\n\nFour state case studies show that trigger-based benefit extensions -- where UI duration automatically increases when local unemployment rises above a threshold -- reduced average unemployment spells by 12 percent compared to fixed-duration programs. Workers in these states also earned 8 percent more in their first year of re-employment.\n\nThe mechanism is straightforward. When benefits respond to actual conditions rather than arbitrary federal schedules, workers spend less time in the wrong job or no job. They can afford to search for positions that match their skills rather than accepting the first available paycheck.\n\nCritics will argue that more responsive benefits discourage job-seeking. The data says otherwise. States with dynamic replacement rates saw faster re-employment, not slower. The key is calibration: benefits that are adequate enough to support effective job search but indexed to conditions that naturally taper as markets recover.\n\nThe policy path forward involves three changes. First, replace fixed benefit durations with automatic triggers tied to local unemployment rates. Second, index replacement rates to regional cost of living so a displaced worker in San Francisco and a displaced worker in rural Tennessee receive proportionally similar support. Third, expand eligibility to cover the millions of workers the 1935 framework never anticipated.\n\nCongress has the opportunity to modernize a system that serves as one of the country's most important automatic stabilizers. The evidence from state experiments shows the way forward. The question is whether Washington will follow it.",
    media_outlet_recommendations:
      "PRIMARY TARGETS\n- Wall Street Journal (op-ed page): Strong fit for economic policy reform argument with empirical backing. Pitch the op-ed draft directly.\n- Politico (Morning Money or policy verticals): UI reform is active legislative territory. Pitch as exclusive policy analysis.\n- The Atlantic (Ideas section): Longer-form argument about modernizing Depression-era policy for modern labor markets.\n\nSECONDARY TARGETS\n- Brookings (blog/commentary): Cross-post or adapted version for policy audience.\n- Bloomberg Opinion: Economic policy reform with data backing.\n- Washington Post (Opinions): If WSJ passes, strong alternative for op-ed placement.\n\nBEAT REPORTERS\n- Labor/employment reporters at NYT, WaPo, Reuters for straight news coverage of the research findings.\n- State policy reporters in the four case study states for localized coverage.\n\nTIMING: Align with any upcoming congressional hearings on labor policy, Jobs Friday data releases, or state legislative sessions considering UI reform.",
  };
}

export default function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | running | review | done | error
  const [currentStep, setCurrentStep] = useState(0);
  const [contentPackage, setContentPackage] = useState(null);
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
      setDecision("");
      setFeedback("");

      simulatePipeline(
        url,
        (step) => setCurrentStep(step),
        (pkg) => {
          setContentPackage(pkg);
          setCurrentStep(6);
          setStatus("review");
        },
        (err) => {
          setErrors((prev) => [...prev, err]);
          setStatus("error");
        }
      );
    },
    [url]
  );

  const handleReview = useCallback(
    (action) => {
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
    },
    []
  );

  const activeContent = contentPackage?.[activeTab] || "";
  const activeMeta = FORMATS.find((f) => f.key === activeTab);
  const count = activeMeta?.limit ? measure(activeContent, activeMeta.unit) : null;
  const isOver = activeMeta?.limit && count > activeMeta.limit;

  return (
    <div className="app">
      <header className="header">
        <h1>Niskanen Content Pipeline</h1>
        <span className="tag">LangGraph + AWS</span>
      </header>

      <main className="main">
        {/* Upload */}
        <section className="upload-section">
          <h2>Process a policy paper</h2>
          <form className="input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Paste a PDF URL (e.g. https://niskanencenter.org/...pdf)"
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
                <>
                  <span className="spinner" />
                  Processing...
                </>
              ) : (
                "Run Pipeline"
              )}
            </button>
          </form>
        </section>

        {/* Status tracker */}
        {status !== "idle" && (
          <section className="status-tracker">
            <h3>Pipeline progress</h3>
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
          </section>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="errors">
            <h4>Errors</h4>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Content display */}
        {contentPackage && (
          <section className="content-section">
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
          </section>
        )}

        {/* Review */}
        {status === "review" && (
          <section className="review-section">
            <h3>Human review</h3>
            <div className="review-actions">
              <button
                className="btn btn-green"
                onClick={() => handleReview("approve")}
              >
                Approve
              </button>
              <button
                className="btn btn-warn"
                onClick={() => handleReview("revise")}
              >
                Revise
              </button>
              <button
                className="btn btn-red"
                onClick={() => handleReview("escalate")}
              >
                Escalate
              </button>
            </div>
            <textarea
              className="feedback-input"
              placeholder="Optional: add feedback for the content writer..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </section>
        )}

        {/* Done state */}
        {status === "done" && (
          <section className="review-section">
            <h3>
              {decision === "approve"
                ? "Content approved and saved"
                : "Escalated to editorial team"}
            </h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              {decision === "approve"
                ? "The content package has been written to outputs/ as JSON. View the full trace in LangSmith."
                : "This paper has been flagged for manual review. The pipeline state is preserved for resumption."}
            </p>
          </section>
        )}

        {/* Empty state */}
        {status === "idle" && (
          <div className="empty-state">
            <p>
              Enter a Niskanen Center PDF URL above to generate a content
              package with seven formats: tweet, LinkedIn post, Bluesky post,
              newsletter paragraph, congressional one-pager, op-ed draft, and
              media placement recommendations.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
