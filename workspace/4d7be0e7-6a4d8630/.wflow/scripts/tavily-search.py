"""
Standalone Tavily search script for cc-workflow integration.

Usage:
  python scripts/tavily-search.py "search query"
  python scripts/tavily-search.py --stdin   (reads JSON from stdin with "query" field)

Environment:
  TAVILY_API_KEY      — Tavily API key (required)
  SEARXNG_BASE_URL    — Self-hosted SearXNG fallback URL (optional)
  TAVILY_MAX_RESULTS  — Max results per search (default: 5)
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse


def _load_dotenv(path: str) -> None:
    """Parse a .env file and set env vars that aren't already set."""
    if not os.path.isfile(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def _find_and_load_dotenv() -> None:
    """Walk up from the script's real location to find and load .env.local / .env."""
    script_dir = os.path.dirname(os.path.realpath(__file__))
    search_dir = script_dir
    for _ in range(4):
        for name in (".env.local", ".env"):
            _load_dotenv(os.path.join(search_dir, name))
        parent = os.path.dirname(search_dir)
        if parent == search_dir:
            break
        search_dir = parent
    # Also try cwd
    cwd = os.getcwd()
    for name in (".env.local", ".env"):
        _load_dotenv(os.path.join(cwd, name))


_find_and_load_dotenv()

TAVILY_API = "https://api.tavily.com/search"


def search_tavily(query: str, max_results: int = 5) -> list[dict]:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY environment variable is not set")

    body = json.dumps({
        "api_key": api_key,
        "query": query,
        "search_depth": "advanced",
        "max_results": max_results,
    }).encode("utf-8")

    req = urllib.request.Request(
        TAVILY_API,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Tavily API error {e.code}: {e.read().decode('utf-8', errors='replace')}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Tavily API unreachable: {e.reason}")

    results = data.get("results")
    if not results:
        raise RuntimeError("Tavily returned empty results")

    return [
        {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", "")}
        for r in results
    ]


def search_searxng(query: str, max_results: int = 5) -> list[dict]:
    base_url = os.environ.get("SEARXNG_BASE_URL")
    if not base_url:
        raise RuntimeError("SEARXNG_BASE_URL is not set")

    url = f"{base_url}/search?{urllib.parse.urlencode({'q': query, 'format': 'json'})}"
    req = urllib.request.Request(url, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"SearXNG API error {e.code}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"SearXNG API unreachable: {e.reason}")

    results = data.get("results", [])
    if not results:
        raise RuntimeError("SearXNG returned empty results")

    return [
        {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", "")}
        for r in results[:max_results]
    ]


def search(query: str, max_results: int = 5) -> dict:
    try:
        results = search_tavily(query, max_results)
        return {"ok": True, "provider": "tavily", "results": results}
    except Exception as e:
        err_msg = str(e)
        # Fallback to SearXNG
        if os.environ.get("SEARXNG_BASE_URL"):
            try:
                results = search_searxng(query, max_results)
                return {"ok": True, "provider": "searxng", "results": results}
            except Exception as se:
                return {"ok": False, "error": f"Tavily: {err_msg}; SearXNG: {se}"}
        return {"ok": False, "error": err_msg}


def main():
    # Force UTF-8 stdout/stderr to avoid Windows GBK encoding issues in subprocess
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    query = None
    sq_index = None
    max_results = int(os.environ.get("TAVILY_MAX_RESULTS", "5"))

    # Parse CLI arguments
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--stdin":
            pass  # handled below
        elif args[i] == "--sq-index" and i + 1 < len(args):
            sq_index = int(args[i + 1])
            i += 1
        elif not args[i].startswith("--"):
            query = " ".join(args[i:])
            break
        i += 1

    # Read cc-workflow context from stdin
    if "--stdin" in sys.argv:
        raw = sys.stdin.buffer.read()
        if raw.startswith(b'\xef\xbb\xbf'):
            raw = raw[3:]
        ctx = json.loads(raw.decode("utf-8"))
        upstream = ctx.get("upstream", {})
        inputs = ctx.get("inputs", {})

        # If --sq-index is set, pick sub_query from upstream node's sub_queries array
        if sq_index is not None:
            # Case 1: single predecessor — upstream IS the output directly, may have sub_queries at top level
            sub_queries = upstream.get("sub_queries", [])
            # Case 2: multi-predecessor — upstream is {node_id: output}, iterate values
            if not sub_queries:
                for node_output in upstream.values():
                    if isinstance(node_output, dict):
                        sub_queries = node_output.get("sub_queries", [])
                        if sub_queries:
                            break
            if 0 <= sq_index < len(sub_queries):
                sq = sub_queries[sq_index]
                query = sq if isinstance(sq, str) else sq.get("query", "")
        else:
            query = (
                upstream.get("query")
                or upstream.get("sub_query")
                or inputs.get("query")
                or inputs.get("topic")
            )
            if not query and isinstance(upstream, dict):
                for v in upstream.values():
                    if isinstance(v, dict) and (v.get("query") or v.get("sub_query")):
                        query = v.get("query") or v.get("sub_query")
                        break

    if not query:
        print(json.dumps({"ok": False, "error": "No query provided"}))
        sys.exit(1)

    result = search(query, max_results)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
