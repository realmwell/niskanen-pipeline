"""
Run the full evaluation suite against the Niskanen content pipeline.

Iterates over the test dataset, runs the pipeline on each paper,
and scores with all four evaluators. Handles failures gracefully --
a single paper failing doesn't block the rest.

Usage:
    python evaluation/run_evals.py              # Run all papers
    python evaluation/run_evals.py --paper 0    # Run only paper at index 0
    python evaluation/run_evals.py --local       # Skip LangSmith dataset, use local list
"""

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

from evaluation.dataset import get_test_papers
from evaluation.evaluators import (
    argument_fidelity_evaluator,
    fact_grounding_rate_evaluator,
    format_compliance_evaluator,
    tone_calibration_evaluator,
)
from graph.pipeline import build_pipeline


class MockRun:
    """Minimal wrapper to pass pipeline outputs to evaluators."""
    def __init__(self, outputs):
        self.outputs = outputs


def run_pipeline_on_paper(paper: dict, pipeline, timeout: int = 300) -> dict:
    """
    Run the pipeline on a single paper, auto-approving at the human review step.

    Returns the final state values or an error dict.
    """
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "input_path": paper["input_path"],
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

    try:
        # Run to the interrupt point
        for event in pipeline.stream(initial_state, config=config, stream_mode="updates"):
            pass

        # Get state at interrupt
        current_state = pipeline.get_state(config)
        state_values = current_state.values

        # Check if pipeline errored before reaching review
        if state_values.get("human_review_decision") == "escalated":
            return {"error": "Pipeline escalated", "errors": state_values.get("errors", [])}

        # Auto-approve at review step
        if current_state.next:
            from langgraph.types import Command
            decision = {"action": "approve", "feedback": ""}
            for event in pipeline.stream(
                Command(resume=decision), config=config, stream_mode="updates"
            ):
                pass

        final_state = pipeline.get_state(config)
        return final_state.values

    except Exception as e:
        return {"error": str(e)}


def evaluate_single(state_values: dict, paper: dict) -> dict:
    """Run all four evaluators on pipeline output."""
    mock_run = MockRun(state_values)

    results = {}
    evaluators = [
        ("argument_fidelity", argument_fidelity_evaluator),
        ("fact_grounding_rate", fact_grounding_rate_evaluator),
        ("tone_calibration", tone_calibration_evaluator),
        ("format_compliance", format_compliance_evaluator),
    ]

    for name, evaluator_fn in evaluators:
        try:
            result = evaluator_fn(mock_run, paper)
            results[name] = result
        except Exception as e:
            results[name] = {"key": name, "score": 0.0, "comment": f"Evaluator error: {e}"}

    # Domain accuracy check (bonus)
    research_summary = state_values.get("research_summary", {})
    detected_domain = research_summary.get("domain", "") if research_summary else ""
    expected_domain = paper.get("expected_domain", "")
    domain_match = detected_domain == expected_domain
    results["domain_accuracy"] = {
        "key": "domain_accuracy",
        "score": 1.0 if domain_match else 0.0,
        "comment": f"Detected: {detected_domain}, Expected: {expected_domain}",
    }

    return results


def print_results_table(all_results: list[dict]):
    """Print a formatted summary table of all evaluation results."""
    print("\n" + "=" * 80)
    print("EVALUATION RESULTS SUMMARY")
    print("=" * 80)

    # Header
    metrics = ["argument_fidelity", "fact_grounding_rate", "tone_calibration",
               "format_compliance", "domain_accuracy"]
    header = f"{'Paper':<35} " + " ".join(f"{m[:12]:>12}" for m in metrics) + "  Status"
    print(header)
    print("-" * len(header))

    # Rows
    for result in all_results:
        paper_name = result["paper"].split("/")[-1][:33]
        if result.get("error"):
            print(f"{paper_name:<35} {'--':>12} {'--':>12} {'--':>12} {'--':>12} {'--':>12}  FAILED")
            continue

        scores = []
        for m in metrics:
            eval_result = result.get("evaluations", {}).get(m, {})
            score = eval_result.get("score", 0.0)
            scores.append(f"{score:.2f}")

        status = "OK" if all(
            result.get("evaluations", {}).get(m, {}).get("score", 0) >= 0.5
            for m in metrics[:4]  # exclude domain_accuracy from pass/fail
        ) else "WARN"

        print(f"{paper_name:<35} " + " ".join(f"{s:>12}" for s in scores) + f"  {status}")

    # Averages
    print("-" * len(header))
    for m in metrics:
        scores = [
            r.get("evaluations", {}).get(m, {}).get("score", 0)
            for r in all_results if not r.get("error")
        ]
        avg = sum(scores) / len(scores) if scores else 0
        print(f"  Average {m}: {avg:.2f}")

    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Run Niskanen pipeline evaluations")
    parser.add_argument("--paper", type=int, help="Run only a specific paper index")
    parser.add_argument("--local", action="store_true", help="Use local paper list (skip LangSmith)")
    args = parser.parse_args()

    os.environ.setdefault("LANGSMITH_TRACING", "true")
    os.environ.setdefault("LANGSMITH_PROJECT", "niskanen-pipeline-eval")

    papers = get_test_papers()

    if args.paper is not None:
        if 0 <= args.paper < len(papers):
            papers = [papers[args.paper]]
        else:
            print(f"Invalid paper index {args.paper}. Available: 0-{len(papers)-1}")
            sys.exit(1)

    print(f"Running evaluation on {len(papers)} papers...")
    print(f"LangSmith project: {os.environ.get('LANGSMITH_PROJECT')}")
    print()

    pipeline = build_pipeline()
    all_results = []

    for i, paper in enumerate(papers):
        paper_name = paper["input_path"].split("/")[-1]
        print(f"[{i+1}/{len(papers)}] {paper_name}")
        print(f"  Domain: {paper['expected_domain']}")
        print(f"  Running pipeline...", end="", flush=True)

        start = time.time()
        state_values = run_pipeline_on_paper(paper, pipeline)
        elapsed = time.time() - start

        if "error" in state_values:
            print(f" FAILED ({elapsed:.1f}s)")
            print(f"  Error: {state_values['error']}")
            all_results.append({
                "paper": paper["input_path"],
                "error": state_values["error"],
            })
            continue

        print(f" done ({elapsed:.1f}s)")
        print(f"  Evaluating...", end="", flush=True)

        evaluations = evaluate_single(state_values, paper)

        for name, result in evaluations.items():
            score = result.get("score", 0)
            comment = result.get("comment", "")[:60]
            print(f"\n    {name}: {score:.2f} - {comment}")

        all_results.append({
            "paper": paper["input_path"],
            "evaluations": evaluations,
        })
        print()

    print_results_table(all_results)

    # Save results to file
    output_path = Path(__file__).parent.parent / "outputs" / "eval_results.json"
    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\nResults saved to {output_path}")


if __name__ == "__main__":
    main()
