#!/usr/bin/env python3
"""Web search via Tavily API with optional SearXNG fallback.

Usage:
    python search.py "your search query"
    python search.py --max-results 10 "your query"
    python search.py --depth basic "your query"
    echo "your query" | python search.py

Environment:
    TAVILY_API_KEY      (required) Tavily API key
    SEARXNG_BASE_URL    (optional) Self-hosted SearXNG URL for fallback
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

TAVILY_URL = "https://api.tavily.com/search"


def search_tavily(query: str, max_results: int = 5, depth: str = "advanced") -> list[dict]:
    """Call Tavily Search API. Returns list of {title, url, content, score}."""
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise ValueError("TAVILY_API_KEY environment variable is not set")

    body = json.dumps({
        "api_key": api_key,
        "query": query,
        "search_depth": depth,
        "max_results": max_results,
    }).encode("utf-8")

    req = urllib.request.Request(
        TAVILY_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Tavily API error {e.code}: {error_body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Tavily API unreachable: {e.reason}")

    results = data.get("results")
    if not results:
        raise RuntimeError("Tavily returned empty results")

    return [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
            "score": r.get("score"),
        }
        for r in results
    ]


def search_searxng(query: str) -> list[dict]:
    """Call SearXNG API as fallback. Returns list of {title, url, content}."""
    base_url = os.environ.get("SEARXNG_BASE_URL")
    if not base_url:
        raise ValueError("SEARXNG_BASE_URL is not set")

    url = f"{base_url.rstrip('/')}/search?{urllib.parse.urlencode({'q': query, 'format': 'json'})}"

    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"SearXNG API error {e.code}: {error_body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"SearXNG API unreachable: {e.reason}")

    results = data.get("results")
    if not results:
        raise RuntimeError("SearXNG returned empty results")

    return [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
            "score": r.get("score"),
        }
        for r in results
    ]


def search(query: str, max_results: int = 5, depth: str = "advanced") -> list[dict]:
    """Main search: Tavily first, SearXNG fallback if configured."""
    try:
        results = search_tavily(query, max_results=max_results, depth=depth)
        print(f"[web_search] Tavily: {len(results)} results for '{query[:60]}'", file=sys.stderr)
        return results
    except Exception as e:
        print(f"[web_search] Tavily failed: {e}", file=sys.stderr)
        if os.environ.get("SEARXNG_BASE_URL"):
            print("[web_search] Falling back to SearXNG...", file=sys.stderr)
            results = search_searxng(query)
            print(f"[web_search] SearXNG: {len(results)} results", file=sys.stderr)
            return results
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Web search via Tavily API (SearXNG fallback)",
    )
    parser.add_argument(
        "query",
        nargs="?",
        help="Search query (or pipe via stdin)",
    )
    parser.add_argument(
        "--max-results", "-n",
        type=int,
        default=5,
        help="Maximum number of results (default: 5)",
    )
    parser.add_argument(
        "--depth", "-d",
        choices=["basic", "advanced"],
        default="advanced",
        help="Search depth: basic (fast) or advanced (thorough) (default: advanced)",
    )
    parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        help="Pretty-print JSON output",
    )
    args = parser.parse_args()

    # Read query from arg or stdin
    query = args.query
    if not query:
        if not sys.stdin.isatty():
            query = sys.stdin.read().strip()
        if not query:
            print(json.dumps({"error": "No query provided. Use as argument or pipe via stdin."}))
            sys.exit(1)

    try:
        results = search(query, max_results=args.max_results, depth=args.depth)
        indent = 2 if args.pretty else None
        print(json.dumps(results, ensure_ascii=False, indent=indent))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
