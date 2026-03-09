"""
CLI entrypoint for the Niskanen content pipeline.

Usage:
    python main.py path/to/paper.pdf
    python main.py https://www.niskanencenter.org/path-to-paper.pdf

The pipeline extracts the paper, runs four specialist agents in parallel,
synthesizes content, and pauses for human review. After review, it saves
the approved content package to outputs/.
"""

import json
import os
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv
from langgraph.types import Command


def setup_environment():
    """Load environment variables and configure LangSmith tracing."""
    load_dotenv()

    # LangSmith tracing (auto-instruments all LangChain/LangGraph calls)
    os.environ.setdefault("LANGSMITH_TRACING", "true")
    os.environ.setdefault("LANGSMITH_PROJECT", "takehome")


def display_content_package(content: dict):
    """Print the content package in a readable format for human review."""
    print("\n" + "=" * 70)
    print("CONTENT PACKAGE FOR REVIEW")
    print("=" * 70)

    sections = [
        ("Twitter/X (280 char max)", "twitter_post"),
        ("LinkedIn (400-600 char)", "linkedin_post"),
        ("Bluesky (250-300 char)", "bluesky_post"),
        ("Newsletter Paragraph", "newsletter_paragraph"),
        ("Congressional One-Pager", "congressional_one_pager"),
        ("Op-Ed Lede & Outline", "oped_lede_and_outline"),
        ("Full Op-Ed Draft", "full_oped"),
        ("Media Outlet Recommendations", "media_outlet_recommendations"),
    ]

    for title, key in sections:
        value = content.get(key, "[Not generated]")
        char_count = len(value) if value else 0
        word_count = len(value.split()) if value else 0
        print(f"\n--- {title} ({char_count} chars, {word_count} words) ---")
        print(value)

    print("\n" + "=" * 70)


def get_human_decision() -> dict:
    """Prompt the human reviewer for their decision."""
    print("\nReview options:")
    print("  approve   - Content is ready for publication")
    print("  revise    - Send back to Content Writer with feedback")
    print("  escalate  - Flag for senior review")
    print()

    while True:
        raw = input("Your decision: ").strip().lower()

        if raw in ("approve", "approved", "a"):
            return {"action": "approve", "feedback": ""}
        elif raw.startswith(("revise", "r")):
            feedback = input("Revision feedback: ").strip()
            if not feedback:
                feedback = input("Please provide feedback for the revision: ").strip()
            return {"action": "revise", "feedback": feedback}
        elif raw in ("escalate", "escalated", "e"):
            notes = input("Escalation notes (optional): ").strip()
            return {"action": "escalate", "feedback": notes}
        else:
            print("  Please enter: approve, revise, or escalate")


def main():
    setup_environment()

    # Parse CLI arguments
    if len(sys.argv) < 2:
        print("Usage: python main.py <path_or_url_to_paper.pdf>")
        print("  python main.py path/to/paper.pdf")
        print("  python main.py https://example.com/paper.pdf")
        sys.exit(1)

    input_path = sys.argv[1]
    print(f"\nNiskanen Content Pipeline")
    print(f"Input: {input_path}")
    print("-" * 50)

    # Import here to avoid slow import on --help
    from graph.pipeline import build_pipeline

    pipeline = build_pipeline()
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    # Initial state
    initial_state = {
        "input_path": input_path,
        "raw_text": "",
        "research_summary": None,
        "audience_map": None,
        "fact_check_report": None,
        "style_patterns": None,
        "content_package": None,
        "human_review_decision": "",
        "human_review_notes": "",
        "revision_count": 0,
        "errors": [],
    }

    print("\nStarting pipeline...")
    print("  Step 1: Extracting PDF text...")

    # Run the pipeline (will pause at human_review_node interrupt)
    result = None
    for event in pipeline.stream(initial_state, config=config, stream_mode="updates"):
        for node_name, update in event.items():
            if node_name == "pdf_extraction_node":
                print("  Step 2: Validating extraction...")
            elif node_name == "supervisor_node":
                print("  Step 3: Research Analyst (analyzing paper)...")
            elif node_name == "research_analyst_node":
                print("    [done] Research Analyst")
                print("  Step 4: Running specialist agents in parallel...")
                print("    - Audience Mapper (mapping audiences)")
                print("    - Citation Checker (verifying claims)")
                print("    - Style Agent (extracting patterns)")
            elif node_name == "audience_mapper_node":
                print("    [done] Audience Mapper")
            elif node_name == "citation_checker_node":
                print("    [done] Citation Checker")
            elif node_name == "style_agent_node":
                print("    [done] Style Agent")
            elif node_name == "content_writer_node":
                print("  Step 5: Content Writer synthesizing outputs...")
                print("    [done] Content Writer")

    # Get current state (should be at interrupt)
    current_state = pipeline.get_state(config)

    # Check for errors that prevented reaching review
    state_values = current_state.values
    errors = state_values.get("errors", [])

    if state_values.get("human_review_decision") == "escalated":
        print("\nPipeline escalated due to errors:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    # Check if we hit the interrupt (content ready for review)
    if current_state.next:
        content_package = state_values.get("content_package", {})

        if content_package:
            display_content_package(content_package)

        if errors:
            print("\nWarnings during pipeline execution:")
            for err in errors:
                print(f"  - {err}")

        # Get human decision
        decision = get_human_decision()

        print("\nResuming pipeline...")

        # Resume the graph with the human's decision
        for event in pipeline.stream(
            Command(resume=decision), config=config, stream_mode="updates"
        ):
            for node_name, update in event.items():
                if node_name == "content_writer_node":
                    print("  Revising content...")
                elif node_name == "output_node":
                    print("  Saving approved content...")
                elif node_name == "escalation_node":
                    print("  Escalating for review...")

    # Final state
    final_state = pipeline.get_state(config)
    decision = final_state.values.get("human_review_decision", "unknown")
    print(f"\nPipeline complete. Decision: {decision}")

    # Print LangSmith trace URL
    langsmith_project = os.environ.get("LANGSMITH_PROJECT", "niskanen-pipeline")
    print(f"\nView traces: https://smith.langchain.com/o/default/projects/p/{langsmith_project}")
    print(f"Thread ID: {thread_id}")


if __name__ == "__main__":
    main()
