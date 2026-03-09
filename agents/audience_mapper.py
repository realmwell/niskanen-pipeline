"""
Audience Mapper agent.

Receives the research summary and determines which audiences the content
should target and what tone register is appropriate for each output format.

Uses claude-3-5-haiku-20241022 for cost efficiency.
"""

import os

from langchain_aws import ChatBedrockConverse

from graph.state import PipelineState, AudienceMap


SYSTEM_PROMPT = """You are a communications strategist who specializes in policy translation. \
Given a structured policy research summary, determine:

1. The primary audiences for this research (choose from: congressional_staff, journalists, \
policy_wonks, general_public, academic_peers). Select all that apply.

2. The appropriate tone for each output format:
   - twitter: punchy and concrete
   - linkedin: professional and substantive
   - bluesky: concise and direct
   - newsletter: collegial and informative
   - one_pager: plain bureaucratic
   - oped: persuasive and accessible

3. The appropriate complexity level (technical, semi_technical, or accessible).

Return as JSON matching the required schema."""


def get_llm():
    return ChatBedrockConverse(
        model=os.environ.get("HAIKU_MODEL_ID", "us.anthropic.claude-3-haiku-20240307-v1:0"),
        temperature=0,
        max_tokens=1500,
    )


def audience_mapper_node(state: PipelineState) -> dict:
    """
    Map audiences and tone registers based on the research summary.

    Reads research_summary from state, returns audience_map as a dict.
    """
    research_summary = state.get("research_summary")

    if not research_summary:
        return {"errors": ["Audience Mapper: No research summary available."]}

    llm = get_llm()
    structured_llm = llm.with_structured_output(AudienceMap)

    try:
        result = structured_llm.invoke([
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Determine the target audiences and tone for content based on "
                    f"this research summary:\n\n{research_summary}"
                ),
            },
        ])
        return {"audience_map": result.model_dump()}
    except Exception as e:
        return {"errors": [f"Audience Mapper error: {str(e)}"]}
