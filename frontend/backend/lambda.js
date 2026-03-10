/**
 * AWS Lambda handler for the Niskanen content pipeline.
 *
 * Dynamic model routing: Haiku for 4 analysis agents, Sonnet for content writer.
 * Multi-agent pipeline: Research Analyst -> (Audience Mapper | Citation
 * Checker | Style Analyst) -> Content Writer.  Returns all intermediate
 * agent outputs alongside the final 9-format content package.
 *
 * Deploy behind API Gateway HTTP API or Lambda Function URL.
 */

import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { fetchArticleText, runAgentPipeline, regenerateSingleFormat } from "./pipeline.js";

/* ------------------------------------------------------------------
   Async job pattern via S3.
   API Gateway HTTP APIs have a 30 s hard timeout, but the 5-agent
   pipeline takes ~40 s.  The generate endpoint runs the pipeline
   synchronously (Lambda continues even after gateway times out) and
   writes the result to S3.  The frontend sends a client-generated
   jobId; if the POST times out, it polls GET /api/status/:id which
   reads from S3.
   ------------------------------------------------------------------ */
const JOBS_BUCKET = process.env.JOBS_BUCKET || "niskanen-pipeline-demo";
const s3 = new S3Client({ region: process.env.AWS_DEFAULT_REGION || "us-east-1" });

async function writeJob(jobId, data) {
  await s3.send(new PutObjectCommand({
    Bucket: JOBS_BUCKET,
    Key: `jobs/${jobId}.json`,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  }));
}

async function readJob(jobId) {
  try {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: JOBS_BUCKET,
      Key: `jobs/${jobId}.json`,
    }));
    const body = await resp.Body.transformToString();
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const client = new AnthropicBedrock({
  awsRegion: process.env.AWS_DEFAULT_REGION || "us-east-1",
});

// Dynamic model routing: Haiku for analysis agents, Sonnet for content writer
const ANALYSIS_MODEL = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-3-5-haiku-20241022-v1:0";
const WRITER_MODEL = process.env.SONNET_MODEL_ID || "us.anthropic.claude-sonnet-4-20250514-v1:0";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY || "";
const LANGSMITH_BASE = "https://api.smith.langchain.com/api/v1";

function langsmithHeaders() {
  return {
    "x-api-key": LANGSMITH_API_KEY,
    "Content-Type": "application/json",
  };
}

/* ------------------------------------------------------------------
   Lambda handler
   ------------------------------------------------------------------ */

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function handler(event) {
  const origin = event.headers?.origin || "*";
  const method = event.requestContext?.http?.method || event.httpMethod || "";
  const path = event.rawPath || event.path || "";

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  // Health check
  if (path.endsWith("/health") || path === "/api/health") {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "ok",
        backend: "lambda-bedrock",
        analysis_model: ANALYSIS_MODEL,
        writer_model: WRITER_MODEL,
        agents: ["research_analyst", "audience_mapper", "citation_checker", "style_analyst", "content_writer"],
        tavily: TAVILY_API_KEY ? "configured" : "not_configured",
        langsmith: LANGSMITH_API_KEY ? "configured" : "not_configured",
      }),
    };
  }

  // Generate endpoint — runs pipeline, writes result to S3
  // Frontend sends a jobId so it can poll /api/status/:id if gateway times out.
  if (path.endsWith("/generate") || path === "/api/generate") {
    if (method !== "POST") {
      return {
        statusCode: 405,
        headers: corsHeaders(origin),
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { url, jobId } = body || {};
    if (!url) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "URL is required" }),
      };
    }

    // Write "running" status so the frontend can poll immediately
    if (jobId) {
      await writeJob(jobId, { status: "running" });
    }

    const startTime = Date.now();
    try {
      const article = await fetchArticleText(url);
      const result = await runAgentPipeline(client, ANALYSIS_MODEL, WRITER_MODEL, TAVILY_API_KEY, article);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

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

      // Persist result to S3 (even if gateway already timed out, Lambda keeps running)
      if (jobId) {
        await writeJob(jobId, { status: "done", ...responseData });
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify(responseData),
      };
    } catch (err) {
      const errorData = {
        error: err.message,
        suggestion: err.message.includes("PDF_UNSUPPORTED")
          ? "Paste the article's web page URL instead of a direct PDF link."
          : "Check that the URL is accessible and AWS credentials are configured.",
      };

      if (jobId) {
        await writeJob(jobId, { status: "error", ...errorData });
      }

      return {
        statusCode: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify(errorData),
      };
    }
  }

  // Status endpoint — poll for pipeline results from S3
  const statusMatch = path.match(/\/api\/status\/([^/]+)$/);
  if (statusMatch && method === "GET") {
    const jobId = statusMatch[1];
    const job = await readJob(jobId);
    if (!job) {
      return {
        statusCode: 404,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Job not found" }),
      };
    }
    return {
      statusCode: job.status === "error" ? 500 : 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      body: JSON.stringify(job),
    };
  }

  // ---- Regenerate single format (HITL reject flow) ----
  if ((path.endsWith("/regenerate") || path === "/api/regenerate") && method === "POST") {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }
    const { formatKey, article, research, audience, facts, style } = body || {};
    if (!formatKey || !article) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "formatKey and article are required" }),
      };
    }

    try {
      const result = await regenerateSingleFormat(
        client, WRITER_MODEL, article, research, audience, facts, style, formatKey
      );
      return {
        statusCode: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, content: result }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // ---- Evals endpoints: LangSmith proxy + AI assessment ----

  // GET /api/traces — list recent pipeline runs
  if ((path.endsWith("/traces") || path === "/api/traces") && method === "GET") {
    if (!LANGSMITH_API_KEY) {
      return {
        statusCode: 503,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "LangSmith API key not configured" }),
      };
    }
    const qs = event.queryStringParameters || {};
    const project = qs.project || "takehome";
    const limit = parseInt(qs.limit) || 20;

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
        return {
          statusCode: resp.status,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
          body: JSON.stringify({ error: `LangSmith API error (${resp.status}): ${errText.slice(0, 200)}` }),
        };
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
      return {
        statusCode: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ runs }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // GET /api/traces/:runId — trace detail with child spans
  const tracesMatch = path.match(/\/api\/traces\/([^/]+)$/);
  if (tracesMatch && method === "GET") {
    if (!LANGSMITH_API_KEY) {
      return {
        statusCode: 503,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "LangSmith API key not configured" }),
      };
    }
    const runId = tracesMatch[1];
    try {
      const rootResp = await fetch(`${LANGSMITH_BASE}/runs/${runId}`, {
        headers: langsmithHeaders(),
      });
      if (!rootResp.ok) {
        const errText = await rootResp.text().catch(() => "Unknown error");
        return {
          statusCode: rootResp.status,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
          body: JSON.stringify({ error: `LangSmith API error (${rootResp.status}): ${errText.slice(0, 200)}` }),
        };
      }
      const root = await rootResp.json();

      const childResp = await fetch(`${LANGSMITH_BASE}/runs/query`, {
        method: "POST",
        headers: langsmithHeaders(),
        body: JSON.stringify({ trace_id: runId, limit: 50 }),
      });
      if (!childResp.ok) {
        return {
          statusCode: 200,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
          body: JSON.stringify({ root, children: [] }),
        };
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

      return {
        statusCode: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ root, children }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // GET /api/evals — evaluation results from eval project
  if ((path.endsWith("/evals") || path === "/api/evals") && method === "GET") {
    if (!LANGSMITH_API_KEY) {
      return {
        statusCode: 503,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "LangSmith API key not configured" }),
      };
    }
    const qs = event.queryStringParameters || {};
    const dataset = qs.dataset || "niskanen-pipeline-eval";

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
      return {
        statusCode: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ evaluations: data.runs || data || [] }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // POST /api/annotate — store feedback in LangSmith
  if ((path.endsWith("/annotate") || path === "/api/annotate") && method === "POST") {
    if (!LANGSMITH_API_KEY) {
      return {
        statusCode: 503,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "LangSmith API key not configured" }),
      };
    }
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }
    const { run_id, key, score, comment } = body || {};
    if (!run_id || !key) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "run_id and key are required" }),
      };
    }

    try {
      const resp = await fetch(`${LANGSMITH_BASE}/feedback`, {
        method: "POST",
        headers: langsmithHeaders(),
        body: JSON.stringify({ run_id, key, score, comment }),
      });
      const data = await resp.json();
      return {
        statusCode: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, feedback: data }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // POST /api/assess — AI-generated assessment via Bedrock
  if ((path.endsWith("/assess") || path === "/api/assess") && method === "POST") {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }
    const { traceData, annotations, timeRange } = body || {};

    // Validate that traceData actually contains runs before sending to Claude
    const runs = traceData?.runs || [];
    if (!traceData || traceData.error || runs.length === 0) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({
          error: traceData?.error
            ? `Cannot generate assessment: ${traceData.error}`
            : "No pipeline runs found. Run the pipeline at least once before generating an assessment.",
        }),
      };
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
        model: ANALYSIS_MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      const text = resp.content[0]?.text || "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const assessment = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
      return {
        statusCode: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ assessment }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  return {
    statusCode: 404,
    headers: corsHeaders(origin),
    body: JSON.stringify({ error: "Not found" }),
  };
}
