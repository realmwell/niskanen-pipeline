"""
Build a LangSmith evaluation dataset from curated Niskanen Center papers.

Each example includes:
- input: PDF URL
- expected domain
- thesis keywords for validation
- notes on why the paper was selected

Usage:
    python evaluation/dataset.py

This creates/updates a LangSmith dataset named "niskanen-pipeline-eval".
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv


# Test papers spanning multiple policy domains.
# Uses web page URLs (not PDFs) for compatibility with the article
# fetching pipeline, which extracts text from HTML pages.
#
# Coverage: healthcare, fiscal_policy, regulation, immigration,
# climate_energy, trade, governance, housing
TEST_PAPERS = [
    {
        "input_path": "https://www.niskanencenter.org/wp-content/uploads/2024/12/care-spectrum-paper.pdf",
        "expected_domain": "healthcare",
        "thesis_keywords": ["immigration", "healthcare", "workforce", "shortage"],
        "selection_notes": "Immigration-healthcare intersection. Tests cross-domain classification.",
    },
    {
        "input_path": "https://www.niskanencenter.org/wp-content/uploads/2024/04/Creating-a-more-dynamic-unemployment-insurance-system.pdf",
        "expected_domain": "fiscal_policy",
        "thesis_keywords": ["unemployment", "insurance", "dynamic", "reform"],
        "selection_notes": "Labor economics / fiscal policy. Tests data-heavy paper handling.",
    },
    {
        "input_path": "https://www.niskanencenter.org/wp-content/uploads/2024/12/Niskanen-State-Capacity-Paper_-Jen-Pahlka-and-Andrew-Greenway-2.pdf",
        "expected_domain": "regulation",
        "thesis_keywords": ["state", "capacity", "government", "implementation"],
        "selection_notes": "Governance/regulation domain. Tests abstract policy concepts.",
    },
    {
        "input_path": "https://www.niskanencenter.org/wp-content/uploads/old_uploads/2017/08/RAC-Act-Economic-and-Fiscal-Analysis.pdf",
        "expected_domain": "immigration",
        "thesis_keywords": ["immigration", "fiscal", "economic", "DACA", "reform"],
        "selection_notes": "Pure immigration/fiscal policy. Older paper tests robustness to date.",
    },
    {
        "input_path": "https://www.niskanencenter.org/wp-content/uploads/2022/10/creating-global-skill-partnership-central-america-using-existing-us-visas.pdf",
        "expected_domain": "immigration",
        "thesis_keywords": ["skill", "partnership", "visa", "Central America", "workforce"],
        "selection_notes": "International workforce policy. Tests niche domain handling.",
    },
    # ---- New papers (web page URLs) ---- #
    {
        "input_path": "https://www.niskanencenter.org/where-u-s-carbon-policy-is-being-decided-in-2026/",
        "expected_domain": "climate_energy",
        "thesis_keywords": ["carbon", "emissions", "climate", "policy", "energy"],
        "selection_notes": "Climate/energy domain. Short opinion-style piece tests concise input handling.",
    },
    {
        "input_path": "https://www.niskanencenter.org/the-green-new-deal-for-public-housing-act-expensive-solutions-for-a-small-part-of-the-climate-problem-2/",
        "expected_domain": "housing",
        "thesis_keywords": ["housing", "green", "climate", "cost", "public"],
        "selection_notes": "Housing/climate intersection. Tests cost-benefit analysis extraction.",
    },
    {
        "input_path": "https://www.niskanencenter.org/trade-not-war-a-new-approach-to-counternarcotics-supply-side-policy/",
        "expected_domain": "trade",
        "thesis_keywords": ["trade", "narcotics", "supply", "policy", "counternarcotics"],
        "selection_notes": "Trade/drug policy crossover. Tests novel policy domain classification.",
    },
    {
        "input_path": "https://www.niskanencenter.org/cost-disease-socialism-how-subsidizing-costs-while-restricting-supply-drives-americas-fiscal-imbalance/",
        "expected_domain": "fiscal_policy",
        "thesis_keywords": ["cost", "subsidy", "supply", "fiscal", "spending"],
        "selection_notes": "Long-form fiscal analysis. Tests handling of extended arguments.",
    },
    {
        "input_path": "https://www.niskanencenter.org/immigration-beyond-the-extremes-a-blueprint-that-actually-works/",
        "expected_domain": "immigration",
        "thesis_keywords": ["immigration", "reform", "blueprint", "bipartisan"],
        "selection_notes": "Comprehensive immigration reform piece. Tests multi-faceted policy extraction.",
    },
]


def build_dataset():
    """Create or update the LangSmith evaluation dataset."""
    load_dotenv()

    langsmith_key = os.environ.get("LANGSMITH_API_KEY", "")
    if not langsmith_key or langsmith_key == "your_key_here":
        print("LangSmith API key not configured. Skipping dataset creation.")
        print("Set LANGSMITH_API_KEY in .env and re-run.")
        print("\nTest papers that would be included:")
        for i, paper in enumerate(TEST_PAPERS, 1):
            print(f"  {i}. [{paper['expected_domain']}] {paper['input_path'].split('/')[-1]}")
            print(f"     {paper['selection_notes']}")
        return

    from langsmith import Client

    client = Client()
    dataset_name = "niskanen-pipeline-eval"

    # Create or get the dataset
    try:
        dataset = client.create_dataset(
            dataset_name=dataset_name,
            description="Evaluation dataset for the Niskanen content pipeline. "
            "Contains policy papers across multiple domains for testing "
            "argument fidelity, fact grounding, tone calibration, and format compliance.",
        )
        print(f"Created dataset: {dataset_name}")
    except Exception:
        # Dataset may already exist
        datasets = list(client.list_datasets(dataset_name=dataset_name))
        if datasets:
            dataset = datasets[0]
            print(f"Using existing dataset: {dataset_name}")
        else:
            raise

    # Add examples
    for paper in TEST_PAPERS:
        try:
            client.create_example(
                inputs={"input_path": paper["input_path"]},
                outputs={
                    "expected_domain": paper["expected_domain"],
                    "thesis_keywords": paper["thesis_keywords"],
                },
                metadata={
                    "selection_notes": paper["selection_notes"],
                },
                dataset_id=dataset.id,
            )
            print(f"  Added: {paper['input_path'].split('/')[-1]}")
        except Exception as e:
            print(f"  Skipped (may already exist): {e}")

    print(f"\nDataset '{dataset_name}' ready with {len(TEST_PAPERS)} examples.")
    print(f"View at: https://smith.langchain.com/")


def get_test_papers() -> list[dict]:
    """Return the test paper definitions (for use without LangSmith)."""
    return TEST_PAPERS


if __name__ == "__main__":
    build_dataset()
