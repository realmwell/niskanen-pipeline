# Niskanen Center research-to-content pipeline

A multi-agent system that converts policy research papers into publication-ready content packages. Built with LangGraph, LangChain, and Claude on AWS Bedrock.

Given a PDF (local file or URL), the pipeline produces seven content formats: a tweet, LinkedIn post, Bluesky post, newsletter paragraph, congressional one-pager, op-ed draft, and media outlet recommendations. A human reviews the package before anything gets published.

## How it works

The pipeline runs six agents in a specific order:

```
PDF extraction -> Supervisor (validates text)
  -> Research Analyst (extracts thesis, evidence, caveats)
    -> Audience Mapper  \
    -> Citation Checker   } run in parallel
    -> Style Agent       /
  -> Content Writer (synthesizes all four inputs into 7 formats)
  -> Human Review (interrupt: approve / revise / escalate)
  -> Output (saves JSON)
```

The Research Analyst runs first because the other three specialists need its output. After it finishes, the Audience Mapper, Citation Checker, and Style Agent fan out in parallel (they write to independent state keys, so there are no conflicts). The Content Writer waits for all three before synthesizing.

Human review uses LangGraph's `interrupt()` mechanism. The pipeline pauses, displays the content package, and waits for a decision. On revision, the Content Writer gets the feedback and tries again. After two failed revisions, it escalates.

## Prerequisites

- Python 3.11+
- AWS account with Bedrock access (Claude 3.5 Haiku enabled)
- Three API keys (all free tiers work):
  - [LangSmith](https://smith.langchain.com) for tracing
  - [Tavily](https://tavily.com) for web search (citation checking)
  - AWS credentials in `~/.aws/credentials`

## Setup

```bash
git clone https://github.com/realmwell/niskanen-pipeline.git
cd niskanen-pipeline

python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your API keys
```

## Usage

### Run the pipeline

```bash
# From a URL
python main.py https://www.niskanencenter.org/wp-content/uploads/2024/04/Creating-a-more-dynamic-unemployment-insurance-system.pdf

# From a local file
python main.py path/to/paper.pdf
```

The CLI walks you through the pipeline steps, then pauses for review. Type `approve`, `revise` (with feedback), or `escalate`.

### Run evaluations

```bash
python evaluation/run_evals.py
```

Runs the full pipeline against 5 test papers and scores them on four metrics (see Evaluation below).

## Project structure

```
niskanen_pipeline/
  agents/           # Six agent implementations
    supervisor.py       # Validates PDF extraction (no LLM)
    research_analyst.py # Extracts thesis, evidence, caveats
    audience_mapper.py  # Maps audiences and tone per format
    citation_checker.py # Verifies claims via Tavily search
    style_agent.py      # Retrieves style patterns from corpus
    content_writer.py   # Synthesizes everything into 7 formats
  graph/
    state.py        # PipelineState TypedDict + Pydantic models
    pipeline.py     # StateGraph construction and compilation
    nodes.py        # Node wrappers (PDF extraction, human review, output)
  tools/
    pdf_reader.py   # PDF text extraction (local + URL)
    web_search.py   # Tavily search wrapper
    style_retriever.py  # ChromaDB retrieval for style examples
  evaluation/
    evaluators.py   # Four custom evaluators
    dataset.py      # Test dataset (5 real Niskanen papers)
    run_evals.py    # Evaluation runner
  data/
    niskanen_corpus/    # 10 scraped Niskanen articles
    chroma_db/          # ChromaDB vector store
    collect_corpus.py   # Corpus scraper
    index_corpus.py     # Corpus indexer
  docs/
    architecture/       # LangSmith self-hosted architecture doc
    friction-log.md     # Framework friction points
    demo-script.md      # 7-minute demo storyboard
  outputs/          # Generated content packages (JSON)
  main.py           # CLI entrypoint
  test_pipeline.py  # Quick end-to-end test
```

## Design decisions

**Why agents instead of a single prompt?** The paper analysis, audience mapping, fact-checking, and style extraction are genuinely different tasks that benefit from specialized system prompts and tools. The Citation Checker needs web search access. The Style Agent needs vector retrieval. A single prompt would be doing too many things at once, and you couldn't parallelize the independent work.

**Model selection.** Research Analyst, Audience Mapper, Citation Checker, and Style Agent use Claude 3.5 Haiku (fast, cheap, good at extraction). Content Writer uses Sonnet when available (better at the complex synthesis task of producing 7 formats while respecting constraints from 4 different inputs). Model IDs are configurable via environment variables.

**Structured output everywhere.** Every agent uses `.with_structured_output()` with Pydantic models. This means the pipeline never has to parse free-text LLM responses. If the model produces something that doesn't match the schema, Pydantic catches it immediately rather than letting bad data propagate.

**Style retrieval with ChromaDB.** Instead of describing Niskanen's voice abstractly, the Style Agent retrieves actual published passages from a local vector store. The Content Writer gets concrete examples of how the organization writes, not vague instructions like "be professional."

**Error accumulation.** The `errors` field in state uses `Annotated[list[str], operator.add]` as a LangGraph reducer. This means parallel agents can all append errors without overwriting each other. The Content Writer checks for missing inputs before proceeding, and the human reviewer sees all accumulated errors.

**MemorySaver for dev, PostgresSaver for production.** The in-memory checkpointer is fine for development and demos. For a production deployment, swap in `langgraph-checkpoint-postgres` with a connection string. The rest of the code stays the same.

## Evaluation

Four evaluators, two LLM-as-judge and two deterministic:

| Evaluator | Type | What it measures |
|---|---|---|
| `argument_fidelity` | LLM-as-judge | Does the tweet preserve the paper's thesis? |
| `fact_grounding_rate` | Deterministic | What fraction of verified claims appear in the content? |
| `tone_calibration` | LLM-as-judge | Is the one-pager jargon-free enough for congressional staff? |
| `format_compliance` | Deterministic | Do character counts, word counts, and bullet counts meet spec? |

The test dataset includes 10 Niskanen papers across immigration, fiscal policy, healthcare, regulation, climate/energy, housing, and trade domains.

## Frontend (web pipeline)

A React SPA that submits article URLs to a serverless backend, which runs the same 5-agent pipeline and displays intermediate outputs alongside the final content package.

### Local development

```bash
cd frontend
npm install

# Start Vite dev server (port 5173)
npm run dev

# Start Express backend (port 3002)
npm run backend
```

The dev server proxies `/api/*` requests to the Express backend, which uses the same pipeline code as the Lambda.

### Production deployment

The production stack is entirely serverless (zero idle cost):

| Component | Service | URL/ID |
|-----------|---------|--------|
| Frontend | S3 + CloudFront | `d18sl4hk20kzb6.cloudfront.net` |
| API | API Gateway + Lambda | `v1tofkjpy6.execute-api.us-east-1.amazonaws.com` |
| Model inference | Bedrock (Claude 3.5 Haiku) | `us-east-1` |
| Citation search | Tavily API | configured via `TAVILY_API_KEY` |

The Lambda runs 5 sequential Bedrock calls (Research Analyst, then Audience Mapper + Citation Checker + Style Analyst in parallel, then Content Writer) plus Tavily web searches for citation verification. Total latency: 15-30 seconds per article.

### Deploying updates

```bash
# Frontend
cd frontend && npm run build
aws s3 sync dist/ s3://niskanen-pipeline-demo/ --delete
aws cloudfront create-invalidation --distribution-id E1ZA7YS04KUUB5 --paths "/*"

# Lambda
cd frontend/backend
# Package index.js + pipeline.js + node_modules into zip
aws lambda update-function-code --function-name niskanen-pipeline --zip-file fileb://lambda.zip
```

## LangSmith traces

Every pipeline run is traced in LangSmith (project: `takehome`). Traces show:

- Full graph execution with timing per node
- Which agents ran in parallel vs. sequentially
- Token counts and latency per LLM call
- Exact prompts and responses for each agent
- Error propagation through the pipeline

**Viewing traces**: Go to [smith.langchain.com](https://smith.langchain.com), select the `takehome` project. Each trace corresponds to one pipeline run. Click into a trace to see the span tree -- the root span is the graph execution, child spans are individual agent nodes.

**Span structure**: `graph` (root) -> `supervisor` -> `research_analyst` -> [`audience_mapper`, `citation_checker`, `style_agent`] (parallel) -> `content_writer` -> `human_review`.

## Cost validation

Per-paper estimates (Claude 3.5 Haiku at $0.25/M input, $1.25/M output):

| Agent | Input tokens | Output tokens | Cost |
|---|---|---|---|
| Research Analyst | ~8,000 | ~500 | ~$0.003 |
| Audience Mapper | ~600 | ~300 | ~$0.001 |
| Citation Checker | ~3,000 | ~800 | ~$0.002 |
| Style Agent | ~2,000 | ~400 | ~$0.001 |
| Content Writer | ~4,000 | ~3,000 | ~$0.005 |
| **Total** | ~17,600 | ~5,000 | **~$0.011** |

Tavily search adds ~$0.01 per paper (5-10 searches). Total cost per paper: roughly 2 cents. Validate against actual LangSmith trace token counts in the `takehome` project.

## Known limitations

- **Haiku as Content Writer fallback.** When Sonnet isn't available on Bedrock, the Content Writer uses Haiku, which produces shorter outputs. The op-ed draft and newsletter paragraph tend to come in under their target word counts. This fixes itself once Sonnet is enabled.
- **Style corpus is small.** 10 articles, 76 chunks. A production system would want 50-100 articles across all formats Niskanen publishes.
- **No retry logic.** If Bedrock throttles a request, the agent fails and appends an error. A production system should use exponential backoff.
- **Single-paper processing.** The pipeline handles one paper at a time. Batch processing would need a queue (SQS) and a pool of pipeline instances.
- **PDF extraction quality.** Some PDFs with complex layouts (tables, sidebars, footnotes) produce noisy text. A production system might use a dedicated OCR service.

## Production considerations

To move this from demo to production:

1. **Checkpointer**: Swap `MemorySaver` for `PostgresSaver` (langgraph-checkpoint-postgres)
2. **Monitoring**: Add CloudWatch alarms on Bedrock throttling, Tavily failures, and pipeline duration
3. **Caching**: Cache Research Analyst output per paper hash to avoid re-analyzing the same paper
4. **Retries**: Add exponential backoff on Bedrock calls (503/throttling)
5. **Auth**: The human review interrupt should be behind an auth layer, not a CLI prompt
6. **Storage**: Content packages should go to S3, not local JSON files
