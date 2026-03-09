"""
Citation Checker agent.

Receives the research summary. For each specific statistical claim or empirical
finding in key_evidence, runs a Tavily web search to find a corroborating or
contradicting source. Scores each claim as verified, unverified, or disputed.

Uses claude-3-5-haiku-20241022 for the assessment step, and Tavily for search.
"""

import os
from langchain_aws import ChatBedrockConverse

from graph.state import PipelineState, FactCheckReport, VerifiedClaim
from tools.web_search import verify_claim


SYSTEM_PROMPT = """You are a fact-checker for a policy publication. You receive a list of \
empirical claims from a research paper along with web search results for each claim.

Assess whether each claim is supported, unsupported, or contradicted by the search results.

Be conservative: only mark a claim as "verified" if you find a credible source (government data, \
peer-reviewed research, major news organization) that explicitly supports the specific number \
or finding. Mark as "unverified" if the search results are inconclusive or off-topic. \
Mark as "disputed" only if a credible source directly contradicts the claim.

Return a JSON object with verified_claims, unverified_claims, and overall_confidence_score \
(float from 0 to 1 representing the proportion of claims that were verified)."""


ASSESSMENT_PROMPT = """Assess the following claims based on the search results provided.

CLAIMS AND SEARCH RESULTS:
{claims_with_results}

For each claim, determine: verified, unverified, or disputed.
Return the full fact-check report."""


def get_llm():
    return ChatBedrockConverse(
        model=os.environ.get("HAIKU_MODEL_ID", "us.anthropic.claude-3-haiku-20240307-v1:0"),
        temperature=0,
        max_tokens=3000,
    )


def citation_checker_node(state: PipelineState) -> dict:
    """
    Verify empirical claims from the research summary using web search.

    Reads research_summary from state, returns fact_check_report as a dict.
    """
    research_summary = state.get("research_summary")

    if not research_summary:
        return {"errors": ["Citation Checker: No research summary available."]}

    key_evidence = research_summary.get("key_evidence", [])

    if not key_evidence:
        # No claims to verify: return a clean report
        report = FactCheckReport(
            verified_claims=[],
            unverified_claims=[],
            overall_confidence_score=1.0,
        )
        return {"fact_check_report": report.model_dump()}

    # Check if Tavily API key is available
    tavily_key = os.environ.get("TAVILY_API_KEY", "")
    if not tavily_key or tavily_key == "your_key_here":
        # No Tavily key: mark all claims as unverified with a note
        unverified = [
            VerifiedClaim(
                claim=claim,
                status="unverified",
                notes="Tavily API key not configured; unable to verify.",
            )
            for claim in key_evidence
        ]
        report = FactCheckReport(
            verified_claims=[],
            unverified_claims=unverified,
            overall_confidence_score=0.0,
        )
        return {"fact_check_report": report.model_dump()}

    # Search for each claim (limit to 10 to control API costs)
    claims_with_results = []
    for claim in key_evidence[:10]:
        try:
            results = verify_claim(claim)
            results_text = "\n".join(
                f"  - [{r['title']}]({r['url']}): {r['content'][:200]}"
                for r in results[:3]
            )
        except Exception as e:
            results_text = f"  Search failed: {str(e)}"

        claims_with_results.append(f"CLAIM: {claim}\nSEARCH RESULTS:\n{results_text}")

    # Use LLM to assess the search results
    llm = get_llm()
    structured_llm = llm.with_structured_output(FactCheckReport)

    try:
        combined = "\n\n---\n\n".join(claims_with_results)
        result = structured_llm.invoke([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": ASSESSMENT_PROMPT.format(claims_with_results=combined)},
        ])
        return {"fact_check_report": result.model_dump()}
    except Exception as e:
        return {"errors": [f"Citation Checker error: {str(e)}"]}
