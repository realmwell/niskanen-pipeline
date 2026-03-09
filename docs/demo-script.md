# Demo script (7 minutes)

Recording storyboard for the Niskanen content pipeline demo. Each section includes what to show, what to say, and approximate timing.

---

## 1. Problem and approach (0:00 - 0:30)

**Show**: Title slide or terminal with project name.

**Say**: "Niskanen Center publishes policy research papers. Each paper needs to become a content package: a tweet, LinkedIn post, newsletter paragraph, congressional one-pager, op-ed draft, and media placement recommendations. Today that process is manual and takes hours per paper. This pipeline automates it with six specialized agents, human review, and full observability through LangSmith."

---

## 2. Run the pipeline (0:30 - 2:30)

**Show**: Terminal, run `python main.py https://www.niskanencenter.org/wp-content/uploads/2024/04/Creating-a-more-dynamic-unemployment-insurance-system.pdf`

**Say**: "I'm feeding it a real Niskanen paper on unemployment insurance reform. Watch the steps."

**Point out as they appear**:
- "PDF extraction pulls 66,000 characters from the paper."
- "The supervisor validates the extraction passed."
- "Research Analyst runs first. It extracts the thesis, key evidence, and caveats. The other three specialists need this output, so it runs before them."
- "Now Audience Mapper, Citation Checker, and Style Agent run in parallel. They write to independent state keys, so there are no conflicts."
  - "Citation Checker is doing live web searches via Tavily to verify claims from the paper."
  - "Style Agent retrieves real Niskanen articles from a local vector store to match their writing voice."
- "Content Writer receives all four specialist outputs and produces seven content formats."
- "The pipeline pauses here for human review."

---

## 3. Review the content package (2:30 - 4:00)

**Show**: The content package output in the terminal.

**Walk through each format**:
- "The tweet is under 280 characters. No hashtags, no emojis, just the core finding."
- "LinkedIn post hits a professional tone with one concrete data point."
- "The congressional one-pager uses plain language with bullet points. No jargon. Ends with a bottom-line sentence."
- "The op-ed draft is structured with an opening lede and section headings."
- "Media recommendations suggest specific outlets based on the paper's policy domain."

**Say**: "I'll approve this for the demo, but in practice you'd revise. The revision loop sends feedback back to the Content Writer."

**Type**: `approve`

**Show**: Output saved message, final JSON path.

---

## 4. LangSmith traces (4:00 - 6:00)

**Show**: Open LangSmith in browser, navigate to the `takehome` project, click the most recent trace.

**Point out**:
- "Here's the full trace. You can see the graph execution as a timeline."
- "PDF extraction, then supervisor, then research analyst, then the three parallel agents, then content writer."
- "Click into the Citation Checker. You can see each Tavily search query and its results. This is how you debug fact-checking accuracy."
- "Token counts per agent. Research Analyst uses the most input tokens because it processes the full paper text. Content Writer uses the most output tokens because it generates seven formats."
- "Total latency and cost per run. About 30 seconds and 2 cents."

**If time allows**: "This is also where the data flywheel lives. When an evaluator flags low argument fidelity, you can trace back to exactly which research summary and which content writer prompt produced the problem."

---

## 5. Evaluation results (6:00 - 7:00)

**Show**: Run `python evaluation/run_evals.py` (or show pre-computed results if time is tight).

**Say**: "Four evaluators score each pipeline run."

**Walk through the metrics**:
- "Argument fidelity: LLM-as-judge scores whether the tweet preserves the paper's thesis. We want 0.7 or higher."
- "Fact grounding rate: deterministic check of how many verified claims show up in the content. This catches the Content Writer making things up."
- "Tone calibration: LLM-as-judge checks if the congressional one-pager is accessible to non-expert staff."
- "Format compliance: hard checks on character limits, word counts, and bullet counts."

**Say**: "These evaluators run on a dataset of 5 real Niskanen papers across immigration, fiscal policy, healthcare, and regulation. The scores tell you where the pipeline is strong and where it needs prompt tuning."

---

## Notes for recording

- Pre-download the test PDF so the pipeline doesn't wait on network during the demo.
- Have LangSmith open in a browser tab, already logged in.
- If the pipeline takes longer than expected, talk through what each agent is doing while it runs.
- The CLI output messages are designed for the demo. They name each step and each agent.
- If anything errors out, the error messages are descriptive. Explain what happened and that the pipeline accumulates errors rather than crashing.
