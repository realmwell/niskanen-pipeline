"""Quick end-to-end pipeline test."""
import os
import uuid
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

os.environ.setdefault("LANGSMITH_TRACING", "true")
os.environ.setdefault("LANGSMITH_PROJECT", "takehome")

from graph.pipeline import build_pipeline
from langgraph.types import Command

pipeline = build_pipeline()
thread_id = str(uuid.uuid4())
config = {"configurable": {"thread_id": thread_id}}

initial_state = {
    "input_path": "https://www.niskanencenter.org/wp-content/uploads/2024/04/Creating-a-more-dynamic-unemployment-insurance-system.pdf",
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

print("Starting pipeline...")
for event in pipeline.stream(initial_state, config=config, stream_mode="updates"):
    if not isinstance(event, dict):
        continue
    for node_name, update in event.items():
        print(f"  [{node_name}] done")
        if isinstance(update, dict) and update.get("errors"):
            for e in update["errors"]:
                print(f"    ERROR: {e}")

state = pipeline.get_state(config)
vals = state.values

print(f"\nAt interrupt: {state.next}")
errs = vals.get("errors", [])
if errs:
    print(f"Errors ({len(errs)}):")
    for e in errs:
        print(f"  - {e}")

cp = vals.get("content_package", {})
if cp:
    print("\nContent package generated:")
    for key in ["twitter_post", "linkedin_post", "bluesky_post"]:
        val = cp.get(key, "")
        print(f"  {key}: {len(val)} chars")
        print(f"    {val[:120]}")
    np = cp.get("newsletter_paragraph", "")
    print(f"  newsletter: {len(np)} chars, {len(np.split())} words")
    op = cp.get("congressional_one_pager", "")
    print(f"  one_pager: {len(op)} chars")
    fo = cp.get("full_oped", "")
    print(f"  full_oped: {len(fo)} chars, {len(fo.split())} words")
    mr = cp.get("media_outlet_recommendations", "")
    print(f"  media_recs: {len(mr)} chars")
else:
    print("\nNo content package yet. Checking intermediates:")
    for k in ["research_summary", "audience_map", "fact_check_report", "style_patterns"]:
        v = vals.get(k)
        print(f"  {k}: {'present' if v else 'MISSING'}")

if state.next:
    print("\nAuto-approving for test...")
    for event in pipeline.stream(
        Command(resume={"action": "approve", "feedback": ""}),
        config=config,
        stream_mode="updates",
    ):
        if not isinstance(event, dict):
            continue
        for node_name, update in event.items():
            print(f"  [{node_name}] done")

final = pipeline.get_state(config)
print(f"\nFinal decision: {final.values.get('human_review_decision')}")
print(f"Thread: {thread_id}")
