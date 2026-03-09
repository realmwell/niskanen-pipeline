"""
Node wrapper functions for the LangGraph pipeline.

Each function takes PipelineState and returns a partial state update dict.
These wrap the agent implementations and handle the PDF extraction step,
human review interrupt, output writing, and escalation.
"""

import json
import os
from datetime import datetime
from pathlib import Path

from langgraph.types import interrupt

from graph.state import PipelineState
from tools.pdf_reader import extract_pdf_text
from agents.supervisor import supervisor_node
from agents.research_analyst import research_analyst_node
from agents.audience_mapper import audience_mapper_node
from agents.citation_checker import citation_checker_node
from agents.style_agent import style_agent_node
from agents.content_writer import content_writer_node


def pdf_extraction_node(state: PipelineState) -> dict:
    """
    Extract text from the input PDF path or URL.

    First node in the pipeline. Downloads if URL, extracts text with pypdf.
    """
    input_path = state.get("input_path", "")

    if not input_path:
        return {"errors": ["PDF Extraction: No input_path provided."]}

    try:
        raw_text = extract_pdf_text(input_path)
        print(f"  Extracted {len(raw_text)} characters from {input_path}")
        return {"raw_text": raw_text}
    except Exception as e:
        return {
            "raw_text": "",
            "errors": [f"PDF Extraction error: {str(e)}"],
        }


def human_review_node(state: PipelineState) -> dict:
    """
    Pause for human review of the content package.

    Uses LangGraph's interrupt() to pause execution. The caller (main.py CLI
    or a frontend) resumes the graph with a Command containing the reviewer's
    decision.

    In production, this would be replaced by an email notification with an
    approval link or a web UI.
    """
    content_package = state.get("content_package", {})
    errors = state.get("errors", [])

    # Package the review payload
    review_payload = {
        "content_package": content_package,
        "errors": errors,
    }

    # Pause execution and wait for human input
    decision = interrupt(review_payload)

    # Parse the human's response
    if isinstance(decision, dict):
        action = decision.get("action", "escalated")
        notes = decision.get("feedback", "")
    elif isinstance(decision, str):
        action = decision.strip().lower()
        notes = ""
    else:
        action = "escalated"
        notes = "Unrecognized review input"

    revision_count = state.get("revision_count", 0)

    if action in ("approve", "approved"):
        return {
            "human_review_decision": "approved",
            "human_review_notes": notes,
        }
    elif action in ("revise", "revision_requested"):
        return {
            "human_review_decision": "revision_requested",
            "human_review_notes": notes,
            "revision_count": revision_count + 1,
        }
    else:
        return {
            "human_review_decision": "escalated",
            "human_review_notes": notes,
        }


def output_node(state: PipelineState) -> dict:
    """
    Write the approved content package to a JSON file.
    """
    content_package = state.get("content_package", {})
    input_path = state.get("input_path", "unknown")

    # Derive output filename from input
    stem = Path(input_path).stem if not input_path.startswith("http") else "paper"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(__file__).parent.parent / "outputs"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / f"{stem}_{timestamp}.json"

    output_data = {
        "input_path": input_path,
        "content_package": content_package,
        "research_summary": state.get("research_summary"),
        "audience_map": state.get("audience_map"),
        "fact_check_report": state.get("fact_check_report"),
        "style_patterns": state.get("style_patterns"),
        "human_review_decision": state.get("human_review_decision"),
        "human_review_notes": state.get("human_review_notes"),
        "errors": state.get("errors", []),
        "generated_at": timestamp,
    }

    with open(output_path, "w") as f:
        json.dump(output_data, f, indent=2)

    print(f"\n  Content package saved to: {output_path}")
    return {}


def escalation_node(state: PipelineState) -> dict:
    """
    Handle escalated reviews: log the escalation and end the pipeline.
    """
    notes = state.get("human_review_notes", "No notes provided")
    errors = state.get("errors", [])
    print(f"\n  ESCALATED: {notes}")
    if errors:
        print(f"  Errors during pipeline: {errors}")
    return {}


def route_after_review(state: PipelineState) -> str:
    """
    Conditional routing after human review.

    Returns the name of the next node based on the review decision.
    """
    decision = state.get("human_review_decision", "escalated")
    revision_count = state.get("revision_count", 0)

    if decision == "approved":
        return "output_node"
    elif decision == "revision_requested" and revision_count < 2:
        return "content_writer_node"
    else:
        return "escalation_node"
