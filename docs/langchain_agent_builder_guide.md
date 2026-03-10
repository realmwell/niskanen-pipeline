# Rebuilding the Niskanen pipeline with LangChain Agent Builder

This guide walks through how to replicate the JS pipeline's five-agent architecture using LangChain's agent tooling. The current pipeline runs raw Bedrock SDK calls orchestrated by hand-written JavaScript. LangChain Agent Builder gives you the same multi-agent topology with less plumbing, built-in tracing, and the ability to swap models or add tools without rewriting orchestration code.

## What the pipeline does today

Five agents run in a fan-out/fan-in pattern:

```
fetch_article
  -> research_analyst (Haiku)
  -> fan_out(
       audience_mapper (Haiku),
       citation_checker (Haiku + Tavily),
       style_analyst (Haiku)
     )
  -> fan_in
  -> content_writer (Sonnet)
  -> output (9 formats)
```

The Research Analyst runs first. Its output feeds three parallel agents (Audience Mapper, Citation Checker, Style Analyst). All four intermediate results feed the Content Writer, which produces nine content formats in a single call.

Dynamic model routing keeps costs low: the four analysis agents run on Claude 3.5 Haiku (~$0.02 total), while the Content Writer runs on Claude Sonnet (~$0.15). Total cost per paper is around $0.17.

## Agent definitions

Each agent has a role, a system prompt, inputs, outputs, and optionally tools.

### 1. Research Analyst

**Role:** Extract structured analysis from the raw article text.

**Model:** Claude 3.5 Haiku

**Input:** Article title, author, full text

**Output (JSON):**
```json
{
  "thesis": "The paper's central argument in 1-2 sentences",
  "key_evidence": ["Array of 3-5 specific factual claims with numbers"],
  "policy_implications": ["Array of 2-4 policy implications"],
  "domain": "fiscal_policy | immigration | healthcare | climate_energy | ...",
  "confidence_caveats": ["Array of 1-3 limitations"]
}
```

**System prompt:** "You are a policy research analyst. Extract structured analysis from policy papers. Be specific: use exact numbers, percentages, and dollar amounts from the text. Return ONLY valid JSON, no explanation."

**Tools:** None. This agent works entirely from the input text.

**LangChain Agent Builder setup:**
```python
from langchain_aws import ChatBedrock
from langgraph.graph import StateGraph

research_llm = ChatBedrock(
    model_id="us.anthropic.claude-3-5-haiku-20241022-v1:0",
    region_name="us-east-1",
)

def research_analyst(state):
    """Extract thesis, evidence, and policy implications."""
    article = state["article"]
    prompt = f"""Analyze this policy article...
    TITLE: {article['title']}
    ARTICLE TEXT: {article['text']}
    Return valid JSON with: thesis, key_evidence, policy_implications, domain, confidence_caveats."""

    response = research_llm.invoke([
        SystemMessage(content="You are a policy research analyst..."),
        HumanMessage(content=prompt),
    ])
    return {"research_summary": parse_json(response.content)}
```

### 2. Audience Mapper

**Role:** Identify target audience segments and calibrate tone per content format.

**Model:** Claude 3.5 Haiku

**Input:** Research summary from Agent 1

**Output (JSON):**
```json
{
  "audiences": ["congressional_staff", "policy_journalists", "..."],
  "tone_by_format": {
    "twitter": "direct, data-forward",
    "linkedin": "professional, detailed",
    "congressional": "formal, jargon-free"
  },
  "complexity_level": "accessible | semi_technical | technical"
}
```

**Tools:** None.

### 3. Citation Checker

**Role:** Extract verifiable claims from the research summary and check each against live web sources.

**Model:** Claude 3.5 Haiku (for claim extraction) + Tavily Search API (for verification)

**Input:** Research summary from Agent 1

**Output (JSON):**
```json
{
  "verified_claims": [
    {"claim": "...", "status": "verified", "source_url": "...", "source_title": "..."}
  ],
  "unverified_claims": [...],
  "overall_confidence_score": 0.8
}
```

**Tools:** Tavily web search. This is the only agent that calls an external API.

**LangChain Agent Builder setup:**
```python
from langchain_community.tools.tavily_search import TavilySearchResults

tavily_tool = TavilySearchResults(max_results=3)

def citation_checker(state):
    """Verify statistical claims via web search."""
    research = state["research_summary"]

    # Step 1: Extract claims (LLM call)
    claims = extract_claims(research)

    # Step 2: Verify each claim (Tavily calls, parallel)
    results = []
    for claim in claims:
        search_results = tavily_tool.invoke(claim["search_query"])
        if search_results:
            results.append({"claim": claim["claim"], "status": "verified", ...})
        else:
            results.append({"claim": claim["claim"], "status": "unverified", ...})

    return {"fact_check_report": {"verified_claims": ..., "unverified_claims": ...}}
```

### 4. Style Analyst

**Role:** Analyze the article's sentence structure, rhetorical patterns, and vocabulary so the Content Writer can mirror the organization's voice.

**Model:** Claude 3.5 Haiku

**Input:** Research summary + article text (first 2000 chars)

**Output (JSON):**
```json
{
  "sentence_length_avg": 20,
  "rhetorical_moves": ["leads with data before argument", "..."],
  "avoided_phrases": ["promotional adjectives", "..."],
  "sample_passages": ["Short quoted passages from the text"]
}
```

**Tools:** None. In a future version with RAG, this agent would query a vector store of 100+ Niskanen publications to find stylistically similar pieces.

### 5. Content Writer

**Role:** Synthesize all four intermediate outputs into nine publication-ready formats.

**Model:** Claude Sonnet (higher quality for long-form generation)

**Input:** Article text + research summary + audience map + fact-check report + style patterns

**Output:** A JSON object with nine keys: `twitter_posts` (5), `linkedin_posts` (3), `bluesky_posts` (5), `newsletter_paragraph`, `congressional_one_pager`, `full_oped`, `media_outlet_recommendations`, `instagram_post`, `instagram_story`.

**System prompt:** The full NISKANEN_VOICE prompt (see `pipeline.js` lines 381-403). This is the longest and most prescriptive system prompt in the pipeline. It defines the writing voice, lists forbidden phrases, and includes hard rules against em dashes, AI vocabulary, and promotional language.

**Tools:** None. All the information it needs comes from the four upstream agents.

## The LangGraph state schema

All agents read from and write to a shared state object:

```python
from typing import TypedDict, Optional

class PipelineState(TypedDict):
    article: dict          # {title, author, text, wordCount}
    research_summary: Optional[dict]
    audience_map: Optional[dict]
    fact_check_report: Optional[dict]
    style_patterns: Optional[dict]
    content: Optional[dict]
```

This is the single object that flows through the graph. Each agent reads what it needs and writes its output field.

## Building the graph with fan-out/fan-in

LangGraph's `Send` API handles the parallel execution of agents 2-4:

```python
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send

graph = StateGraph(PipelineState)

# Add nodes
graph.add_node("fetch_article", fetch_article)
graph.add_node("research_analyst", research_analyst)
graph.add_node("audience_mapper", audience_mapper)
graph.add_node("citation_checker", citation_checker)
graph.add_node("style_analyst", style_analyst)
graph.add_node("content_writer", content_writer)

# Sequential: fetch -> research
graph.add_edge(START, "fetch_article")
graph.add_edge("fetch_article", "research_analyst")

# Fan-out: research -> three parallel agents
def fan_out_to_specialists(state):
    return [
        Send("audience_mapper", state),
        Send("citation_checker", state),
        Send("style_analyst", state),
    ]

graph.add_conditional_edges("research_analyst", fan_out_to_specialists)

# Fan-in: all three -> content writer
graph.add_edge("audience_mapper", "content_writer")
graph.add_edge("citation_checker", "content_writer")
graph.add_edge("style_analyst", "content_writer")

graph.add_edge("content_writer", END)

pipeline = graph.compile()
```

The key thing `Send` does: it dispatches three independent invocations that run concurrently. LangGraph waits for all three to complete before triggering the content_writer node.

## Human-in-the-loop with interrupt()

LangGraph's `interrupt()` function lets you pause the graph after content generation for human review:

```python
from langgraph.types import interrupt

def human_review(state):
    """Pause for per-format approval."""
    content = state["content"]

    # Present content to reviewer
    decision = interrupt({
        "content": content,
        "message": "Review each format. Approve, edit, or reject."
    })

    if decision.get("rejected_formats"):
        # Re-run content writer for rejected formats only
        for fmt in decision["rejected_formats"]:
            state["content"][fmt] = regenerate_single_format(fmt, state)

    return state

graph.add_node("human_review", human_review)
graph.add_edge("content_writer", "human_review")
graph.add_edge("human_review", END)
```

The JS pipeline handles this differently: per-format approval lives entirely in the frontend React app, with a `POST /api/regenerate` endpoint that re-runs the content writer for a single rejected format. LangGraph's `interrupt()` gives you the same pattern but with the state management handled by the framework.

## LangSmith integration

LangGraph agents get LangSmith tracing for free if you set the environment variables:

```bash
export LANGSMITH_API_KEY="your-key"
export LANGSMITH_PROJECT="niskanen-pipeline"
export LANGCHAIN_TRACING_V2=true
```

Every node invocation, LLM call, and tool use appears as a span in LangSmith. You can see token counts, latency breakdowns, and input/output for each agent.

The JS pipeline adds tracing manually using `RunTree` from the `langsmith` SDK (see `pipeline.js`). With LangGraph, this is automatic.

### Custom evaluators

The pipeline's four evaluation metrics can be implemented as LangSmith evaluators:

1. **Argument fidelity** -- Does the tweet's claim match the research summary's thesis?
2. **Fact grounding rate** -- What fraction of claims in the content appear in the citation checker's verified list?
3. **Tone calibration** -- Does the congressional one-pager avoid jargon? Does the tweet sound informal?
4. **Format compliance** -- Is the tweet under 280 characters? Is the op-ed 700-900 words?

```python
from langsmith.evaluation import evaluate

def argument_fidelity(run, example):
    """Check if generated content aligns with the research thesis."""
    thesis = run.outputs["research_summary"]["thesis"]
    tweets = run.outputs["content"]["twitter_posts"]
    # Use an LLM judge to assess alignment
    score = llm_judge(f"Does this tweet accurately represent the thesis?\nThesis: {thesis}\nTweet: {tweets[0]}")
    return {"key": "argument_fidelity", "score": score}

evaluate(pipeline, data="niskanen-eval-dataset", evaluators=[argument_fidelity])
```

## Replacing the JS agents step by step

If you want to migrate from the JS pipeline to LangChain Agent Builder:

**Step 1: Keep the prompts.** The system prompts and user prompts in `pipeline.js` are the most valuable part. Copy them directly into your LangGraph node functions.

**Step 2: Swap the LLM calls.** Replace `callBedrock(client, model, system, prompt)` with `ChatBedrock.invoke()`. The response format is slightly different (LangChain returns message objects, not raw text).

**Step 3: Wire the graph.** Replace the hand-written `Promise.allSettled` fan-out with LangGraph's `Send` API. Replace the sequential `await` chains with graph edges.

**Step 4: Add tools.** The Citation Checker currently calls Tavily via raw `fetch()`. Replace with LangChain's `TavilySearchResults` tool, which integrates with the agent's tool-use loop.

**Step 5: Add interrupt.** Replace the frontend-only HITL flow with LangGraph's `interrupt()`. This lets you run the review step server-side, which is useful if you want to integrate with Slack or email approval workflows instead of a web UI.

**Step 6: Deploy.** Use LangGraph Cloud or self-host with `langgraph serve`. The LangGraph server handles state persistence, retries, and streaming out of the box.

## RAG for the style agent

The current Style Analyst looks only at the input article. With a corpus of 100+ Niskanen publications (see `data/niskanen_corpus/`), you can add RAG retrieval:

**Option 1: ChromaDB (local)**
The Python pipeline already has this via `tools/style_retriever.py`. Index the corpus with `data/index_corpus.py`, then query for the 3-5 most similar documents at runtime.

**Option 2: Bedrock Knowledge Bases (serverless)**
Upload the corpus to S3, create a Bedrock Knowledge Base, and query it from the Style Analyst node. No infrastructure to manage.

**Option 3: Inline sampling**
For a small corpus (100 docs), you can sample 3-5 representative passages directly into the Style Analyst prompt. No vector store needed, but doesn't scale past a few hundred documents.

Option 2 is the right choice for production. It's serverless, requires no running infrastructure, and integrates with the existing AWS stack.

## References

- [LangGraph documentation](https://langchain-ai.github.io/langgraph/)
- [deepagents](https://github.com/langchain-ai/deepagents) -- LangChain's reference patterns for multi-agent systems
- [LangGraph Send API](https://langchain-ai.github.io/langgraph/concepts/low_level/#send) -- fan-out/fan-in pattern
- [LangGraph interrupt()](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/) -- human-in-the-loop
- [LangSmith evaluation](https://docs.smith.langchain.com/evaluation) -- custom evaluators
- [Reddit researcher agent](https://blog.langchain.dev/how-to-build-a-research-agent/) -- multi-agent pattern reference
