#!/usr/bin/env python3
"""GitHub project search and report generator.

Subcommands:
  popular   - TopN most-starred projects by topic
  trending  - TopN recently active popular projects by topic
  report    - Detailed metadata + README for a single project
"""

import argparse
import base64
import json
import os
import sys
import time
from datetime import datetime, timedelta
from urllib.parse import quote_plus

# Ensure stdout uses UTF-8 on Windows to avoid GBK encoding errors
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import requests
except ImportError:
    print("Error: 'requests' is required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv is optional; .env file will be skipped

API_BASE = "https://api.github.com"
REQUEST_TIMEOUT = 30


def get_token(args_token):
    """Resolve GitHub Token: --token arg > .env file / GH_TOKEN env var > None."""
    if args_token:
        return args_token
    env_token = os.environ.get("GH_TOKEN")
    if env_token:
        return env_token
    print("Warning: No GitHub Token provided. Using unauthenticated requests (10 req/min limit).", file=sys.stderr)
    return None


def api_get(url, token):
    """Make an authenticated GET request to GitHub API."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)

    # Rate limit check
    remaining = resp.headers.get("X-RateLimit-Remaining")
    if remaining is not None and int(remaining) <= 1:
        reset_ts = int(resp.headers.get("X-RateLimit-Reset", 0))
        wait_sec = max(reset_ts - int(time.time()), 1)
        print(f"Rate limit approaching. Waiting {wait_sec}s...", file=sys.stderr)
        time.sleep(wait_sec)

    if resp.status_code == 403:
        reset_ts = int(resp.headers.get("X-RateLimit-Reset", 0))
        reset_time = datetime.fromtimestamp(reset_ts).isoformat() if reset_ts else "unknown"
        print(f"Error: API rate limit exceeded. Resets at {reset_time}", file=sys.stderr)
        sys.exit(1)

    resp.raise_for_status()
    return resp.json()


def extract_repo_fields(repo):
    """Extract relevant fields from a GitHub repo search result item."""
    return {
        "full_name": repo.get("full_name"),
        "html_url": repo.get("html_url"),
        "description": repo.get("description"),
        "stargazers_count": repo.get("stargazers_count"),
        "forks_count": repo.get("forks_count"),
        "subscribers_count": repo.get("subscribers_count"),
        "open_issues_count": repo.get("open_issues_count"),
        "language": repo.get("language"),
        "license": repo.get("license", {}).get("spdx_id") if repo.get("license") else None,
        "topics": repo.get("topics", []),
        "created_at": repo.get("created_at"),
        "updated_at": repo.get("updated_at"),
        "pushed_at": repo.get("pushed_at"),
        "archived": repo.get("archived", False),
        "default_branch": repo.get("default_branch"),
    }


def cmd_popular(args):
    """Fetch TopN most-starred projects for a topic."""
    query = f"topic:{args.topic}"
    encoded_query = quote_plus(query)
    url = f"{API_BASE}/search/repositories?q={encoded_query}&sort=stars&order=desc&per_page={args.top}"

    data = api_get(url, get_token(args.token))
    items = [extract_repo_fields(repo) for repo in data.get("items", [])]

    result = {
        "topic": args.topic,
        "mode": "popular",
        "total_count": data.get("total_count", 0),
        "items": items,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_trending(args):
    """Fetch TopN recently active popular projects for a topic."""
    since_date = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    query = f"topic:{args.topic} pushed:>{since_date}"
    encoded_query = quote_plus(query)
    url = f"{API_BASE}/search/repositories?q={encoded_query}&sort=stars&order=desc&per_page={args.top}"

    data = api_get(url, get_token(args.token))
    items = [extract_repo_fields(repo) for repo in data.get("items", [])]

    result = {
        "topic": args.topic,
        "mode": "trending",
        "since_date": since_date,
        "total_count": data.get("total_count", 0),
        "items": items,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_report(args):
    """Fetch detailed metadata + README for a single project."""
    token = get_token(args.token)
    repo_name = args.repo

    # Fetch repo metadata
    metadata = api_get(f"{API_BASE}/repos/{repo_name}", token)

    # Handle redirect
    if metadata.get("message") == "Moved Permanently":
        new_url = metadata.get("url", "")
        if new_url:
            metadata = api_get(new_url, token)
        else:
            print(f"Error: Repository {repo_name} has moved but no redirect URL found.", file=sys.stderr)
            sys.exit(1)

    # Fetch README
    readme_content = None
    try:
        readme_data = api_get(f"{API_BASE}/repos/{repo_name}/readme", token)
        readme_content = base64.b64decode(readme_data.get("content", "")).decode("utf-8", errors="replace")
        # Truncate to 64KB
        if len(readme_content) > 65536:
            readme_content = readme_content[:65536] + "\n... (truncated)"
    except Exception:
        readme_content = None

    # Fetch languages
    languages = {}
    try:
        languages = api_get(f"{API_BASE}/repos/{repo_name}/languages", token)
    except Exception:
        pass

    result = {
        "full_name": metadata.get("full_name", repo_name),
        "metadata": {
            "html_url": metadata.get("html_url"),
            "description": metadata.get("description"),
            "stargazers_count": metadata.get("stargazers_count"),
            "forks_count": metadata.get("forks_count"),
            "subscribers_count": metadata.get("subscribers_count"),
            "open_issues_count": metadata.get("open_issues_count"),
            "language": metadata.get("language"),
            "license": metadata.get("license", {}).get("spdx_id") if metadata.get("license") else None,
            "topics": metadata.get("topics", []),
            "created_at": metadata.get("created_at"),
            "updated_at": metadata.get("updated_at"),
            "pushed_at": metadata.get("pushed_at"),
            "archived": metadata.get("archived", False),
            "default_branch": metadata.get("default_branch"),
            "homepage": metadata.get("homepage"),
        },
        "readme": readme_content,
        "languages": languages,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="GitHub project search and report generator")
    parser.add_argument("--token", default=None, help="GitHub personal access token (or set GH_TOKEN env var)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # popular
    p_popular = subparsers.add_parser("popular", help="TopN most-starred projects by topic")
    p_popular.add_argument("--topic", required=True, help="GitHub topic name")
    p_popular.add_argument("--top", type=int, default=10, help="Number of projects (default 10)")
    p_popular.set_defaults(func=cmd_popular)

    # trending
    p_trending = subparsers.add_parser("trending", help="TopN recently active popular projects by topic")
    p_trending.add_argument("--topic", required=True, help="GitHub topic name")
    p_trending.add_argument("--top", type=int, default=10, help="Number of projects (default 10)")
    p_trending.set_defaults(func=cmd_trending)

    # report
    p_report = subparsers.add_parser("report", help="Detailed metadata + README for a project")
    p_report.add_argument("--repo", required=True, help="Repository full name (owner/repo)")
    p_report.set_defaults(func=cmd_report)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
