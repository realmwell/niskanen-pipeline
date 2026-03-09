"""
Research Analyst agent.

Reads the full paper text and produces a structured research summary. This is
the only agent that processes the raw paper text directly. All other agents
receive its structured output.

Uses claude-3-5-haiku-20241022 for cost efficiency: the task is extraction and
classification from well-defined inputs, where Haiku performs comparably to
Sonnet at ~10x lower cost.
"""

import os

from langchain_aws import ChatBedrockConverse

from graph.state import PipelineState, ResearchSummary


SYSTEM_PROMPT = """You are a policy research analyst at a libertarian-leaning think tank. \
Your job is to extract the core intellectual contribution of a policy paper with precision. \
You do not simplify or editorialize.

You identify:
1. The central thesis stated as a single falsifiable claim
2. The three to five strongest pieces of evidence marshaled in support
3. The direct policy implications the authors draw
4. The domain (choose from: tax_policy, immigration, climate_energy, regulation, \
fiscal_policy, healthcare, housing, trade, other)
5. Any explicit confidence caveats or limitations the authors acknowledge

Return your output as a JSON object matching the required schema. \
Do not add interpretation beyond what the paper states."""


def get_llm():
    return ChatBedrockConverse(
        model=os.environ.get("HAIKU_MODEL_ID", "us.anthropic.claude-3-haiku-20240307-v1:0"),
        temperature=0,
        max_tokens=2000,
    )


def research_analyst_node(state: PipelineState) -> dict:
    """
    Analyze the paper and produce a structured research summary.

    Reads raw_text from state, returns research_summary as a dict.
    """
    raw_text = state.get("raw_text", "")

    if not raw_text:
        return {"errors": ["Research Analyst: No raw text available to analyze."]}

    # Truncate to ~15k words to stay within context limits
    # Haiku has 200k context but we want to keep costs low
    truncated = raw_text[:60000]

    llm = get_llm()
    structured_llm = llm.with_structured_output(ResearchSummary)

    try:
        result = structured_llm.invoke([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze this policy paper:\n\n{truncated}"},
        ])
        return {"research_summary": result.model_dump()}
    except Exception as e:
        return {"errors": [f"Research Analyst error: {str(e)}"]}
