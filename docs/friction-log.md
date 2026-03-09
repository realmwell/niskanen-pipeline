# Friction log

Friction encountered while building the Niskanen content pipeline with LangChain, LangGraph, LangSmith, and related tools. Organized by framework.

---

## LangChain

### 1. Package version confusion in prompt spec

The take-home prompt specified `langchain>=1.2.10`, `langgraph>=1.0.3`, and `chromadb>=1.5.0`. None of these versions exist on PyPI. The actual latest versions at time of writing are langchain 0.3.x, langgraph 0.3.x, and chromadb 0.5.x.

**Impact**: 10 minutes wasted checking PyPI and wondering if I had the wrong package name. Not a huge deal, but confusing for someone less familiar with the ecosystem.

**Suggestion**: Pin to real version ranges in spec documents, or just say "latest stable."

### 2. Tavily import deprecation

`from langchain_community.tools.tavily_search import TavilySearchResults` emits a deprecation warning pointing to `langchain-tavily`. The new package exists but isn't mentioned in the main LangChain docs when you search for "Tavily." You have to find it through the warning message.

**Impact**: 5 minutes. Easy fix once you know the new package name.

**Suggestion**: Update the LangChain integrations page to list `langchain-tavily` as the primary import path, with `langchain-community` as legacy.

### 3. ChatBedrockConverse structured output failures

`ChatBedrockConverse.with_structured_output(PydanticModel)` sometimes returns malformed responses from Bedrock, especially with Claude 3.5 Haiku. One failure produced a dict with XML-like content mixed into the keys (literal `</invoke>` strings as key names). The Pydantic validation catches it, but there is no retry or fallback built in.

**Impact**: 30 minutes debugging the Style Agent. Had to add a manual fallback that returns sensible defaults when structured output fails.

**Suggestion**: `with_structured_output()` should accept a `max_retries` parameter or at least document the failure modes per provider. Bedrock behaves differently from the direct Anthropic API here.

### 4. langchain-aws Bedrock model ID format

The Bedrock model ID format changed. Raw IDs like `anthropic.claude-3-5-haiku-20241022-v1:0` don't work anymore; you need inference profile IDs with a `us.` prefix: `us.anthropic.claude-3-5-haiku-20241022-v1:0`. The error message says "Retry with inference profile" but doesn't show the correct ID format.

**Impact**: 20 minutes. Had to look up the Bedrock docs separately.

**Suggestion**: The langchain-aws docs should mention the inference profile format, or `ChatBedrockConverse` should auto-detect and add the prefix.

---

## LangGraph

### 5. Fan-out/fan-in topology with data dependencies

The original plan was to fan out all four specialist agents from the supervisor node. The LangGraph docs describe fan-out as "multiple edges from one node" where all targets run in the same super-step.

What the docs don't emphasize: if agent B needs agent A's output and both fan out from the same source, agent B will read stale state because they execute simultaneously. The fix is obvious in hindsight (chain A -> B sequentially), but I only discovered the race condition at runtime.

**Impact**: 45 minutes. The pipeline ran to completion but three agents produced errors because they couldn't read `research_summary`. Had to restructure the graph topology.

**Suggestion**: The fan-out docs should include a warning box: "Nodes in the same super-step cannot read each other's state updates. If node B depends on node A's output, add an edge from A to B, not from the same source to both."

### 6. stream_mode="updates" can yield non-dict events

When streaming with `stream_mode="updates"`, some events are not dicts. The interrupt event comes through as a tuple-like structure. The docs show `for event in graph.stream(...)` with dict unpacking, which crashes on these non-dict events.

**Impact**: 15 minutes. Had to add `if not isinstance(event, dict): continue` as a guard.

**Suggestion**: Document the possible event types for each stream mode, or provide a helper that filters to only dict events.

### 7. Command resume syntax

The `Command(resume=...)` pattern for resuming after an interrupt is documented but the relationship between `interrupt()` and `Command(resume=...)` isn't obvious. The interrupt returns whatever you pass to resume, but this is buried in the reference docs rather than shown in the human-in-the-loop tutorial.

**Impact**: 10 minutes reading docs to figure out the right pattern.

**Suggestion**: The human-in-the-loop tutorial should have a complete working example with interrupt + Command(resume=...) in the same code block.

---

## LangSmith

### 8. LangSmith project naming

The prompt spec references `LANGSMITH_PROJECT` as the project name, but the LangSmith UI calls them "Projects" in one place and the API uses "project" in another. When you first create a project via environment variable, there is no confirmation that it was created. You have to go to the UI and check.

**Impact**: 5 minutes of uncertainty.

**Suggestion**: Log a message when a new project is auto-created, or document this behavior more clearly.

### 9. Evaluation dataset format

The `langsmith.evaluate()` function expects a dataset where each example has `inputs` and optionally `outputs`. The relationship between the dataset format and the evaluator function signature (`run`, `example`) isn't obvious from the docs. I had to read the source code to understand that `run.outputs` contains the pipeline's output and `example.outputs` contains ground truth.

**Impact**: 20 minutes. Not blocking, but slowed down the evaluation setup.

**Suggestion**: The evaluation tutorial should start with a complete example showing the data flow from dataset -> pipeline run -> evaluator function, with annotations on what each parameter contains.

---

## AWS Bedrock

### 10. Model access workflow changed

The Bedrock console's "Model Access" page was retired and replaced with a "Model catalog" approach that routes through AWS Marketplace. The old flow (checkbox + submit form) no longer exists. Newer Anthropic models require accepting a Marketplace offer.

**Impact**: 25 minutes navigating the Bedrock console, finding the retired page, then figuring out the Marketplace flow.

**Suggestion**: This is an AWS issue, not LangChain. But langchain-aws docs could mention "If you get ResourceNotFoundException, check that you've enabled the model via AWS Marketplace."

### 11. Bedrock Sonnet requires separate Marketplace offer

Claude 3.5 Haiku and Claude 3.5 Sonnet each require their own Marketplace acceptance. Enabling Haiku doesn't enable Sonnet. The error message when Sonnet isn't enabled is the same generic ResourceNotFoundException.

**Impact**: Set SONNET_MODEL_ID to Haiku as a temporary workaround. The Content Writer works but produces shorter output.

**Suggestion**: The error message should say which specific model isn't enabled, not just "resource not found."

---

## General observations

### What worked well

- **Pydantic + structured output** is a solid pattern. Defining the output schema once and sharing it between the agent and the evaluator eliminated a whole class of parsing bugs.
- **LangGraph's `interrupt()` mechanism** is clean. The pipeline pauses, you resume with a Command, and the checkpointer handles all the state. No manual serialization needed.
- **LangSmith tracing** auto-instruments everything. I didn't write any tracing code. It just works once you set the environment variables.
- **ChromaDB's default embedding function** (all-MiniLM-L6-v2 ONNX) downloads automatically and runs locally. No API key needed for embeddings.

### What I'd change in the frameworks

1. **LangGraph fan-out docs need a dependency warning.** This was the biggest time sink.
2. **`with_structured_output()` should support retries.** Bedrock failures on structured output are common enough to warrant built-in retry logic.
3. **LangSmith evaluation tutorial needs a complete end-to-end example.** The current docs assume you already understand the data flow.
4. **langchain-aws should auto-detect inference profile IDs.** The `us.` prefix requirement is a Bedrock-ism that the library could abstract away.

---

*Total friction time: roughly 3 hours across all frameworks. Most of it was the fan-out topology issue (45 min) and Bedrock model access (45 min). Everything else was 5-20 minute papercuts.*
