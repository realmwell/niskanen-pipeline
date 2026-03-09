"""
Style Agent.

Uses the style_retriever tool to fetch existing Niskanen content for each
format, then extracts stylistic patterns. This gives the Content Writer
concrete examples of the organization's voice rather than abstract instructions.

Uses claude-3-5-haiku-20241022 for pattern extraction.
"""

import os

from langchain_aws import ChatBedrockConverse

from graph.state import PipelineState, StylePatterns
from tools.style_retriever import retrieve_style_examples


SYSTEM_PROMPT = """You are a copy editor who has studied a specific organization's published work. \
You receive samples of their existing content. Identify:

1. Average sentence length in words
2. Rhetorical moves they consistently use (e.g., "acknowledge the counterargument before \
dismissing it," "lead with the empirical finding before the policy implication")
3. Phrases or framings they avoid (e.g., avoid "the science is settled," avoid partisan labels)
4. The overall voice and register

Include 2-3 representative sample passages that best capture the organization's writing style.

Return as JSON matching the required schema."""


def get_llm():
    return ChatBedrockConverse(
        model=os.environ.get("HAIKU_MODEL_ID", "us.anthropic.claude-3-haiku-20240307-v1:0"),
        temperature=0,
        max_tokens=2000,
    )


def style_agent_node(state: PipelineState) -> dict:
    """
    Extract writing style patterns from Niskanen's published corpus.

    Uses ChromaDB to retrieve relevant examples, then analyzes them with Haiku.
    Returns style_patterns as a dict.
    """
    research_summary = state.get("research_summary", {})
    domain = research_summary.get("domain", "policy") if research_summary else "policy"
    thesis = research_summary.get("thesis", "policy analysis") if research_summary else "policy analysis"

    # Retrieve style examples across different formats
    query = f"{domain} {thesis}"
    examples_oped = retrieve_style_examples(query, content_format="op-ed", n_results=3)
    examples_brief = retrieve_style_examples(query, content_format="brief", n_results=2)
    examples_general = retrieve_style_examples(query, n_results=3)

    # Combine and deduplicate
    all_examples = []
    seen = set()
    for ex in examples_oped + examples_brief + examples_general:
        if ex not in seen and not ex.startswith("[No"):
            all_examples.append(ex)
            seen.add(ex)

    if not all_examples:
        # No corpus available: return minimal defaults
        defaults = StylePatterns(
            sentence_length_avg=20,
            rhetorical_moves=[
                "Lead with empirical findings before policy implications",
                "Acknowledge counterarguments before presenting the preferred position",
                "Use specific data points rather than vague claims",
            ],
            avoided_phrases=[
                "the science is settled",
                "common sense tells us",
                "everyone knows",
                "radical",
                "socialist",
            ],
            sample_passages=["[No corpus available. Using default style patterns.]"],
        )
        return {"style_patterns": defaults.model_dump()}

    # Analyze the examples with Haiku
    llm = get_llm()
    structured_llm = llm.with_structured_output(StylePatterns)

    examples_text = "\n\n---\n\n".join(all_examples[:8])

    try:
        result = structured_llm.invoke([
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Analyze these writing samples from the Niskanen Center and "
                    f"extract their stylistic patterns:\n\n{examples_text}"
                ),
            },
        ])
        return {"style_patterns": result.model_dump()}
    except Exception as e:
        # Bedrock structured output can fail on complex schemas.
        # Fall back to sensible defaults derived from the corpus.
        defaults = StylePatterns(
            sentence_length_avg=22,
            rhetorical_moves=[
                "Lead with empirical findings before policy implications",
                "Acknowledge counterarguments before presenting the preferred position",
                "Use specific data points rather than vague claims",
            ],
            avoided_phrases=[
                "the science is settled",
                "common sense tells us",
                "radical",
                "socialist",
                "facilitate",
                "utilize",
            ],
            sample_passages=all_examples[:3] if all_examples else [
                "[Structured output failed. Using default style patterns.]"
            ],
        )
        return {"style_patterns": defaults.model_dump()}
