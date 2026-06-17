#!/usr/bin/env python3
"""Fetch arXiv paper metadata and content, with structured summarization output.

Usage:
    python arxiv_paper.py "https://arxiv.org/abs/2401.12345"
    python arxiv_paper.py "2401.12345"
    python arxiv_paper.py --full-text "https://arxiv.org/abs/2401.12345"
    python arxiv_paper.py --summary deep "https://arxiv.org/html/2401.12345v1"
    echo "2401.12345" | python arxiv_paper.py

Input:
    arXiv URL (abs/html/pdf) or raw paper ID

Output:
    Structured JSON with paper metadata, abstract, optional full text,
    and an embedded summarization prompt template for downstream LLM use.
"""

import argparse
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ARXIV_API_URL = "https://export.arxiv.org/api/query"
ARXIV_HEADERS = {
    "User-Agent": "deep-research-arxiv/1.0.0 (research tool)",
}


def _ssl_context() -> ssl.SSLContext:
    """Create SSL context that tolerates enterprise proxy CA certificates."""
    ctx = ssl.create_default_context()
    # Disable strict hostname verification (common enterprise proxy issue)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

# ── 提炼 prompts ───────────────────────────────────────────────────

SUMMARIZE_PROMPT = """Produce a concise, technically accurate summary of the target paper.

Required structure:
1. Problem and motivation (2-3 sentences)
2. Core method or approach (3-5 bullet points)
3. Main results (metrics, datasets, or key evidence)
4. Strengths and limitations
5. Practical takeaway for researchers

Keep the summary factual, avoid speculation, and cite evidence from the paper text."""

DEEP_ANALYSIS_PROMPT = """You are an AI research assistant tasked with analyzing academic papers from arXiv.

<workflow-for-paper-analysis>
<comprehensive-analysis>
  - Executive Summary:
    * Summarize the paper in 2-3 sentences
    * What is the main contribution of the paper?
    * What is the main problem that the paper solves?
    * What is the main methodology used in the paper?
    * What are the main results of the paper?
    * What is the main conclusion of the paper?
</comprehensive-analysis>
<research-context>
  * Research area and specific problem addressed
  * Key prior approaches and their limitations
  * How this paper aims to advance the field
  * How does this paper compare to other papers in the field?
</research-context>
<methodology-analysis>
  * Step-by-step breakdown of the approach
  * Key innovations in the methodology
  * Theoretical foundations and assumptions
  * Technical implementation details
  * Anything the reader should know about the methodology if they wanted to replicate the paper
</methodology-analysis>
<results-analysis>
  * Experimental setup (datasets, benchmarks, metrics)
  * Main experimental results and their significance
  * Statistical validity and robustness of results
  * How results support or challenge the paper's claims
  * Comparison to state-of-the-art approaches
</results-analysis>
<practical-implications>
  * How could this be implemented or applied?
  * Required resources and potential challenges
  * Available code, datasets, or resources
</practical-implications>
<theoretical-implications>
  * How this work advances fundamental understanding
  * New concepts or paradigms introduced
  * Challenges to existing theories or assumptions
  * Open questions raised
</theoretical-implications>
<future-directions>
  * Limitations that future work could address
  * Promising follow-up research questions
  * Potential for integration with other approaches
  * Long-term research agenda this work enables
</future-directions>
<broader-impact>
  * Societal, ethical, or policy implications
  * Environmental or economic considerations
  * Potential real-world applications and timeframe
</broader-impact>
</workflow-for-paper-analysis>
Structure your analysis with clear headings, maintain technical accuracy while being accessible,
and include your critical assessment where appropriate.
Your analysis should be comprehensive but concise. Be sure to critically evaluate the
statistical significance and reproducibility of any reported results."""

COMPARE_PROMPT = """Compare the provided papers with a focus on technical differences and tradeoffs.

Required structure:
1. Shared problem definition and scope
2. Method comparison table (assumptions, architecture, training setup)
3. Results comparison (benchmarks, metrics, and caveats)
4. Strengths, weaknesses, and failure modes
5. Recommendation: when to choose each approach

Use concrete evidence from each paper; call out missing details explicitly."""


# ── arXiv ID 解析 ──────────────────────────────────────────────────

def extract_arxiv_id(raw: str) -> str:
    """Extract arXiv paper ID from URL or raw ID string.

    Supports:
      - https://arxiv.org/abs/2401.12345
      - https://arxiv.org/abs/2401.12345v2
      - https://arxiv.org/html/2401.12345v1
      - https://arxiv.org/pdf/2401.12345.pdf
      - arxiv.org/abs/quant-ph/0412100 (old format)
      - 2401.12345 (raw ID)
      - 2401.12345v2 (raw ID with version)
    """
    raw = raw.strip()

    # URL patterns
    url_match = re.search(
        r"arxiv\.org/(?:abs|html|pdf)/([a-zA-Z0-9.\-/]+?)(?:\.pdf)?(?:v\d+)?$",
        raw,
    )
    if url_match:
        paper_id = url_match.group(1)
        # Strip trailing version suffix for consistency
        paper_id = re.sub(r"v\d+$", "", paper_id)
        return paper_id

    # Raw ID: strip version suffix if present
    paper_id = raw.rstrip("/")
    paper_id = re.sub(r"v\d+$", "", paper_id)

    # Validate looks like an arXiv ID
    if re.match(r"^[\w.\-]+/\d{7}$", paper_id) or re.match(r"^\d{4}\.\d{4,5}$", paper_id):
        return paper_id

    raise ValueError(f"Cannot extract arXiv ID from: {raw}")


# ── arXiv API 调用 ─────────────────────────────────────────────────

def _parse_arxiv_atom(xml_text: str) -> dict:
    """Parse arXiv Atom XML response into a paper metadata dict."""
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "arxiv": "http://arxiv.org/schemas/atom",
    }
    root = ET.fromstring(xml_text)
    entry = root.find("atom:entry", ns)
    if entry is None:
        raise ValueError("Paper not found in arXiv API response")

    def _text(tag: str) -> str:
        el = entry.find(tag, ns)
        return (el.text or "").strip().replace("\n", " ") if el is not None and el.text else ""

    authors = []
    for author in entry.findall("atom:author", ns):
        name = author.find("atom:name", ns)
        if name is not None and name.text:
            authors.append(name.text.strip())

    categories = []
    for cat in entry.findall("arxiv:primary_category", ns):
        if term := cat.get("term"):
            categories.append(term)
    for cat in entry.findall("atom:category", ns):
        if (term := cat.get("term")) and term not in categories:
            categories.append(term)

    id_url = _text("atom:id")
    paper_id = id_url.split("/abs/")[-1] if "/abs/" in id_url else ""

    pdf_url = None
    for link in entry.findall("atom:link", ns):
        if link.get("title") == "pdf":
            pdf_url = link.get("href")
            break
    if not pdf_url:
        pdf_url = f"https://arxiv.org/pdf/{paper_id}"

    return {
        "paper_id": paper_id,
        "title": _text("atom:title"),
        "authors": authors,
        "abstract": _text("atom:summary"),
        "categories": categories,
        "published": _text("atom:published"),
        "pdf_url": pdf_url,
        "html_url": f"https://arxiv.org/html/{paper_id}",
        "abs_url": f"https://arxiv.org/abs/{paper_id}",
    }


def fetch_abstract(paper_id: str) -> dict:
    """Fetch paper metadata and abstract from arXiv API."""
    params = urllib.parse.urlencode({
        "id_list": paper_id,
        "max_results": 1,
    })
    url = f"{ARXIV_API_URL}?{params}"

    req = urllib.request.Request(url, headers=ARXIV_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as resp:
            xml_text = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"arXiv API error {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"arXiv API unreachable: {e.reason}")

    return _parse_arxiv_atom(xml_text)


# ── HTML 正文提取 ──────────────────────────────────────────────────

class ArticleTextExtractor(HTMLParser):
    """Extract readable text from arXiv HTML paper page."""
    SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside"}

    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self._chunks = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth == 0:
            stripped = data.strip()
            if stripped:
                self._chunks.append(stripped)

    def get_text(self) -> str:
        return "\n".join(self._chunks)


def fetch_full_text(paper_id: str) -> str:
    """Fetch full paper content from arXiv HTML endpoint.

    Returns plain text extracted from the HTML paper page.
    Raises RuntimeError if the HTML page is not available.
    """
    url = f"https://arxiv.org/html/{paper_id}"
    req = urllib.request.Request(url, headers=ARXIV_HEADERS)

    try:
        with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTML endpoint returned {resp.status} for {paper_id}")
            html = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTML version not available for {paper_id}: HTTP {e.code}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"arXiv HTML unreachable: {e.reason}")

    parser = ArticleTextExtractor()
    parser.feed(html)
    return parser.get_text()


# ── 输出构建 ───────────────────────────────────────────────────────

def build_output(metadata: dict, full_text: str | None, summary_type: str) -> dict:
    """Build structured output with metadata, content, and prompt."""
    output = {
        "status": "success",
        "paper_id": metadata["paper_id"],
        "title": metadata["title"],
        "authors": metadata["authors"],
        "categories": metadata["categories"],
        "published": metadata["published"],
        "abstract": metadata["abstract"],
        "urls": {
            "abs": metadata["abs_url"],
            "html": metadata["html_url"],
            "pdf": metadata["pdf_url"],
        },
        "content": full_text or metadata["abstract"],
        "content_source": "full_text" if full_text else "abstract",
    }

    if summary_type == "deep":
        output["prompt"] = {
            "type": "deep_paper_analysis",
            "instruction": DEEP_ANALYSIS_PROMPT,
        }
    elif summary_type == "compare":
        output["prompt"] = {
            "type": "compare_papers",
            "instruction": COMPARE_PROMPT,
        }
    elif summary_type == "concise":
        output["prompt"] = {
            "type": "summarize_paper",
            "instruction": SUMMARIZE_PROMPT,
        }

    return output


# ── 主入口 ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fetch arXiv paper metadata and content with summarization prompts",
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="arXiv URL (abs/html/pdf) or raw paper ID (e.g. 2401.12345)",
    )
    parser.add_argument(
        "--full-text", "-f",
        action="store_true",
        help="Fetch full paper content from arXiv HTML endpoint (default: abstract only)",
    )
    parser.add_argument(
        "--summary", "-s",
        choices=["concise", "deep", "compare", "none"],
        default="concise",
        help="Summary prompt type: concise (default), deep (comprehensive analysis), "
             "compare (pairwise comparison), none (no prompt)",
    )
    parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        help="Pretty-print JSON output",
    )
    args = parser.parse_args()

    # Read input from arg or stdin
    paper_input = args.input
    if not paper_input:
        if not sys.stdin.isatty():
            paper_input = sys.stdin.read().strip()
        if not paper_input:
            print(json.dumps({"error": "No arXiv URL or ID provided. Use as argument or pipe via stdin."}))
            sys.exit(1)

    try:
        paper_id = extract_arxiv_id(paper_input)
        print(f"[arxiv] Fetching metadata for {paper_id}...", file=sys.stderr)
        metadata = fetch_abstract(paper_id)
        print(f"[arxiv] Title: {metadata['title'][:80]}...", file=sys.stderr)

        full_text = None
        if args.full_text:
            try:
                print(f"[arxiv] Fetching full text from HTML endpoint...", file=sys.stderr)
                full_text = fetch_full_text(paper_id)
                print(f"[arxiv] Full text: {len(full_text)} chars", file=sys.stderr)
            except RuntimeError as e:
                print(f"[arxiv] Full text unavailable: {e}", file=sys.stderr)
                print(f"[arxiv] Falling back to abstract only", file=sys.stderr)

        output = build_output(metadata, full_text, args.summary if args.summary != "none" else None)

        indent = 2 if args.pretty else None
        print(json.dumps(output, ensure_ascii=False, indent=indent))

    except ValueError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
