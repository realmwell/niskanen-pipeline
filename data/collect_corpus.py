"""
Collect writing samples from the Niskanen Center website.

Scrapes op-eds, policy briefs, and blog posts to build a style corpus
for the Style Agent's ChromaDB retriever.

Usage:
    python data/collect_corpus.py
"""

import os
import re
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

CORPUS_DIR = Path(__file__).parent / "niskanen_corpus"
CORPUS_DIR.mkdir(exist_ok=True)

BASE_URL = "https://www.niskanencenter.org"

# Curated URLs covering different content formats and policy domains
ARTICLES = [
    # Op-eds / commentary
    {
        "url": "https://www.niskanencenter.org/the-case-for-carbon-dividends/",
        "filename": "oped_carbon_dividends.txt",
        "format": "op-ed",
    },
    {
        "url": "https://www.niskanencenter.org/the-free-market-case-for-more-immigration/",
        "filename": "oped_immigration_free_market.txt",
        "format": "op-ed",
    },
    {
        "url": "https://www.niskanencenter.org/the-case-for-zoning-reform/",
        "filename": "oped_zoning_reform.txt",
        "format": "op-ed",
    },
    # Policy briefs / research
    {
        "url": "https://www.niskanencenter.org/cost-disease-socialism/",
        "filename": "brief_cost_disease.txt",
        "format": "brief",
    },
    {
        "url": "https://www.niskanencenter.org/the-center-can-hold/",
        "filename": "brief_center_can_hold.txt",
        "format": "brief",
    },
    # Blog / analysis
    {
        "url": "https://www.niskanencenter.org/why-is-housing-so-expensive/",
        "filename": "study_housing_expensive.txt",
        "format": "study",
    },
    {
        "url": "https://www.niskanencenter.org/understanding-the-child-tax-credit/",
        "filename": "brief_child_tax_credit.txt",
        "format": "brief",
    },
    {
        "url": "https://www.niskanencenter.org/what-the-evidence-says-about-immigration/",
        "filename": "study_immigration_evidence.txt",
        "format": "study",
    },
]

# Fallback: search page for articles if specific URLs fail
SEARCH_URLS = [
    f"{BASE_URL}/blog/",
    f"{BASE_URL}/research/",
]


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_page(url: str) -> str | None:
    """Download a page, return HTML or None on failure."""
    try:
        resp = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=30)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"  Failed to fetch {url}: {e}")
        return None


def extract_article_text(html: str) -> str:
    """Extract main article text from Niskanen Center HTML."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove script, style, nav, footer elements
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    # Try common article selectors
    article = (
        soup.find("article")
        or soup.find("div", class_=re.compile(r"entry-content|post-content|article-content"))
        or soup.find("div", class_=re.compile(r"content-area|main-content"))
    )

    if article:
        text = article.get_text(separator="\n", strip=True)
    else:
        # Fallback: get body text
        body = soup.find("body")
        text = body.get_text(separator="\n", strip=True) if body else ""

    # Clean up whitespace
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    text = "\n".join(lines)

    # Remove very short results (likely navigation remnants)
    if len(text) < 200:
        return ""

    return text


def discover_articles_from_listing(listing_url: str, limit: int = 5) -> list[dict]:
    """Try to discover article URLs from a listing page."""
    html = fetch_page(listing_url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    articles = []

    for link in soup.find_all("a", href=True):
        href = link["href"]
        if href.startswith(BASE_URL) and len(href) > len(BASE_URL) + 10:
            # Skip category/tag pages
            if any(x in href for x in ["/category/", "/tag/", "/page/", "/author/"]):
                continue
            title = link.get_text(strip=True)
            if title and len(title) > 10:
                slug = href.rstrip("/").split("/")[-1]
                articles.append({
                    "url": href,
                    "filename": f"blog_{slug[:50]}.txt",
                    "format": "blog",
                })
        if len(articles) >= limit:
            break

    return articles


def main():
    print(f"Collecting Niskanen Center writing samples...")
    print(f"Output directory: {CORPUS_DIR}")
    print()

    collected = 0
    failed = 0

    for article in ARTICLES:
        url = article["url"]
        filename = article["filename"]
        filepath = CORPUS_DIR / filename

        if filepath.exists() and filepath.stat().st_size > 200:
            print(f"  [skip] {filename} (already exists)")
            collected += 1
            continue

        print(f"  Fetching: {url}")
        html = fetch_page(url)

        if html:
            text = extract_article_text(html)
            if text and len(text) > 200:
                # Add metadata header
                header = f"FORMAT: {article['format']}\nSOURCE: {url}\n\n"
                filepath.write_text(header + text, encoding="utf-8")
                word_count = len(text.split())
                print(f"    Saved {filename} ({word_count} words)")
                collected += 1
            else:
                print(f"    Skipped (too short or empty)")
                failed += 1
        else:
            failed += 1

        # Be polite to the server
        time.sleep(1)

    # If we didn't get enough, try listing pages
    if collected < 5:
        print(f"\n  Only got {collected} articles. Trying listing pages...")
        for listing_url in SEARCH_URLS:
            discovered = discover_articles_from_listing(listing_url, limit=5 - collected)
            for article in discovered:
                if collected >= 8:
                    break
                filepath = CORPUS_DIR / article["filename"]
                if filepath.exists():
                    continue

                print(f"  Fetching discovered: {article['url']}")
                html = fetch_page(article["url"])
                if html:
                    text = extract_article_text(html)
                    if text and len(text) > 200:
                        header = f"FORMAT: {article['format']}\nSOURCE: {article['url']}\n\n"
                        filepath.write_text(header + text, encoding="utf-8")
                        word_count = len(text.split())
                        print(f"    Saved {article['filename']} ({word_count} words)")
                        collected += 1
                time.sleep(1)

    print(f"\nDone. Collected {collected} articles, {failed} failed.")
    print(f"Files in {CORPUS_DIR}:")
    for f in sorted(CORPUS_DIR.glob("*.txt")):
        size = f.stat().st_size
        print(f"  {f.name} ({size:,} bytes)")


if __name__ == "__main__":
    main()
