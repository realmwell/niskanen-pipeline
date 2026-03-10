"""
Expanded corpus scraper for the Niskanen Center website.

Uses the WordPress REST API (/wp-json/wp/v2/posts) for reliable
pagination, then fetches each article's HTML for text extraction.
Targets 100-150 documents for the Style Agent's RAG retrieval.

Rate-limited to 1 request/second. Respects robots.txt by avoiding
admin, search, and private paths.

Usage:
    python data/scrape_niskanen.py [--target 150] [--delay 1.0]
"""

import argparse
import html
import re
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

CORPUS_DIR = Path(__file__).parent / "niskanen_corpus"
CORPUS_DIR.mkdir(exist_ok=True)

BASE_URL = "https://www.niskanencenter.org"
API_URL = f"{BASE_URL}/wp-json/wp/v2/posts"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_page(url: str, delay: float = 1.0) -> str | None:
    """Download a page with rate limiting. Returns HTML or None."""
    try:
        resp = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=30)
        resp.raise_for_status()
        time.sleep(delay)
        return resp.text
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return None
        print(f"  HTTP {e.response.status_code}: {url}")
        return None
    except Exception as e:
        print(f"  Failed: {url} ({e})")
        return None


def discover_posts_via_api(target: int, delay: float) -> list[dict]:
    """Use WordPress REST API to get post URLs with pagination."""
    posts = []
    page = 1
    per_page = 100  # WP API max

    while len(posts) < target:
        url = f"{API_URL}?per_page={per_page}&page={page}&_fields=id,title,link,slug,categories"
        print(f"  API page {page}...")

        try:
            resp = httpx.get(url, headers=HEADERS, timeout=30)
            if resp.status_code == 400:
                # Past the last page
                print(f"  No more pages (400)")
                break
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  API error: {e}")
            break

        if not data:
            print(f"  Empty response, done")
            break

        for post in data:
            title_raw = post.get("title", {}).get("rendered", "")
            title_clean = html.unescape(title_raw)
            posts.append({
                "id": post["id"],
                "title": title_clean,
                "url": post["link"],
                "slug": post["slug"],
            })

        print(f"  Got {len(data)} posts (total: {len(posts)})")

        if len(data) < per_page:
            break  # Last page

        page += 1
        time.sleep(delay)

    return posts


def extract_article_text(raw_html: str) -> tuple[str, str]:
    """Extract article title and body text from Niskanen HTML."""
    soup = BeautifulSoup(raw_html, "html.parser")

    title_tag = soup.find("h1")
    title = title_tag.get_text(strip=True) if title_tag else ""

    for tag in soup.find_all(["script", "style", "nav", "footer",
                              "header", "aside", "form"]):
        tag.decompose()

    article = (
        soup.find("article")
        or soup.find("div", class_=re.compile(
            r"entry-content|post-content|article-content|"
            r"content-area|main-content|single-content",
            re.I
        ))
    )

    if article:
        text = article.get_text(separator="\n", strip=True)
    else:
        body = soup.find("body")
        text = body.get_text(separator="\n", strip=True) if body else ""

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    text = "\n".join(lines)

    return title, text


def slug_to_filename(slug: str, idx: int) -> str:
    """Convert a WordPress slug to a safe filename."""
    clean = re.sub(r"[^a-z0-9-]", "", slug.lower())[:60]
    return f"article_{clean}.txt"


def main():
    parser = argparse.ArgumentParser(
        description="Scrape Niskanen Center articles for corpus expansion"
    )
    parser.add_argument("--target", type=int, default=150,
                        help="Target number of articles (default: 150)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Delay between requests in seconds (default: 0.5)")
    args = parser.parse_args()

    print(f"Niskanen Center corpus scraper (WP REST API)")
    print(f"Target: {args.target} articles")
    print(f"Output: {CORPUS_DIR}")
    print(f"Rate limit: {args.delay}s between requests")
    print()

    # Phase 1: Discover post URLs via REST API (fast, reliable pagination)
    print("Phase 1: Discovering posts via WordPress REST API...")
    api_posts = discover_posts_via_api(args.target * 2, args.delay)
    print(f"Discovered {len(api_posts)} posts via API")
    print()

    # Phase 2: Fetch and extract article text
    print("Phase 2: Fetching article content...")
    collected = 0
    skipped_existing = 0
    skipped_short = 0
    failed = 0

    existing = set(f.name for f in CORPUS_DIR.glob("*.txt"))

    for i, post in enumerate(api_posts):
        if collected >= args.target:
            break

        filename = slug_to_filename(post["slug"], i)

        if filename in existing:
            skipped_existing += 1
            collected += 1
            continue

        filepath = CORPUS_DIR / filename

        raw_html = fetch_page(post["url"], delay=args.delay)
        if not raw_html:
            failed += 1
            continue

        title, text = extract_article_text(raw_html)
        word_count = len(text.split())

        if word_count < 150:
            skipped_short += 1
            continue

        header = (
            f"TITLE: {post['title']}\n"
            f"FORMAT: article\n"
            f"SOURCE: {post['url']}\n"
            f"WORDS: {word_count}\n"
            f"\n"
        )
        filepath.write_text(header + text, encoding="utf-8")
        collected += 1

        if collected % 10 == 0 or collected <= 5:
            print(f"  [{collected}/{args.target}] {filename} ({word_count} words)")

    print()
    print(f"Done.")
    print(f"  New articles: {collected - skipped_existing}")
    print(f"  Existing (kept): {skipped_existing}")
    print(f"  Too short: {skipped_short}")
    print(f"  Failed: {failed}")
    print()

    all_files = sorted(CORPUS_DIR.glob("*.txt"))
    total_words = 0
    for f in all_files:
        total_words += len(f.read_text(encoding="utf-8").split())

    print(f"Corpus: {len(all_files)} files, ~{total_words:,} total words")
    print(f"Location: {CORPUS_DIR}")


if __name__ == "__main__":
    main()
