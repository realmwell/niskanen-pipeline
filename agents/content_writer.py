"""
Content Writer agent.

The synthesis agent that receives all four specialist outputs and produces
the full content package. This is the most important agent in the pipeline.

Uses claude-3-5-sonnet-20241022 because it handles the most complex task:
synthesizing four inputs into seven distinct content formats while respecting
format constraints, tone registers, and style patterns simultaneously.
Haiku performs comparably on extraction tasks, but Sonnet's stronger reasoning
is needed here.
"""

import os

from langchain_aws import ChatBedrockConverse

from graph.state import PipelineState, ContentPackage


SYSTEM_PROMPT = """You are a senior communications writer for the Niskanen Center, a \
libertarian-leaning think tank that emphasizes evidence-based policy over ideological purity. \
You produce content that is intellectually honest, precise, and accessible.

You have received four inputs from specialist analysts:
1. A structured research summary with the paper's thesis, evidence, and implications
2. An audience map specifying who each format targets and what tone to use
3. A fact-check report identifying which claims are verified and which are not
4. A style guide extracted from the organization's existing published work

Follow these rules strictly:
- Never overstate the paper's confidence beyond what the research summary's \
confidence_caveats allow.
- For any claim the fact_check_report marks as unverified, soften the language \
("the authors find" rather than stating it as established fact).
- Match the tone register specified in the audience_map for each format.
- Follow the stylistic patterns in the style guide.
- Twitter/X: exactly 280 characters or fewer, no hashtags, no emojis.
- LinkedIn: 400-600 characters, professional tone, one concrete finding, one implication.
- Bluesky: 250-300 characters, direct, concrete.
- Newsletter paragraph: 120-150 words, collegial, assumes a policy-literate reader.
- Congressional one-pager: five to seven plain-language bullet points, no jargon, \
each bullet is one sentence, include a "Bottom line" sentence at the end. 250 words max.
- Op-ed lede and outline: one punchy opening paragraph (75 words max) plus three \
Roman-numeral section headings with one sentence describing what each section argues.
- Full draft op-ed: 700-900 words, persuasive but evidence-grounded, suitable for publication.
- Media outlet recommendations: identify 3-5 outlets likely to publish this op-ed based on \
the paper's domain. For each outlet, note their editorial focus, submission process, \
and style preferences.

Writing rules (apply to ALL outputs):
- Use "use" not "utilize," "help" not "facilitate"
- Active voice over passive
- No em dashes (use commas, colons, or parentheses instead)
- No exclamation points
- No marketing buzzwords
- No jargon that could confuse outsiders
- One idea per paragraph"""


def get_llm():
    return ChatBedrockConverse(
        model=os.environ.get("SONNET_MODEL_ID", "us.anthropic.claude-3-haiku-20240307-v1:0"),
        temperature=0.7,
        max_tokens=8000,
    )


def content_writer_node(state: PipelineState) -> dict:
    """
    Synthesize all specialist outputs into the full content package.

    Validates that all four specialist outputs are present before proceeding.
    Returns content_package as a dict.
    """
    # Validate all inputs are present
    missing = []
    if not state.get("research_summary"):
        missing.append("research_summary")
    if not state.get("audience_map"):
        missing.append("audience_map")
    if not state.get("fact_check_report"):
        missing.append("fact_check_report")
    if not state.get("style_patterns"):
        missing.append("style_patterns")

    if missing:
        return {
            "errors": [
                f"Content Writer: Missing inputs from specialists: {', '.join(missing)}. "
                "Cannot produce content package without all four inputs."
            ]
        }

    # Build the user prompt with all specialist outputs
    research = state["research_summary"]
    audience = state["audience_map"]
    fact_check = state["fact_check_report"]
    style = state["style_patterns"]

    # Include human feedback if this is a revision pass
    revision_note = ""
    human_notes = state.get("human_review_notes", "")
    if human_notes:
        revision_note = (
            f"\n\nIMPORTANT - REVISION REQUESTED. The human reviewer provided this feedback "
            f"on the previous draft. Address every point:\n{human_notes}\n"
        )

    user_prompt = f"""Create a complete content package for this Niskanen Center policy paper.

RESEARCH SUMMARY:
{_format_dict(research)}

AUDIENCE MAP:
{_format_dict(audience)}

FACT-CHECK REPORT:
{_format_dict(fact_check)}

STYLE PATTERNS:
{_format_dict(style)}
{revision_note}
Generate all seven content formats plus media outlet recommendations."""

    llm = get_llm()
    structured_llm = llm.with_structured_output(ContentPackage)

    try:
        result = structured_llm.invoke([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ])
        return {"content_package": result.model_dump()}
    except Exception as e:
        return {"errors": [f"Content Writer error: {str(e)}"]}


def _format_dict(d: dict) -> str:
    """Format a dict for readable inclusion in a prompt."""
    lines = []
    for key, value in d.items():
        if isinstance(value, list):
            items = "\n".join(f"  - {item}" for item in value)
            lines.append(f"{key}:\n{items}")
        elif isinstance(value, dict):
            items = "\n".join(f"  {k}: {v}" for k, v in value.items())
            lines.append(f"{key}:\n{items}")
        else:
            lines.append(f"{key}: {value}")
    return "\n".join(lines)
