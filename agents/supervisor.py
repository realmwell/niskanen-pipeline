"""
Supervisor agent: validates inputs before dispatching to specialist agents.

The supervisor checks that PDF extraction succeeded and the text is long enough
to analyze. If extraction failed, it routes the graph to END with an error.
This is lightweight by design: the routing logic is deterministic (always
fan-out to all four specialists), so the supervisor doesn't need an LLM.
"""

from graph.state import PipelineState


def supervisor_node(state: PipelineState) -> dict:
    """
    Validate extracted paper text before dispatching to specialists.

    Checks:
        - raw_text is present and non-empty
        - raw_text is at least 500 characters (rejects garbage extractions)

    Returns:
        Empty dict if validation passes (graph continues to parallel nodes).
        Dict with error message if validation fails.
    """
    raw_text = state.get("raw_text", "")

    if not raw_text or not raw_text.strip():
        return {
            "errors": ["Supervisor: PDF extraction returned empty text. Cannot proceed."],
            "human_review_decision": "escalated",
        }

    if len(raw_text.strip()) < 500:
        return {
            "errors": [
                f"Supervisor: Extracted text is only {len(raw_text.strip())} characters. "
                "This is too short for meaningful analysis. The PDF may be scanned images "
                "rather than extractable text."
            ],
            "human_review_decision": "escalated",
        }

    return {}
