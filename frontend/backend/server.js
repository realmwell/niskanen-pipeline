import express from "express";
import cors from "cors";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { fetchArticleText, runAgentPipeline } from "./pipeline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (two levels up)
dotenv.config({ path: resolve(__dirname, "../../.env") });

const app = express();
app.use(cors());
app.use(express.json());

// Uses AWS credentials from ~/.aws/credentials (standard credential chain)
const client = new AnthropicBedrock({
  awsRegion: process.env.AWS_DEFAULT_REGION || "us-east-1",
});

const BEDROCK_MODEL = process.env.SONNET_MODEL_ID || "us.anthropic.claude-3-5-haiku-20241022-v1:0";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

/* ------------------------------------------------------------------
   API endpoint: Generate content package via multi-agent pipeline
   ------------------------------------------------------------------ */

// In-memory job store for local dev (Lambda uses S3)
const jobs = new Map();

app.post("/api/generate", async (req, res) => {
  const { url, jobId } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  if (jobId) jobs.set(jobId, { status: "running" });

  console.log(`[pipeline] Processing: ${url}`);
  const startTime = Date.now();

  try {
    console.log("[pipeline] Fetching article...");
    const article = await fetchArticleText(url);
    console.log(
      `[pipeline] Extracted ${article.wordCount} words: "${article.title}"`
    );

    console.log("[pipeline] Running 5-agent pipeline...");
    console.log(`[pipeline] Model: ${BEDROCK_MODEL}`);
    console.log(`[pipeline] Tavily: ${TAVILY_API_KEY ? "configured" : "not configured"}`);

    const result = await runAgentPipeline(client, BEDROCK_MODEL, TAVILY_API_KEY, article);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[pipeline] Done in ${elapsed}s`);
    console.log(`[pipeline] Agent timings:`, result.agent_timings);

    const responseData = {
      success: true,
      article: { title: article.title, author: article.author, wordCount: article.wordCount },
      research_summary: result.research_summary,
      audience_map: result.audience_map,
      fact_check_report: result.fact_check_report,
      style_patterns: result.style_patterns,
      content: result.content,
      agent_timings: result.agent_timings,
      elapsed: parseFloat(elapsed),
    };

    if (jobId) jobs.set(jobId, { status: "done", ...responseData });
    res.json(responseData);
  } catch (err) {
    console.error(`[pipeline] Error: ${err.message}`);
    const errorData = {
      error: err.message,
      suggestion: err.message.includes("PDF_UNSUPPORTED")
        ? "Paste the article's web page URL instead of a direct PDF link."
        : "Check that the URL is accessible and AWS credentials are configured.",
    };
    if (jobId) jobs.set(jobId, { status: "error", ...errorData });
    res.status(500).json(errorData);
  }
});

app.get("/api/status/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

/* ------------------------------------------------------------------
   Health check
   ------------------------------------------------------------------ */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    backend: "bedrock",
    model: BEDROCK_MODEL,
    region: process.env.AWS_DEFAULT_REGION || "us-east-1",
    agents: ["research_analyst", "audience_mapper", "citation_checker", "style_analyst", "content_writer"],
    tavily: TAVILY_API_KEY ? "configured" : "not_configured",
  });
});

/* ------------------------------------------------------------------
   Evals endpoints — LangSmith proxy + AI assessment
   ------------------------------------------------------------------ */

const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY || "";
const LANGSMITH_BASE = "https://api.smith.langchain.com/api/v1";

function langsmithHeaders() {
  return {
    "x-api-key": LANGSMITH_API_KEY,
    "Content-Type": "application/json",
  };
}

// GET /api/traces — list recent pipeline runs
app.get("/api/traces", async (req, res) => {
  if (!LANGSMITH_API_KEY) {
    return res.status(503).json({ error: "LangSmith API key not configured" });
  }
  const project = req.query.project || "takehome";
  const limit = parseInt(req.query.limit) || 20;

  try {
    const resp = await fetch(`${LANGSMITH_BASE}/runs/query`, {
      method: "POST",
      headers: langsmithHeaders(),
      body: JSON.stringify({
        project_name: project,
        is_root: true,
        limit,
        order: "desc",
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "Unknown error");
      return res.status(resp.status).json({ error: `LangSmith API error (${resp.status}): ${errText.slice(0, 200)}` });
    }
    const data = await resp.json();
    const runs = (data.runs || data || []).map((r) => ({
      run_id: r.id,
      name: r.name,
      status: r.status,
      start_time: r.start_time,
      end_time: r.end_time,
      total_tokens: r.total_tokens,
      total_cost: r.total_cost,
      error: r.error,
      tags: r.tags || [],
      inputs: r.inputs,
      outputs: r.outputs,
    }));
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/traces/:runId — trace detail with child spans
app.get("/api/traces/:runId", async (req, res) => {
  if (!LANGSMITH_API_KEY) {
    return res.status(503).json({ error: "LangSmith API key not configured" });
  }
  try {
    // Fetch the root run
    const rootResp = await fetch(`${LANGSMITH_BASE}/runs/${req.params.runId}`, {
      headers: langsmithHeaders(),
    });
    if (!rootResp.ok) {
      const errText = await rootResp.text().catch(() => "Unknown error");
      return res.status(rootResp.status).json({ error: `LangSmith API error (${rootResp.status}): ${errText.slice(0, 200)}` });
    }
    const root = await rootResp.json();

    // Fetch child runs
    const childResp = await fetch(`${LANGSMITH_BASE}/runs/query`, {
      method: "POST",
      headers: langsmithHeaders(),
      body: JSON.stringify({ trace_id: req.params.runId, limit: 50 }),
    });
    if (!childResp.ok) {
      return res.json({ root, children: [] });
    }
    const childData = await childResp.json();
    const children = (childData.runs || childData || []).map((r) => ({
      id: r.id,
      name: r.name,
      run_type: r.run_type,
      status: r.status,
      start_time: r.start_time,
      end_time: r.end_time,
      total_tokens: r.total_tokens,
      error: r.error,
      inputs: r.inputs,
      outputs: r.outputs,
    }));

    res.json({ root, children });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evals — evaluation results from the eval project
app.get("/api/evals", async (req, res) => {
  if (!LANGSMITH_API_KEY) {
    return res.status(503).json({ error: "LangSmith API key not configured" });
  }
  const dataset = req.query.dataset || "niskanen-pipeline-eval";

  try {
    const resp = await fetch(`${LANGSMITH_BASE}/runs/query`, {
      method: "POST",
      headers: langsmithHeaders(),
      body: JSON.stringify({
        project_name: dataset,
        is_root: true,
        limit: 50,
      }),
    });
    const data = await resp.json();
    res.json({ evaluations: data.runs || data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/annotate — store feedback in LangSmith
app.post("/api/annotate", async (req, res) => {
  if (!LANGSMITH_API_KEY) {
    return res.status(503).json({ error: "LangSmith API key not configured" });
  }
  const { run_id, key, score, comment } = req.body;
  if (!run_id || !key) {
    return res.status(400).json({ error: "run_id and key are required" });
  }

  try {
    const resp = await fetch(`${LANGSMITH_BASE}/feedback`, {
      method: "POST",
      headers: langsmithHeaders(),
      body: JSON.stringify({ run_id, key, score, comment }),
    });
    const data = await resp.json();
    res.json({ success: true, feedback: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assess — AI-generated assessment via Bedrock
app.post("/api/assess", async (req, res) => {
  const { traceData, annotations, timeRange } = req.body;

  // Validate that traceData actually contains runs before sending to Claude
  const runs = traceData?.runs || [];
  if (!traceData || traceData.error || runs.length === 0) {
    return res.status(400).json({
      error: traceData?.error
        ? `Cannot generate assessment: ${traceData.error}`
        : "No pipeline runs found. Run the pipeline at least once before generating an assessment.",
    });
  }

  const prompt = `You are an operations analyst for an AI content pipeline. Analyze the following pipeline trace data and annotations, then produce a structured assessment.

TRACE DATA:
${JSON.stringify(traceData, null, 2)}

${annotations ? `HUMAN ANNOTATIONS:\n${JSON.stringify(annotations, null, 2)}` : ""}

${timeRange ? `TIME RANGE: ${timeRange}` : ""}

Produce a JSON assessment with these fields:
{
  "executive_summary": "2-3 sentence overview",
  "findings": [
    { "title": "Finding title", "detail": "Explanation with specific data", "severity": "high|medium|low" }
  ],
  "technical_recommendations": [
    { "action": "Specific fix", "impact": "Expected improvement", "effort": "high|medium|low" }
  ],
  "executive_recommendations": [
    { "action": "Business-friendly description", "impact": "ROI or time saved", "priority": 1 }
  ]
}

Return ONLY valid JSON.`;

  try {
    const resp = await client.messages.create({
      model: BEDROCK_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content[0]?.text || "{}";
    // Try to parse as JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const assessment = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
    res.json({ assessment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------
   Start
   ------------------------------------------------------------------ */

const PORT = process.env.BACKEND_PORT || 3002;
app.listen(PORT, () => {
  console.log(`[backend] Running on http://localhost:${PORT}`);
  console.log(`[backend] Using AWS Bedrock (${process.env.AWS_DEFAULT_REGION || "us-east-1"})`);
  console.log(`[backend] Model: ${BEDROCK_MODEL}`);
  console.log(`[backend] Tavily: ${TAVILY_API_KEY ? "configured" : "not configured"}`);
  console.log(`[backend] Agents: research_analyst, audience_mapper, citation_checker, style_analyst, content_writer`);
});
