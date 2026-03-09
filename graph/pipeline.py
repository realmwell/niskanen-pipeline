"""
LangGraph pipeline construction.

Builds the StateGraph with sequential + fan-out/fan-in topology:
  START -> pdf_extraction -> supervisor -> research_analyst
    -> [audience_mapper, citation_checker, style_agent] (parallel)
    -> content_writer -> human_review
    -> (approved: output -> END) | (revise: content_writer) | (escalate: END)

Design decision: research_analyst runs first because the other three specialists
depend on its output (research_summary). After it completes, the remaining three
fan out in parallel (same super-step) since they write to independent state keys.
Send() would be better if the specialist count were dynamic.
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.state import PipelineState
from graph.nodes import (
    pdf_extraction_node,
    human_review_node,
    output_node,
    escalation_node,
    route_after_review,
)
from agents.supervisor import supervisor_node
from agents.research_analyst import research_analyst_node
from agents.audience_mapper import audience_mapper_node
from agents.citation_checker import citation_checker_node
from agents.style_agent import style_agent_node
from agents.content_writer import content_writer_node


def build_pipeline(checkpointer=None):
    """
    Build and compile the Niskanen content pipeline graph.

    Args:
        checkpointer: LangGraph checkpointer instance. Defaults to MemorySaver.
            For production, use PostgresSaver from langgraph-checkpoint-postgres.

    Returns:
        Compiled LangGraph graph ready for invocation.
    """
    if checkpointer is None:
        checkpointer = MemorySaver()

    builder = StateGraph(PipelineState)

    # --- Add nodes ---
    builder.add_node("pdf_extraction_node", pdf_extraction_node)
    builder.add_node("supervisor_node", supervisor_node)
    builder.add_node("research_analyst_node", research_analyst_node)
    builder.add_node("audience_mapper_node", audience_mapper_node)
    builder.add_node("citation_checker_node", citation_checker_node)
    builder.add_node("style_agent_node", style_agent_node)
    builder.add_node("content_writer_node", content_writer_node)
    builder.add_node("human_review_node", human_review_node)
    builder.add_node("output_node", output_node)
    builder.add_node("escalation_node", escalation_node)

    # --- Define edges ---

    # Entry: extract PDF text
    builder.add_edge(START, "pdf_extraction_node")
    builder.add_edge("pdf_extraction_node", "supervisor_node")

    # Research analyst runs first (produces research_summary that
    # audience_mapper, citation_checker, and style_agent all depend on).
    builder.add_edge("supervisor_node", "research_analyst_node")

    # Fan-out: three specialists run in parallel AFTER research_analyst
    # completes, so they can read research_summary from state.
    builder.add_edge("research_analyst_node", "audience_mapper_node")
    builder.add_edge("research_analyst_node", "citation_checker_node")
    builder.add_edge("research_analyst_node", "style_agent_node")

    # Fan-in: content writer waits for all three downstream specialists.
    builder.add_edge("audience_mapper_node", "content_writer_node")
    builder.add_edge("citation_checker_node", "content_writer_node")
    builder.add_edge("style_agent_node", "content_writer_node")

    # Human review (interrupt)
    builder.add_edge("content_writer_node", "human_review_node")

    # Conditional routing after review
    builder.add_conditional_edges(
        "human_review_node",
        route_after_review,
        {
            "output_node": "output_node",
            "content_writer_node": "content_writer_node",
            "escalation_node": "escalation_node",
        },
    )

    # Terminal edges
    builder.add_edge("output_node", END)
    builder.add_edge("escalation_node", END)

    return builder.compile(checkpointer=checkpointer)
