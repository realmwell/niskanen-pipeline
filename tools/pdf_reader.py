"""
PDF text extraction tool.

Handles both local file paths and URLs. Downloads remote PDFs with httpx,
then extracts text with pypdf. Returns clean text with normalized whitespace.
"""

import re
from io import BytesIO
from pathlib import Path

import httpx
from pypdf import PdfReader


def extract_pdf_text(path_or_url: str) -> str:
    """
    Extract text from a PDF file path or URL.

    Args:
        path_or_url: Local file path or HTTP(S) URL to a PDF.

    Returns:
        Extracted text with normalized whitespace.

    Raises:
        ValueError: If the file cannot be read or has no extractable text.
    """
    if path_or_url.startswith(("http://", "https://")):
        pdf_bytes = _download_pdf(path_or_url)
        reader = PdfReader(BytesIO(pdf_bytes))
    else:
        local_path = Path(path_or_url)
        if not local_path.exists():
            raise ValueError(f"File not found: {path_or_url}")
        reader = PdfReader(str(local_path))

    pages_text = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text)

    if not pages_text:
        raise ValueError(f"No extractable text found in: {path_or_url}")

    full_text = "\n\n".join(pages_text)
    # Normalize whitespace: collapse runs of spaces, keep paragraph breaks
    full_text = re.sub(r"[ \t]+", " ", full_text)
    full_text = re.sub(r"\n{3,}", "\n\n", full_text)
    return full_text.strip()


def _download_pdf(url: str) -> bytes:
    """Download a PDF from a URL, following redirects."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }
    response = httpx.get(url, headers=headers, follow_redirects=True, timeout=60.0)
    response.raise_for_status()

    content_type = response.headers.get("content-type", "")
    if "pdf" not in content_type and not url.lower().endswith(".pdf"):
        # Some servers don't set content-type correctly, check magic bytes
        if not response.content[:5] == b"%PDF-":
            raise ValueError(
                f"URL does not appear to be a PDF (content-type: {content_type})"
            )

    return response.content
