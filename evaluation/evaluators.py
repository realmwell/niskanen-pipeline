"""
Custom evaluators for the Niskanen content pipeline.

Four evaluators that measure different quality dimensions of the
generated content package:

1. argument_fidelity - LLM-as-judge: does the content preserve the paper's thesis?
2. fact_grounding_rate - Deterministic: ratio of verified claims used in content
3. tone_calibration - LLM-as-judge: is the congressional one-pager appropriately jargon-free?
4. format_compliance - Deterministic: character/word counts within spec

These evaluators are designed to work with langsmith.evaluate() and return
scores normalized to [0, 1].
"""

import os
import re
from langchain_aws import ChatBedrockConverse


# --- Evaluator 1: Argument Fidelity (LLM-as-judge) ---

FIDELITY_SYSTEM = """You are an editorial fact-checker comparing a tweet against a \
research paper's thesis.

Score how faithfully the tweet captures the paper's central argument:
- 1.0: The tweet accurately represents the thesis without distortion
- 0.7-0.9: Mostly accurate but oversimplifies or omits important nuance
- 0.4-0.6: Partially captures the thesis but introduces misleading framing
- 0.1-0.3: Significantly distorts or misrepresents the thesis
- 0.0: Completely unrelated to the thesis

Return ONLY a JSON object: {"score": <float>, "reasoning": "<brief explanation>"}"""


def argument_fidelity_evaluator(run, example) -> dict:
    """
    LLM-as-judge: score how faithfully the Twitter post preserves the
    paper's central thesis.

    Uses Haiku for cost efficiency in evaluation runs.
    """
    try:
        outputs = run.outputs or {}
        content_package = outputs.get("content_package", {})
        research_summary = outputs.get("research_summary", {})

        tweet = content_package.get("twitter_post", "")
        thesis = research_summary.get("thesis", "")

        if not tweet or not thesis:
            return {"key": "argument_fidelity", "score": 0.0, "comment": "Missing tweet or thesis"}

        llm = ChatBedrockConverse(
            model=os.environ.get("HAIKU_MODEL_ID", "us.anthropic.claude-3-haiku-20240307-v1:0"),
            temperature=0,
            max_tokens=300,
        )

        response = llm.invoke([
            {"role": "system", "content": FIDELITY_SYSTEM},
            {"role": "user", "content": f"THESIS: {thesis}\n\nTWEET: {tweet}"},
        ])

        import json
        result = json.loads(response.content)
        return {
            "key": "argument_fidelity",
            "score": float(result.get("score", 0)),
            "comment": result.get("reasoning", ""),
        }
    except Exception as e:
        return {"key": "argument_fidelity", "score": 0.0, "comment": f"Error: {str(e)}"}


# --- Evaluator 2: Fact Grounding Rate (Deterministic) ---

def fact_grounding_rate_evaluator(run, example) -> dict:
    """
    Deterministic: what fraction of verified claims from the fact-check
    report appear (by keyword overlap) in the content package?

    Measures whether the Content Writer used trustworthy claims rather
    than making things up or relying on unverified data.
    """
    try:
        outputs = run.outputs or {}
        fact_check = outputs.get("fact_check_report", {})
        content_package = outputs.get("content_package", {})

        verified = fact_check.get("verified_claims", [])
        if not verified:
            # No verified claims to check against
            confidence = fact_check.get("overall_confidence_score", 0.0)
            return {
                "key": "fact_grounding_rate",
                "score": confidence,
                "comment": f"No verified claims; using overall confidence {confidence}",
            }

        # Combine all content into one searchable string
        all_content = " ".join(
            str(v) for v in content_package.values() if isinstance(v, str)
        ).lower()

        grounded = 0
        total = len(verified)

        for claim_data in verified:
            claim_text = ""
            if isinstance(claim_data, dict):
                claim_text = claim_data.get("claim", "")
            elif isinstance(claim_data, str):
                claim_text = claim_data

            if not claim_text:
                continue

            # Extract key numbers and terms from the claim
            # Check if significant keywords from the claim appear in content
            keywords = _extract_claim_keywords(claim_text)
            if keywords and any(kw.lower() in all_content for kw in keywords):
                grounded += 1

        score = grounded / total if total > 0 else 0.0
        return {
            "key": "fact_grounding_rate",
            "score": score,
            "comment": f"{grounded}/{total} verified claims reflected in content",
        }
    except Exception as e:
        return {"key": "fact_grounding_rate", "score": 0.0, "comment": f"Error: {str(e)}"}


def _extract_claim_keywords(claim: str) -> list[str]:
    """Extract numbers and significant terms from a claim for matching."""
    keywords = []

    # Extract numbers (percentages, dollar amounts, counts)
    numbers = re.findall(r'\$?[\d,]+\.?\d*%?', claim)
    keywords.extend(numbers)

    # Extract significant multi-word terms (3+ letter words, skip stopwords)
    stopwords = {"the", "and", "for", "that", "this", "with", "from", "are", "was",
                 "has", "had", "have", "been", "were", "not", "but", "they", "more",
                 "than", "can", "will", "its", "per", "also"}
    words = [w.strip(".,;:()[]") for w in claim.split() if len(w) > 3]
    significant = [w for w in words if w.lower() not in stopwords]
    keywords.extend(significant[:5])  # Top 5 significant words

    return keywords


# --- Evaluator 3: Tone Calibration (LLM-as-judge) ---

TONE_SYSTEM = """You are a communications consultant evaluating whether a \
congressional one-pager is appropriate for its audience: congressional staff \
who may not have subject-matter expertise.

Score the one-pager on jargon-freeness and accessibility:
- 1.0: Plain language throughout, no unexplained jargon, clear policy implications
- 0.7-0.9: Mostly accessible but uses 1-2 unexplained technical terms
- 0.4-0.6: Contains notable jargon that would confuse non-expert staff
- 0.1-0.3: Heavily technical, assumes significant domain expertise
- 0.0: Completely inaccessible to non-expert reader

Return ONLY a JSON object: {"score": <float>, "reasoning": "<brief explanation>"}"""


def tone_calibration_evaluator(run, example) -> dict:
    """
    LLM-as-judge: assess whether the congressional one-pager is
    appropriately jargon-free for its target audience.
    """
    try:
        outputs = run.outputs or {}
        content_package = outputs.get("content_package", {})
        one_pager = content_package.get("congressional_one_pager", "")

        if not one_pager:
            return {"key": "tone_calibration", "score": 0.0, "comment": "No one-pager generated"}

        llm = ChatBedrockConverse(
            model=os.environ.get("HAIKU_MODEL_ID", "us.anthropic.claude-3-haiku-20240307-v1:0"),
            temperature=0,
            max_tokens=300,
        )

        response = llm.invoke([
            {"role": "system", "content": TONE_SYSTEM},
            {"role": "user", "content": f"CONGRESSIONAL ONE-PAGER:\n\n{one_pager}"},
        ])

        import json
        result = json.loads(response.content)
        return {
            "key": "tone_calibration",
            "score": float(result.get("score", 0)),
            "comment": result.get("reasoning", ""),
        }
    except Exception as e:
        return {"key": "tone_calibration", "score": 0.0, "comment": f"Error: {str(e)}"}


# --- Evaluator 4: Format Compliance (Deterministic) ---

FORMAT_SPECS = {
    "twitter_post": {"max_chars": 280},
    "linkedin_post": {"min_chars": 400, "max_chars": 600},
    "bluesky_post": {"min_chars": 250, "max_chars": 300},
    "newsletter_paragraph": {"max_words": 165},
    "congressional_one_pager": {
        "min_bullets": 5,
        "max_bullets": 7,
        "requires_bottom_line": True,
    },
}


def format_compliance_evaluator(run, example) -> dict:
    """
    Deterministic: check that each content format meets its spec
    (character limits, word counts, structural requirements).

    Returns a score from 0-1 based on proportion of formats that pass.
    """
    try:
        outputs = run.outputs or {}
        content_package = outputs.get("content_package", {})

        if not content_package:
            return {"key": "format_compliance", "score": 0.0, "comment": "No content package"}

        checks_passed = 0
        checks_total = 0
        details = []

        for key, spec in FORMAT_SPECS.items():
            content = content_package.get(key, "")
            if not content:
                details.append(f"{key}: MISSING")
                checks_total += 1
                continue

            passed = True

            # Character count checks
            if "max_chars" in spec:
                checks_total += 1
                if len(content) <= spec["max_chars"]:
                    checks_passed += 1
                else:
                    passed = False
                    details.append(f"{key}: {len(content)} chars > {spec['max_chars']} max")

            if "min_chars" in spec:
                checks_total += 1
                if len(content) >= spec["min_chars"]:
                    checks_passed += 1
                else:
                    passed = False
                    details.append(f"{key}: {len(content)} chars < {spec['min_chars']} min")

            # Word count checks
            if "max_words" in spec:
                checks_total += 1
                word_count = len(content.split())
                if word_count <= spec["max_words"]:
                    checks_passed += 1
                else:
                    passed = False
                    details.append(f"{key}: {word_count} words > {spec['max_words']} max")

            # Bullet count checks (one-pager)
            if "min_bullets" in spec or "max_bullets" in spec:
                checks_total += 1
                bullet_count = len(re.findall(r'(?m)^[\s]*[-*\u2022\u25CF\d]+[.)]\s', content))
                # Also count lines that look like bullet points
                if bullet_count == 0:
                    bullet_count = len([
                        line for line in content.split("\n")
                        if line.strip() and (line.strip().startswith(("-", "*", "\u2022")) or
                                             re.match(r'^\d+[.)]\s', line.strip()))
                    ])
                min_b = spec.get("min_bullets", 0)
                max_b = spec.get("max_bullets", 100)
                if min_b <= bullet_count <= max_b:
                    checks_passed += 1
                else:
                    passed = False
                    details.append(f"{key}: {bullet_count} bullets (expected {min_b}-{max_b})")

            # Bottom line check
            if spec.get("requires_bottom_line"):
                checks_total += 1
                if "bottom line" in content.lower():
                    checks_passed += 1
                else:
                    passed = False
                    details.append(f"{key}: missing 'Bottom line' section")

            if passed and not details:
                details.append(f"{key}: PASS")

        score = checks_passed / checks_total if checks_total > 0 else 0.0
        comment = "; ".join(details) if details else "All checks passed"

        return {
            "key": "format_compliance",
            "score": score,
            "comment": comment,
        }
    except Exception as e:
        return {"key": "format_compliance", "score": 0.0, "comment": f"Error: {str(e)}"}
