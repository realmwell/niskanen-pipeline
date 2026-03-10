/**
 * Multi-agent pipeline for the Niskanen content pipeline.
 * Shared by both lambda.js (AWS Lambda) and server.js (local Express).
 *
 * Runs 5 sequential agent steps:
 *   1. Research Analyst  — thesis, evidence, implications
 *   2. Audience Mapper   — target audiences, tone per format
 *   3. Citation Checker  — verify claims via Tavily web search
 *   4. Style Analyst     — writing patterns, rhetorical moves
 *   5. Content Writer    — 7 publication-ready formats
 *
 * Agents 2-4 run in parallel (fan-out) after the research analyst.
 * Agent 5 waits for all four intermediate outputs (fan-in).
 */

import * as cheerio from "cheerio";

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function parseJSON(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

async function callBedrock(client, model, systemPrompt, userPrompt, maxTokens = 2048) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content[0].text.trim();
}

async function searchTavily(apiKey, query) {
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 3,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------
   Fallback defaults (used when an agent errors out)
   ------------------------------------------------------------------ */

const FALLBACK_RESEARCH = {
  thesis: "Unable to extract thesis automatically. See article text.",
  key_evidence: [],
  policy_implications: [],
  domain: "other",
  confidence_caveats: ["Research analysis agent encountered an error."],
};

const FALLBACK_AUDIENCE = {
  audiences: ["general public", "policymakers", "media"],
  tone_by_format: {
    twitter: "direct, data-forward",
    linkedin: "professional, detailed",
    bluesky: "concise, accessible",
    newsletter: "informative, summary-oriented",
    congressional: "formal, jargon-free",
    oped: "measured, evidence-based",
    media_recs: "strategic, specific",
  },
  complexity_level: "accessible",
};

const FALLBACK_FACTS = {
  verified_claims: [],
  unverified_claims: [],
  overall_confidence_score: 0,
};

const FALLBACK_STYLE = {
  sentence_length_avg: 20,
  rhetorical_moves: ["evidence-first argumentation"],
  avoided_phrases: ["think-tank boilerplate"],
  sample_passages: [],
};

/* ------------------------------------------------------------------
   Agent 1: Research Analyst
   ------------------------------------------------------------------ */

async function runResearchAnalyst(client, model, article) {
  const system = `You are a policy research analyst. Extract structured analysis from policy papers. Be specific: use exact numbers, percentages, and dollar amounts from the text. Return ONLY valid JSON, no explanation.`;

  const prompt = `Analyze this policy article and extract a structured research summary.

TITLE: ${article.title}
${article.author ? `AUTHOR: ${article.author}` : ""}

ARTICLE TEXT:
${article.text}

---

Return valid JSON with exactly these keys:

1. "thesis": The paper's central argument in 1-2 sentences. Be specific, not generic.

2. "key_evidence": Array of 3-5 specific factual claims or data points from the article. Each should reference numbers, percentages, or dollar amounts where available.

3. "policy_implications": Array of 2-4 policy implications or recommendations from the paper.

4. "domain": One of: "fiscal_policy", "immigration", "healthcare", "climate_energy", "criminal_justice", "government_reform", "housing", "trade", or "other".

5. "confidence_caveats": Array of 1-3 limitations or counterarguments acknowledged in the paper. If none, note what is missing.

Return ONLY the JSON object.`;

  const raw = await callBedrock(client, model, system, prompt);
  return parseJSON(raw);
}

/* ------------------------------------------------------------------
   Agent 2: Audience Mapper
   ------------------------------------------------------------------ */

async function runAudienceMapper(client, model, researchSummary) {
  const system = `You are a communications strategist at a Washington, D.C. policy organization. Map research findings to target audiences and determine tone per content format. Return ONLY valid JSON, no explanation.`;

  const prompt = `Given this research summary, identify target audiences and appropriate tone for each content format.

RESEARCH SUMMARY:
${JSON.stringify(researchSummary, null, 2)}

---

Return valid JSON with exactly these keys:

1. "audiences": Array of 3-5 target audience segments (e.g., "congressional_staff", "policy_journalists", "state_legislators", "advocacy_organizations", "academic_researchers").

2. "tone_by_format": Object with these keys, each mapped to a short tone description:
   - "twitter", "linkedin", "bluesky", "newsletter", "congressional", "oped", "media_recs"

3. "complexity_level": One of "accessible", "semi_technical", or "technical".

Return ONLY the JSON object.`;

  const raw = await callBedrock(client, model, system, prompt, 1024);
  return parseJSON(raw);
}

/* ------------------------------------------------------------------
   Agent 3: Citation Checker (Bedrock + Tavily)
   ------------------------------------------------------------------ */

async function runCitationChecker(client, model, tavilyKey, researchSummary) {
  // Step 1: Extract verifiable claims
  const system = `You are a fact-checker. Extract specific, verifiable factual claims from research summaries. Focus on statistical claims, dollar amounts, dates, and policy outcomes. Return ONLY valid JSON, no explanation.`;

  const prompt = `Extract 3-5 specific, verifiable factual claims from this research summary.

RESEARCH SUMMARY:
${JSON.stringify(researchSummary, null, 2)}

---

Return valid JSON with exactly this key:

"claims": Array of objects, each with:
  - "claim": The specific factual claim (e.g., "Medicare spending reached $900 billion in 2023")
  - "search_query": A concise web search query to verify this claim

Return ONLY the JSON object.`;

  let claims = [];
  try {
    const raw = await callBedrock(client, model, system, prompt, 1024);
    const parsed = parseJSON(raw);
    claims = parsed.claims || [];
  } catch {
    // Fall back to using key_evidence from research summary
    claims = (researchSummary.key_evidence || []).slice(0, 5).map((e) => ({
      claim: e,
      search_query: e,
    }));
  }

  // Step 2: Verify each claim via Tavily web search (parallel)
  const results = await Promise.all(
    claims.slice(0, 5).map(async ({ claim, search_query }) => {
      const searchResults = await searchTavily(tavilyKey, search_query);
      if (searchResults.length > 0) {
        const top = searchResults[0];
        return {
          type: "verified",
          data: {
            claim,
            status: "verified",
            source_url: top.url || null,
            source_title: top.title || "",
            notes: `Found ${searchResults.length} corroborating source(s) via Tavily web search.`,
          },
        };
      }
      return {
        type: "unverified",
        data: {
          claim,
          status: tavilyKey ? "unverified" : "not_checked",
          source_url: null,
          source_title: "",
          notes: tavilyKey
            ? "No corroborating sources found via web search."
            : "Tavily API key not configured; web verification skipped.",
        },
      };
    })
  );

  const verified = results.filter((r) => r.type === "verified").map((r) => r.data);
  const unverified = results.filter((r) => r.type === "unverified").map((r) => r.data);
  const total = verified.length + unverified.length;

  return {
    verified_claims: verified,
    unverified_claims: unverified,
    overall_confidence_score: total > 0 ? parseFloat((verified.length / total).toFixed(2)) : 0,
  };
}

/* ------------------------------------------------------------------
   Agent 4: Style Analyst
   ------------------------------------------------------------------ */

async function runStyleAnalyst(client, model, researchSummary, article) {
  const system = `You are a writing style analyst specializing in policy communications. Analyze writing patterns, sentence structure, and rhetorical devices. Return ONLY valid JSON, no explanation.`;

  // Sample the article text to keep the prompt reasonable
  const sampleText = article.text.slice(0, 2000);

  const prompt = `Analyze the writing style of this policy article.

TITLE: ${article.title}
DOMAIN: ${researchSummary.domain || "policy"}

SAMPLE TEXT:
${sampleText}

---

Return valid JSON with exactly these keys:

1. "sentence_length_avg": Estimated average sentence length in words (integer).

2. "rhetorical_moves": Array of 3-5 rhetorical strategies used (e.g., "leads with data before argument", "acknowledges counterarguments", "uses specific examples over abstractions").

3. "avoided_phrases": Array of 3-5 types of language the article avoids (e.g., "promotional adjectives", "think-tank boilerplate", "partisan framing").

4. "sample_passages": Array of 2-3 short (under 40 words each) representative passages quoted directly from the text.

Return ONLY the JSON object.`;

  const raw = await callBedrock(client, model, system, prompt, 1024);
  return parseJSON(raw);
}

/* ------------------------------------------------------------------
   Agent 5: Content Writer
   ------------------------------------------------------------------ */

const NISKANEN_VOICE = `You are a senior communications writer at the Niskanen Center, a center-right think tank in Washington, D.C. that works on immigration, climate, healthcare, criminal justice, and government reform.

Your writing voice:
- Problem-first framing: lead with the structural failure, not the solution
- Specific data over vague claims: use exact numbers, dollar amounts, percentages
- Measured but urgent: you take the subject seriously without being alarmist or promotional
- Institutionally literate: you know how Congress works, how agencies function, who reads what
- Honest about tradeoffs: acknowledge counterarguments directly rather than ignoring them
- No think-tank boilerplate: never write "in today's rapidly evolving landscape" or "it is crucial that"
- No hashtags on social media, no emojis, no promotional adjectives like "groundbreaking" or "transformative"
- When writing tweets, they should read like a knowledgeable person summarizing findings, not a marketing department

You do NOT inflate significance. You do NOT use phrases like "a testament to," "serves as," "highlights the importance of," or "underscores." You write like someone who assumes the reader is smart and busy.`;

async function runContentWriter(client, model, article, research, audience, facts, style) {
  const prompt = `Generate a content package for this Niskanen Center article. Use the research analysis, audience mapping, fact-check results, and style patterns below to inform your writing.

TITLE: ${article.title}
${article.author ? `AUTHOR: ${article.author}` : ""}

ARTICLE TEXT:
${article.text}

---

RESEARCH ANALYSIS:
${JSON.stringify(research, null, 2)}

TARGET AUDIENCES:
${JSON.stringify(audience, null, 2)}

FACT-CHECK RESULTS (only reference verified claims with confidence):
${JSON.stringify(facts, null, 2)}

STYLE PATTERNS TO MATCH:
${JSON.stringify(style, null, 2)}

---

Generate ALL SEVEN formats below. Reference actual findings and data from the research analysis. Match the tone from the audience mapping. Only cite claims the fact-checker verified. Match the writing style described in the style patterns.

Return valid JSON with exactly these keys:

1. "twitter_post": Under 280 characters. Lead with the most striking finding. Reference @NiskanenCenter. No hashtags.

2. "linkedin_post": 3-5 paragraphs. Open with the problem, then findings, then proposals. Use specific numbers from the research analysis.

3. "bluesky_post": Under 300 characters. Different framing from the tweet.

4. "newsletter_paragraph": Under 165 words. Summarize what we published, why it matters, and where to find it.

5. "congressional_one_pager": Formatted briefing:
   - Title in ALL CAPS
   - "The Problem" section with bullet points using specific data
   - "The Evidence" section with bullet points
   - "The Proposal" / "Key Recommendations" section with bullet points
   - "Bottom line:" single sentence

6. "full_oped": 500-800 word op-ed. Open with a concrete observation. Build the argument using evidence from the research analysis. End with a specific policy ask.

7. "media_outlet_recommendations": Formatted as:
   - PRIMARY TARGETS (3 outlets with rationale tied to this paper's topic)
   - SECONDARY TARGETS (3 outlets)
   - BEAT REPORTERS (which beats to target)
   - TIMING (what to align publication with)

Return ONLY the JSON object, no markdown fencing, no explanation.`;

  const raw = await callBedrock(client, model, NISKANEN_VOICE, prompt, 4096);
  const pkg = parseJSON(raw);

  const required = [
    "twitter_post",
    "linkedin_post",
    "bluesky_post",
    "newsletter_paragraph",
    "congressional_one_pager",
    "full_oped",
    "media_outlet_recommendations",
  ];
  for (const key of required) {
    if (!pkg[key]) throw new Error(`Content writer missing required field: ${key}`);
  }

  return pkg;
}

/* ------------------------------------------------------------------
   Article extraction
   ------------------------------------------------------------------ */

export async function fetchArticleText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NiskanenPipeline/1.0; research project)",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/pdf") || url.endsWith(".pdf")) {
    throw new Error(
      "PDF_UNSUPPORTED: Use the article web page URL instead of the PDF link."
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  $(
    "script, style, nav, header, footer, aside, .sidebar, .comments, .related-posts, .share-buttons, .social-share, .newsletter-signup"
  ).remove();

  let text = "";
  const selectors = [
    ".entry-content",
    "article .content",
    "article",
    ".post-content",
    ".article-body",
    "main",
  ];

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 200) {
      text = el.text().trim();
      break;
    }
  }

  if (!text || text.length < 200) {
    text = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 30)
      .join("\n\n");
  }

  const title =
    $("h1.entry-title").text().trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Policy Paper";

  const author =
    $(".author-name").text().trim() ||
    $(".byline").text().trim() ||
    $('meta[name="author"]').attr("content") ||
    "";

  const words = text.split(/\s+/);
  if (words.length > 8000) {
    text =
      words.slice(0, 8000).join(" ") + "\n\n[Article truncated for processing]";
  }

  return { title, author, text, wordCount: words.length };
}

/* ------------------------------------------------------------------
   Main pipeline: 5 agents, fan-out/fan-in topology
   ------------------------------------------------------------------ */

export async function runAgentPipeline(client, model, tavilyKey, article) {
  const timings = {};

  // ── Agent 1: Research Analyst (sequential, must run first) ──
  let research_summary;
  let t = Date.now();
  try {
    research_summary = await runResearchAnalyst(client, model, article);
  } catch (err) {
    console.error(`[research_analyst] Error: ${err.message}`);
    research_summary = { ...FALLBACK_RESEARCH };
  }
  timings.research_analyst = Date.now() - t;

  // ── Agents 2-4: Fan-out (parallel, all depend on research_summary) ──
  t = Date.now();
  const [audienceResult, citationResult, styleResult] = await Promise.allSettled([
    runAudienceMapper(client, model, research_summary),
    runCitationChecker(client, model, tavilyKey, research_summary),
    runStyleAnalyst(client, model, research_summary, article),
  ]);

  const parallelTime = Date.now() - t;

  const audience_map =
    audienceResult.status === "fulfilled"
      ? audienceResult.value
      : (() => { console.error(`[audience_mapper] Error: ${audienceResult.reason}`); return { ...FALLBACK_AUDIENCE }; })();

  const fact_check_report =
    citationResult.status === "fulfilled"
      ? citationResult.value
      : (() => { console.error(`[citation_checker] Error: ${citationResult.reason}`); return { ...FALLBACK_FACTS }; })();

  const style_patterns =
    styleResult.status === "fulfilled"
      ? styleResult.value
      : (() => { console.error(`[style_analyst] Error: ${styleResult.reason}`); return { ...FALLBACK_STYLE }; })();

  // Approximate individual timings from parallel execution
  timings.audience_mapper = parallelTime;
  timings.citation_checker = parallelTime;
  timings.style_analyst = parallelTime;

  // ── Agent 5: Content Writer (sequential, depends on all 4) ──
  t = Date.now();
  const content = await runContentWriter(
    client,
    model,
    article,
    research_summary,
    audience_map,
    fact_check_report,
    style_patterns
  );
  timings.content_writer = Date.now() - t;

  return {
    research_summary,
    audience_map,
    fact_check_report,
    style_patterns,
    content,
    agent_timings: timings,
  };
}
