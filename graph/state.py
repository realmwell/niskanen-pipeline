"""
State definition for the Niskanen content pipeline.

This module defines the shared graph state (TypedDict) and all Pydantic models
for structured agent outputs. Every agent reads from and writes to this state.

Design decision: Each specialist agent writes to its own dedicated state key
(research_summary, audience_map, fact_check_report, style_patterns) rather than
a single "specialist_outputs" dict. This prevents write conflicts during parallel
execution, lets the Content Writer validate each input independently, and gives
IDE autocomplete on every field.
"""

from __future__ import annotations

import operator
from typing import Annotated, Optional, TypedDict
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic models for structured agent outputs
# ---------------------------------------------------------------------------

class ResearchSummary(BaseModel):
    """Output from the Research Analyst agent."""
    thesis: str = Field(description="Central thesis stated as a single falsifiable claim")
    key_evidence: list[str] = Field(
        description="Three to five strongest pieces of evidence from the paper"
    )
    policy_implications: list[str] = Field(
        description="Direct policy implications the authors draw"
    )
    domain: str = Field(
        description=(
            "Policy domain: tax_policy, immigration, climate_energy, regulation, "
            "fiscal_policy, healthcare, housing, trade, or other"
        )
    )
    confidence_caveats: list[str] = Field(
        description="Explicit confidence caveats or limitations the authors acknowledge"
    )


class AudienceMap(BaseModel):
    """Output from the Audience Mapper agent."""
    audiences: list[str] = Field(
        description=(
            "Primary audiences: congressional_staff, journalists, policy_wonks, "
            "general_public, academic_peers"
        )
    )
    tone_by_format: dict[str, str] = Field(
        description=(
            "Tone register per format, e.g. "
            "{'twitter': 'punchy and concrete', 'linkedin': 'professional and substantive'}"
        )
    )
    complexity_level: str = Field(
        description="One of: technical, semi_technical, accessible"
    )


class VerifiedClaim(BaseModel):
    """A single fact-checked claim."""
    claim: str = Field(description="The original claim from the paper")
    status: str = Field(description="verified, unverified, or disputed")
    source_url: Optional[str] = Field(default=None, description="URL of corroborating source")
    source_title: Optional[str] = Field(default=None, description="Title of corroborating source")
    notes: str = Field(default="", description="Brief explanation of verification result")


class FactCheckReport(BaseModel):
    """Output from the Citation Checker agent."""
    verified_claims: list[VerifiedClaim] = Field(
        description="Claims that were verified by credible external sources"
    )
    unverified_claims: list[VerifiedClaim] = Field(
        description="Claims that could not be verified or were disputed"
    )
    overall_confidence_score: float = Field(
        ge=0.0, le=1.0,
        description="Proportion of claims that were verified (0.0 to 1.0)"
    )


class StylePatterns(BaseModel):
    """Output from the Style Agent."""
    sentence_length_avg: int = Field(
        description="Average sentence length in words across the corpus samples"
    )
    rhetorical_moves: list[str] = Field(
        description=(
            "Rhetorical patterns consistently used, e.g. "
            "'acknowledge counterargument before dismissing it'"
        )
    )
    avoided_phrases: list[str] = Field(
        description="Phrases or framings the organization avoids"
    )
    sample_passages: list[str] = Field(
        description="Representative passages showing the organization's voice"
    )


class ContentPackage(BaseModel):
    """Output from the Content Writer agent: the full content package."""
    twitter_post: str = Field(
        description="Twitter/X post, 280 characters or fewer, no hashtags, no emojis"
    )
    linkedin_post: str = Field(
        description="LinkedIn post, 400-600 characters, professional tone"
    )
    bluesky_post: str = Field(
        description="Bluesky post, 250-300 characters, direct and concrete"
    )
    newsletter_paragraph: str = Field(
        description="Newsletter paragraph, 120-150 words, collegial tone"
    )
    congressional_one_pager: str = Field(
        description=(
            "Five to seven plain-language bullet points, no jargon, each bullet is one "
            "sentence, includes a 'Bottom line' sentence at the end. 250 words max."
        )
    )
    oped_lede_and_outline: str = Field(
        description=(
            "One punchy opening paragraph (75 words max) plus three Roman-numeral "
            "section headings with one sentence each"
        )
    )
    full_oped: str = Field(
        description="Full draft op-ed, 700-900 words, persuasive and evidence-grounded"
    )
    media_outlet_recommendations: str = Field(
        description=(
            "Tailored recommendations for which media outlets are likeliest to publish, "
            "with submission policies and style notes for each"
        )
    )


# ---------------------------------------------------------------------------
# Graph State (TypedDict for LangGraph)
# ---------------------------------------------------------------------------

class PipelineState(TypedDict):
    """
    Shared state for the Niskanen content pipeline graph.

    The 'errors' field uses operator.add as a reducer so all parallel nodes
    can append error messages without overwriting each other. All other fields
    use last-writer-wins semantics, which is safe because each specialist
    writes to its own unique key.
    """
    # Input
    input_path: str
    raw_text: str

    # Specialist outputs (each written by exactly one agent, stored as dicts)
    research_summary: Optional[dict]
    audience_map: Optional[dict]
    fact_check_report: Optional[dict]
    style_patterns: Optional[dict]

    # Synthesis output
    content_package: Optional[dict]

    # Human review
    human_review_decision: str
    human_review_notes: str
    revision_count: int

    # Error accumulator (reducer: append across parallel nodes)
    errors: Annotated[list[str], operator.add]
