"""
Style retrieval tool using ChromaDB and sentence-transformers.

Builds a vector store over Niskanen Center published content, then retrieves
the most similar passages for a given content format and topic. This lets the
Style Agent and Content Writer match Niskanen's actual writing patterns rather
than relying on generic style instructions.

Design decision: We use ChromaDB + embeddings for style retrieval rather than
dumping all examples into every prompt. Vector search returns the most relevant
examples for each content format, scales as the corpus grows without increasing
prompt token costs, and demonstrates a RAG pattern. The trade-off is added
dependency complexity (ChromaDB, sentence-transformers).
"""

import os
from pathlib import Path

import chromadb


# Paths
DATA_DIR = Path(__file__).parent.parent / "data"
CORPUS_DIR = DATA_DIR / "niskanen_corpus"
CHROMA_DIR = DATA_DIR / "chroma_db"
COLLECTION_NAME = "niskanen_style"


def get_collection() -> chromadb.Collection:
    """Get or create the ChromaDB collection for Niskanen style examples."""
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return collection


def retrieve_style_examples(
    query: str,
    content_format: str = "",
    n_results: int = 3,
) -> list[str]:
    """
    Retrieve similar Niskanen writing examples from the vector store.

    Args:
        query: Topic or content to find similar examples for.
        content_format: Optional format filter (e.g., "op-ed", "brief", "newsletter").
        n_results: Number of results to return.

    Returns:
        List of text passages from Niskanen's published work.
    """
    collection = get_collection()

    if collection.count() == 0:
        return ["[No corpus indexed yet. Run data/index_corpus.py first.]"]

    # Build the query text combining topic and format for better relevance
    search_query = query
    if content_format:
        search_query = f"{content_format}: {query}"

    # Use where clause to filter by format if metadata was stored
    where_filter = None
    if content_format:
        where_filter = {"format": {"$eq": content_format}}

    try:
        results = collection.query(
            query_texts=[search_query],
            n_results=min(n_results, collection.count()),
            where=where_filter if content_format else None,
        )
    except Exception:
        # Fall back without format filter if metadata field doesn't exist
        results = collection.query(
            query_texts=[search_query],
            n_results=min(n_results, collection.count()),
        )

    if results and results["documents"] and results["documents"][0]:
        return results["documents"][0]

    return ["[No matching style examples found.]"]


def index_corpus() -> int:
    """
    Index all text files in data/niskanen_corpus/ into ChromaDB.

    Chunks each file into ~500-word passages and embeds them using
    ChromaDB's default embedding function (all-MiniLM-L6-v2 via
    sentence-transformers).

    Returns:
        Number of chunks indexed.
    """
    collection = get_collection()

    # Skip if already indexed
    if collection.count() > 0:
        print(f"Corpus already indexed ({collection.count()} chunks). Skipping.")
        return collection.count()

    if not CORPUS_DIR.exists():
        print(f"Corpus directory not found: {CORPUS_DIR}")
        return 0

    documents = []
    metadatas = []
    ids = []

    for filepath in sorted(CORPUS_DIR.glob("*.txt")):
        text = filepath.read_text(encoding="utf-8").strip()
        if not text:
            continue

        # Determine format from filename convention: format_title.txt
        filename = filepath.stem
        fmt = "general"
        if filename.startswith("oped_"):
            fmt = "op-ed"
        elif filename.startswith("brief_"):
            fmt = "brief"
        elif filename.startswith("newsletter_"):
            fmt = "newsletter"
        elif filename.startswith("study_"):
            fmt = "study"

        # Chunk into ~500-word passages with 50-word overlap
        chunks = _chunk_text(text, chunk_size=500, overlap=50)

        for i, chunk in enumerate(chunks):
            doc_id = f"{filename}_chunk_{i}"
            documents.append(chunk)
            metadatas.append({"source": filepath.name, "format": fmt, "chunk_index": i})
            ids.append(doc_id)

    if not documents:
        print("No corpus files found to index.")
        return 0

    # ChromaDB handles embedding via its default embedding function
    # (all-MiniLM-L6-v2 from sentence-transformers)
    batch_size = 100
    for i in range(0, len(documents), batch_size):
        batch_end = min(i + batch_size, len(documents))
        collection.add(
            documents=documents[i:batch_end],
            metadatas=metadatas[i:batch_end],
            ids=ids[i:batch_end],
        )

    print(f"Indexed {len(documents)} chunks from {len(list(CORPUS_DIR.glob('*.txt')))} files.")
    return len(documents)


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping word-based chunks."""
    words = text.split()
    if len(words) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start = end - overlap

    return chunks


if __name__ == "__main__":
    count = index_corpus()
    print(f"Total chunks in collection: {count}")
