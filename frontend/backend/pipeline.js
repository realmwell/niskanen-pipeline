/**
 * Multi-agent pipeline for the Niskanen content pipeline.
 * Shared by both lambda.js (AWS Lambda) and server.js (local Express).
 *
 * Dynamic model routing:
 *   Agents 1-4 → Haiku (cheap structured extraction)
 *   Agent 5    → Sonnet (high-quality long-form writing)
 *
 * Runs 5 agent steps:
 *   1. Research Analyst  — thesis, evidence, implications
 *   2. Audience Mapper   — target audiences, tone per format
 *   3. Citation Checker  — verify claims via Tavily web search
 *   4. Style Analyst     — writing patterns, rhetorical moves
 *   5. Content Writer    — 9 formats (5 tweets, 3 LinkedIn, 5 Bluesky, newsletter,
 *                          one-pager, op-ed, media recs, Instagram post, IG story)
 *
 * Agents 2-4 run in parallel (fan-out) after the research analyst.
 * Agent 5 waits for all four intermediate outputs (fan-in).
 *
 * Post-processing: em dash removal, AI vocabulary sanitization, placeholder scanning.
 */

import * as cheerio from "cheerio";

/* ------------------------------------------------------------------
   LangSmith tracing (optional -- silently skipped if not configured)
   ------------------------------------------------------------------ */

let RunTree = null;
try {
  const langsmith = await import("langsmith");
  RunTree = langsmith.RunTree;
} catch {
  // langsmith not installed — tracing disabled
}

const LANGSMITH_ENABLED = !!(RunTree && process.env.LANGSMITH_API_KEY);
const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT || "takehome";

async function createParentRun(name, inputs) {
  if (!LANGSMITH_ENABLED) return null;
  try {
    const run = new RunTree({
      name,
      run_type: "chain",
      inputs,
      project_name: LANGSMITH_PROJECT,
    });
    await run.postRun();
    return run;
  } catch (err) {
    console.warn(`[langsmith] Failed to create run: ${err.message}`);
    return null;
  }
}

async function createChildRun(parent, name, runType, inputs) {
  if (!parent) return null;
  try {
    const child = await parent.createChild({
      name,
      run_type: runType || "chain",
      inputs,
    });
    await child.postRun();
    return child;
  } catch {
    return null;
  }
}

async function endRun(run, outputs, error) {
  if (!run) return;
  try {
    if (error) {
      run.end({ error: error.message || String(error) });
    } else {
      run.end(outputs);
    }
    await run.patchRun();
  } catch {
    // silent
  }
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function parseJSON(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  // Strip BOM and non-printable prefix characters
  cleaned = cleaned.replace(/^[^\[{]+(?=[\[{])/, "");
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    // Fix common LLM JSON issues: unescaped control characters inside string values
    // We need to only replace control chars inside JSON string literals, not structural ones
    const fixed = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
      return match.replace(/[\x00-\x1f]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return ' ';
      });
    });
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      // Last resort: extract JSON object from output
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = jsonMatch[0].replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
          return match.replace(/[\x00-\x1f]/g, (ch) => {
            if (ch === '\n') return '\\n';
            if (ch === '\r') return '\\r';
            if (ch === '\t') return '\\t';
            return ' ';
          });
        });
        return JSON.parse(extracted);
      }
      throw e2;
    }
  }
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

/**
 * Post-processing: remove em dashes, en dashes, and AI-writing markers.
 * Runs recursively on all string values in the content object.
 */
function sanitizeOutput(value) {
  if (typeof value === "string") {
    let s = value;
    // Em dashes → comma or restructured
    s = s.replace(/\s*\u2014\s*/g, ", ");
    // En dashes in non-numeric contexts → hyphen
    s = s.replace(/(\D)\u2013(\D)/g, "$1-$2");
    // AI vocabulary replacements
    const aiWords = [
      [/\bAdditionally,?\s*/gi, "Also, "],
      [/\bdelve(?:s|d)?\s+(?:into|deeper)\b/gi, "examine"],
      [/\blandscape\b(?!\s+(?:architect|design|paint))/gi, "environment"],
      [/\btapestry\b/gi, "mix"],
      [/\ba testament to\b/gi, "evidence of"],
      [/\bunderscore[sd]?\b/gi, "show"],
      [/\bserves as\b/gi, "is"],
      [/\bstands as\b/gi, "is"],
      [/\bhighlights the importance of\b/gi, "shows why"],
      [/\bIt is (?:crucial|critical|vital|essential) (?:that|to)\b/gi, "It matters that"],
      [/\bpivotal\b/gi, "important"],
      [/\bgroundbreaking\b/gi, "significant"],
      [/\btransformative\b/gi, "significant"],
    ];
    for (const [pat, rep] of aiWords) {
      s = s.replace(pat, rep);
    }
    return s;
  }
  if (Array.isArray(value)) return value.map(sanitizeOutput);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeOutput(v);
    return out;
  }
  return value;
}

/**
 * Scan for placeholder patterns in content. Logs warnings but does not throw.
 */
function scanForPlaceholders(obj, path = "") {
  const pattern = /\[.*?(would|insert|add|your|example|placeholder|text here|lorem|TBD|full .* here|generated here).*?\]/gi;
  if (typeof obj === "string") {
    const matches = obj.match(pattern);
    if (matches) {
      console.warn(`[pipeline] Placeholder detected at ${path}: ${matches.join(", ")}`);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanForPlaceholders(v, `${path}[${i}]`));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) scanForPlaceholders(v, `${path}.${k}`);
  }
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
- On Instagram, lead with the single most visual data point. Captions should read like a smart friend explaining the finding, not a marketing department.

You do NOT inflate significance. You do NOT use phrases like "a testament to," "serves as," "highlights the importance of," or "underscores." You write like someone who assumes the reader is smart and busy.

HARD RULES:
- NEVER use em dashes (\u2014). Use commas, colons, or parentheses instead.
- NEVER start sentences with "Additionally." Use "Also" or restructure.
- NEVER write "delve," "landscape," "tapestry," "pivotal," "groundbreaking," or "transformative."
- NEVER write "Not only...but also" constructions.
- NEVER force ideas into groups of three unless the content genuinely has three parts.
- Use "use" not "utilize," "help" not "facilitate," "about" not "approximately."
- Active voice over passive. One idea per paragraph.`;

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

Generate ALL NINE formats below. Reference actual findings and data from the research analysis. Match the tone from the audience mapping. Only cite claims the fact-checker verified. Match the writing style described in the style patterns.

Return valid JSON with exactly these keys (generate them in this order):

1. "twitter_posts": Array of 5 tweets. Each under 280 characters. Each takes a DIFFERENT angle on the findings (one data-led, one implication-led, one question, one quote-worthy, one contrarian). Reference @NiskanenCenter in at least 2. End each with 2-3 relevant policy hashtags (e.g., #FiscalPolicy, #ImmigrationReform, not generic like #policy or #news).

2. "full_oped": 700-900 word op-ed. THIS IS THE LONGEST FORMAT -- write it in full. Structure:
   - LEDE: Open with a vivid scene, counterintuitive claim, or striking juxtaposition -- not a throat-clearing summary.
   - THESIS: State a provocative, specific position within the first 3 paragraphs. This is an argument, not a report.
   - BODY: Build 3 distinct arguments, each anchored by evidence from the research analysis. Use transitions that advance the argument.
   - "TO BE SURE" PARAGRAPH: Acknowledge the strongest counterargument head-on, then explain why your position still holds. This is what separates credible op-eds from advocacy pieces.
   - KICKER: Circle back to the lede image or scene. End with a specific, actionable policy ask -- not a vague call to action.
   - After the op-ed text, add: "SUGGESTED TARGETS: [name 2-3 specific publications where this piece would fit, with reasoning]"

3. "linkedin_posts": Array of 3 LinkedIn posts. Each 3-5 paragraphs with a different approach:
   - Post 1: Data-led. Open with the most striking number, walk through implications, close with a question.
   - Post 2: Narrative-led. Open with a human story or scenario that illustrates the problem, connect to findings.
   - Post 3: Question-led. Open with a provocative question, answer it with evidence, end with a policy proposal.
   End each with 3-5 relevant hashtags (e.g., #PolicyAnalysis, #ThinkTank). Use line breaks between paragraphs.

4. "bluesky_posts": Array of 5 posts. Each under 300 characters. Each takes a DIFFERENT angle (same diversity as tweets). End each with 2-3 relevant hashtags.

5. "newsletter_paragraph": Under 165 words. Structure as: HOOK (1 sentence with the most striking fact or statistic) -> CONTEXT (1-2 sentences on why this matters now, tied to current legislative or news cycle) -> EVIDENCE (1 sentence with a specific data point from the research) -> CTA (1 sentence directing reader to the full piece, with a placeholder hyperlink like [Read the full analysis]). Model this on Brookings Brief or Atlantic Council newsletter style -- dense with information, no fluff.

6. "congressional_one_pager": Return a JSON object with these keys:
   - "title": Short descriptive title
   - "the_ask": One sentence describing the specific legislative action (e.g., "Co-sponsor H.R. XXXX" or "Support funding for X program at Y level"). Be concrete.
   - "the_problem": Array of 3-4 bullet strings using district-level impact framing where possible. Lead each bullet with a number or dollar amount.
   - "the_evidence": Array of 3-4 bullet strings with verified claims from the fact-check results. Include source citations in parentheses where available.
   - "key_recommendations": Array of 3 numbered actionable policy steps, each one sentence.
   - "bottom_line": One sentence a staffer can repeat to their boss in an elevator.
   - "contact": "Niskanen Center | niskanencenter.org"

7. "media_outlet_recommendations": Return a JSON object with these keys:
   - "primary_targets": Array of 3 objects, each with: "outlet" (publication name), "url" (the outlet's submission or tips page URL, e.g., "https://www.politico.com/tips"), "section" (specific section or vertical), "beat" (beat reporter's focus area), "pitch_angle" (1-sentence angle tailored to this outlet), "why" (why this outlet is a fit for this specific paper)
   - "secondary_targets": Array of 3 objects with same structure (including "url")
   - "pitch_angles": Array of 3 objects, each with: "angle" (the story angle), "suggested_headline" (a headline an editor would actually run)
   - "timing_hooks": Array of 2-3 strings naming specific legislative calendars, appropriations deadlines, upcoming hearings, or news pegs that create urgency
   - "pitch_email_draft": A 5-7 sentence pitch email. Structure:
     Sentence 1: Lead with the specific news peg or data point (never open with "I hope this finds you well" or "Dear Editor").
     Sentence 2: State the paper's core finding in plain English.
     Sentence 3: Why this matters to [OUTLET]'s readers specifically.
     Sentence 4: What's new or counterintuitive about this finding.
     Sentence 5: Concrete offer ("The author is available for interview" or "We can provide exclusive data").
     Sentence 6: Specific ask ("Would you have 15 minutes this week to discuss?").
     Use [REPORTER NAME], [OUTLET], and [ARTICLE LINK] placeholders.
     Tone: collegial, not deferential. You're offering a story, not begging for coverage.

8. "instagram_post": Return a JSON object with these keys:
   - "visual_description": Describe the ideal visual -- a single-stat hero graphic, a carousel concept, or a quote card. Specify layout, suggested colors/contrast, and text overlay content. Think Brookings Instagram or Urban Institute data viz style.
   - "caption": 150-200 words. Front-load the most interesting finding in the first sentence (it gets truncated in feeds). Write like a smart friend explaining the finding, not a press release. End with a clear call to action.
   - "hashtags": Array of 3-5 specific, relevant hashtags (policy-focused, not generic like #policy)
   - "alt_text": Accessibility description of the proposed visual, under 125 characters
   - "cta": What action should the viewer take? (e.g., "Link in bio for the full analysis" or "Save this for later")

9. "instagram_story": Return a JSON object with these keys:
   - "frames": Array of exactly 3 objects representing a 3-frame story sequence. Each frame has: "type" (one of "stat_callout", "context", "cta"), "text" (the text overlay for that frame), "visual_note" (brief description of background/design for that frame)
   - "poll_question": An engaging binary poll question related to the finding (e.g., "Should Congress fund X? Yes / No")
   - "link_sticker_text": Short text for the link sticker (e.g., "Read the research" or "Full analysis here")

CRITICAL: Write ALL content in full. Never use placeholders like "[text would go here]". Every format must contain complete, publication-ready text with real data from the research analysis.

Return ONLY the JSON object, no markdown fencing, no explanation.`;

  const raw = await callBedrock(client, model, NISKANEN_VOICE, prompt, 12000);
  let pkg = parseJSON(raw);

  // Post-process: remove em dashes, AI vocabulary, and other humanizer violations
  pkg = sanitizeOutput(pkg);

  // Scan for placeholder text (logs warnings)
  scanForPlaceholders(pkg, "content");

  const required = [
    "twitter_posts",
    "linkedin_posts",
    "bluesky_posts",
    "newsletter_paragraph",
    "congressional_one_pager",
    "full_oped",
    "media_outlet_recommendations",
    "instagram_post",
    "instagram_story",
  ];
  for (const key of required) {
    if (!pkg[key]) throw new Error(`Content writer missing required field: ${key}`);
  }

  return pkg;
}

/**
 * Regenerate a single content format using cached intermediate agent outputs.
 * Used by the HITL reject-and-regenerate flow.
 */
async function regenerateSingleFormat(client, model, article, research, audience, facts, style, formatKey) {
  // Build a focused prompt for just one format
  const formatPrompts = {
    twitter_posts: 'Generate an array of 5 tweets about this article. Each under 280 chars, different angles. Reference @NiskanenCenter in at least 2. End each with 2-3 relevant policy hashtags.',
    linkedin_posts: 'Generate an array of 3 LinkedIn posts. Each 3-5 paragraphs. Post 1: data-led, Post 2: narrative-led, Post 3: question-led. End each with 3-5 hashtags.',
    bluesky_posts: 'Generate an array of 5 Bluesky posts. Each under 300 chars, different angles. End each with 2-3 hashtags.',
    newsletter_paragraph: 'Write a newsletter paragraph under 165 words. Structure: HOOK -> CONTEXT -> EVIDENCE -> CTA.',
    congressional_one_pager: 'Write a congressional one-pager as a JSON object with keys: title, the_ask, the_problem (array), the_evidence (array), key_recommendations (array), bottom_line, contact.',
    full_oped: 'Write a 700-900 word op-ed. LEDE -> THESIS -> BODY (3 arguments) -> TO BE SURE paragraph -> KICKER. Add SUGGESTED TARGETS at the end.',
    media_outlet_recommendations: 'Write media outlet recommendations as a JSON object with: primary_targets (3, each with outlet, url, section, beat, pitch_angle, why), secondary_targets (3, same), pitch_angles (3), timing_hooks (2-3), pitch_email_draft (5-7 sentences).',
    instagram_post: 'Write an Instagram post as JSON with: visual_description, caption (150-200 words), hashtags (3-5), alt_text, cta.',
    instagram_story: 'Write an Instagram story as JSON with: frames (3 objects), poll_question, link_sticker_text.',
  };

  const formatPrompt = formatPrompts[formatKey] || `Generate the "${formatKey}" format.`;

  const prompt = `Regenerate ONLY the "${formatKey}" format for this article. The previous version was rejected by the editor.

TITLE: ${article.title}
${article.author ? `AUTHOR: ${article.author}` : ""}

ARTICLE TEXT (excerpt):
${article.text.slice(0, 3000)}

RESEARCH ANALYSIS:
${JSON.stringify(research, null, 2)}

TARGET AUDIENCES:
${JSON.stringify(audience, null, 2)}

FACT-CHECK RESULTS:
${JSON.stringify(facts, null, 2)}

STYLE PATTERNS:
${JSON.stringify(style, null, 2)}

---

${formatPrompt}

Write a FRESH version, different from the previous attempt. Use different angles, different opening lines, and different evidence ordering.

Return valid JSON with exactly one key: "${formatKey}". No markdown fencing.`;

  const raw = await callBedrock(client, model, NISKANEN_VOICE, prompt, 4000);
  let result = parseJSON(raw);
  result = sanitizeOutput(result);
  scanForPlaceholders(result, `regenerate.${formatKey}`);
  return result;
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
      words.slice(0, 4000).join(" ") + "\n\n[Article truncated for processing]";
  }

  return { title, author, text, wordCount: words.length };
}

/* ------------------------------------------------------------------
   Main pipeline: 5 agents, fan-out/fan-in topology
   ------------------------------------------------------------------ */

/**
 * Main pipeline: 5 agents with dynamic model routing.
 * @param {object} client - Bedrock SDK client
 * @param {string} analysisModel - Model for agents 1-4 (Haiku: cheap structured extraction)
 * @param {string} writerModel - Model for agent 5 (Sonnet: high-quality long-form writing)
 * @param {string} tavilyKey - Tavily API key for citation verification
 * @param {object} article - { title, author, text, wordCount }
 */
export async function runAgentPipeline(client, analysisModel, writerModel, tavilyKey, article) {
  const timings = {};

  console.log(`[pipeline] Analysis model: ${analysisModel}`);
  console.log(`[pipeline] Writer model: ${writerModel}`);
  if (LANGSMITH_ENABLED) console.log(`[pipeline] LangSmith tracing: ${LANGSMITH_PROJECT}`);

  // Create LangSmith parent run for the whole pipeline
  const parentRun = await createParentRun("niskanen_pipeline", {
    url: article.title,
    word_count: article.wordCount,
    analysis_model: analysisModel,
    writer_model: writerModel,
  });

  // ── Agent 1: Research Analyst (sequential, must run first) ──
  let research_summary;
  let t = Date.now();
  const researchRun = await createChildRun(parentRun, "research_analyst", "chain", {
    article_title: article.title,
    model: analysisModel,
  });
  try {
    research_summary = await runResearchAnalyst(client, analysisModel, article);
    await endRun(researchRun, { research_summary });
  } catch (err) {
    console.error(`[research_analyst] Error: ${err.message}`);
    research_summary = { ...FALLBACK_RESEARCH };
    await endRun(researchRun, null, err);
  }
  timings.research_analyst = Date.now() - t;

  // ── Agents 2-4: Fan-out (parallel, all depend on research_summary) ──
  t = Date.now();

  // Create child runs for parallel agents
  const [audienceRun, citationRun, styleRun] = await Promise.all([
    createChildRun(parentRun, "audience_mapper", "chain", { model: analysisModel }),
    createChildRun(parentRun, "citation_checker", "chain", { model: analysisModel, tavily: !!tavilyKey }),
    createChildRun(parentRun, "style_analyst", "chain", { model: analysisModel }),
  ]);

  const [audienceResult, citationResult, styleResult] = await Promise.allSettled([
    runAudienceMapper(client, analysisModel, research_summary),
    runCitationChecker(client, analysisModel, tavilyKey, research_summary),
    runStyleAnalyst(client, analysisModel, research_summary, article),
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

  // End parallel agent runs
  await endRun(audienceRun,
    audienceResult.status === "fulfilled" ? { audience_map } : null,
    audienceResult.status === "rejected" ? audienceResult.reason : null);
  await endRun(citationRun,
    citationResult.status === "fulfilled" ? { fact_check_report } : null,
    citationResult.status === "rejected" ? citationResult.reason : null);
  await endRun(styleRun,
    styleResult.status === "fulfilled" ? { style_patterns } : null,
    styleResult.status === "rejected" ? styleResult.reason : null);

  // Approximate individual timings from parallel execution
  timings.audience_mapper = parallelTime;
  timings.citation_checker = parallelTime;
  timings.style_analyst = parallelTime;

  // ── Agent 5: Content Writer (Sonnet — high quality, depends on all 4) ──
  t = Date.now();
  const writerRun = await createChildRun(parentRun, "content_writer", "chain", {
    model: writerModel,
    formats: 9,
  });
  let content;
  try {
    content = await runContentWriter(
      client,
      writerModel,
      article,
      research_summary,
      audience_map,
      fact_check_report,
      style_patterns
    );
    await endRun(writerRun, { formats_generated: Object.keys(content).length });
  } catch (err) {
    await endRun(writerRun, null, err);
    throw err; // Content writer failure is fatal
  }
  timings.content_writer = Date.now() - t;

  // End parent run
  await endRun(parentRun, {
    success: true,
    formats_generated: Object.keys(content).length,
    total_time_ms: Object.values(timings).reduce((a, b) => a + b, 0),
  });

  return {
    research_summary,
    audience_map,
    fact_check_report,
    style_patterns,
    content,
    agent_timings: timings,
  };
}

/**
 * Regenerate a single format (for HITL reject flow).
 * Uses the writer model for quality.
 */
export { regenerateSingleFormat };
