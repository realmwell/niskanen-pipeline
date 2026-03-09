"""
Index the Niskanen corpus into ChromaDB for style retrieval.

Reads all .txt files from data/niskanen_corpus/, chunks them into
~500-word passages with 50-word overlap, and embeds them using
sentence-transformers (all-MiniLM-L6-v2) into a local ChromaDB instance.

Usage:
    python data/index_corpus.py
"""

import sys
from pathlib import Path

# Add parent to path so we can import from tools/
sys.path.insert(0, str(Path(__file__).parent.parent))

from tools.style_retriever import index_corpus, get_collection


def main():
    print("Indexing Niskanen corpus into ChromaDB...")
    print()

    corpus_dir = Path(__file__).parent / "niskanen_corpus"
    txt_files = sorted(corpus_dir.glob("*.txt"))

    if not txt_files:
        print("No .txt files found in data/niskanen_corpus/")
        print("Run 'python data/collect_corpus.py' first.")
        return

    print(f"Found {len(txt_files)} files:")
    for f in txt_files:
        print(f"  {f.name} ({f.stat().st_size:,} bytes)")
    print()

    # Run the indexer (defined in tools/style_retriever.py)
    index_corpus()

    # Verify
    collection = get_collection()
    count = collection.count()
    print(f"\nChromaDB collection now has {count} chunks.")

    # Test a query
    if count > 0:
        results = collection.query(
            query_texts=["immigration policy economic impact"],
            n_results=3,
        )
        print(f"\nTest query 'immigration policy economic impact':")
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i]
            print(f"  [{i+1}] {meta.get('source_file', 'unknown')} "
                  f"({meta.get('content_format', 'unknown')}): "
                  f"{doc[:100]}...")


if __name__ == "__main__":
    main()
