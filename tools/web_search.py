"""
Web search tool for claim verification.

Wraps Tavily search as a LangChain tool. The Citation Checker agent uses this
to verify specific statistical claims found in policy papers.
"""

import os

try:
    from langchain_tavily import TavilySearch as TavilySearchResults
except ImportError:
    from langchain_community.tools.tavily_search import TavilySearchResults


def get_search_tool() -> TavilySearchResults:
    """
    Create a Tavily search tool instance.

    Requires TAVILY_API_KEY in environment.
    """
    return TavilySearchResults(
        max_results=5,
        search_depth="advanced",
        include_answer=True,
        include_raw_content=False,
    )


def verify_claim(claim: str, source_context: str = "") -> list[dict]:
    """
    Search for evidence supporting or contradicting a specific claim.

    Args:
        claim: The factual claim to verify (e.g., "Carbon emissions fell 12% in 2023").
        source_context: Optional context about the claim's source for better search.

    Returns:
        List of search results, each with 'url', 'title', and 'content' keys.
    """
    search = get_search_tool()

    # Build a targeted query: the claim itself plus source context if available
    query = claim
    if source_context:
        query = f"{claim} {source_context}"

    results = search.invoke({"query": query})

    # Normalize the output format
    if isinstance(results, str):
        return [{"url": "", "title": "", "content": results}]

    normalized = []
    for r in results:
        if isinstance(r, dict):
            normalized.append({
                "url": r.get("url", ""),
                "title": r.get("title", ""),
                "content": r.get("content", ""),
            })

    return normalized
