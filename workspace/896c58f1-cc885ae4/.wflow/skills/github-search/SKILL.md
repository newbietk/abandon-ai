---
name: github-search
description: "Search GitHub projects by topic and generate a structured analysis report. Use when user types /github-search. Fetches from both popular and trending APIs, deduplicates, then AI generates one combined Markdown report with project details, tech stack, features, and principles."
trigger: /github-search
---

# github-search

Search GitHub projects by topic and generate structured analysis reports.

## Usage

```
/github-search <topic> <topN>
/github-search react 10
```

- `topic`: GitHub topic name (e.g. react, machine-learning, rust)
- `topN`: number of projects per category (default 10 if omitted)

## What You Must Do When Invoked

Follow these steps in order. Do not skip steps.

### Step 1 - Parse arguments

Extract `topic` and `topN` from user input. If only topic is given, default topN to 10.

### Step 2 - Ensure dependencies

Check that `requests` is available:

```bash
python -c "import requests" 2>/dev/null || pip install requests -q
```

### Step 3 - Create output directory

```bash
mkdir -p github-search-out
```

### Step 4 - Run popular search

```bash
python .claude/skills/github-search/scripts/github_search.py popular --topic {topic} --top {topN} > github-search-out/.popular.json
```

Replace `{topic}` and `{topN}` with the actual values.

### Step 5 - Run trending search

```bash
python .claude/skills/github-search/scripts/github_search.py trending --topic {topic} --top {topN} > github-search-out/.trending.json
```

Steps 4 and 5 can run in parallel.

### Step 6 - Deduplicate and collect repos

Read `github-search-out/.popular.json` and `github-search-out/.trending.json`. Collect unique `full_name` values from both. These are the repos that need detailed reports.

### Step 7 - Batch fetch reports

For each unique repo, run:

```bash
python .claude/skills/github-search/scripts/github_search.py report --repo {full_name} > github-search-out/.report-{owner}-{repo}.json
```

Replace `/` with `-` in the filename for `{owner}-{repo}`. Add a 1-second delay between requests to respect rate limits.

### Step 8 - AI Generate report

Read all collected data from the JSON files. Generate **one** combined Markdown file.

**`github-search-out/{topic}.md`** structure:

```markdown
# {Topic} — GitHub Top {N} Projects

> Generated on {date} via GitHub Search API
> Sources: combined results from GitHub's most-starred and recently-active repositories, deduplicated.

## Overview

| # | Project | ⭐ Stars | 🍴 Forks | Language | Description |
|---|---------|----------|----------|----------|-------------|
| 1 | [owner/repo](url) | 245,809 | 51,051 | JavaScript | Short description |

---

## 1. owner/repo

> License: MIT · Created: 2013-05-24 · Last Updated: 2026-06-13 · Open Issues: 1,285 · Default Branch: main

**Tech Stack:** JavaScript 78.2% · TypeScript 14.8% · CSS 7.0%

React is a JavaScript library for building user interfaces, built around three core ideas: declarative rendering, component encapsulation, and write-once-run-anywhere flexibility. Instead of imperatively manipulating the DOM, developers describe what the UI should look like for a given state, and React efficiently updates and re-renders only the components that change. This declarative approach makes code more predictable and easier to debug.

The component model is React's central architectural decision — each component manages its own state and can be composed into complex UIs. Because component logic lives in JavaScript rather than templates, rich data flows naturally through the application while state stays out of the DOM. This design enables a unidirectional data flow that makes state changes traceable and predictable.

React deliberately avoids assumptions about the rest of the technology stack. It can render on the server via Node.js, power mobile applications through React Native, and be adopted incrementally into existing projects — principles that have made it one of the most widely adopted frontend libraries in the world.
```

**Key writing rules for the project narrative:**

1. **Basic info** goes in a compact blockquote line (license, dates, issues, branch) — NOT as a bullet list
2. **Tech stack** is a single inline line with percentages — NOT a vertical list
3. **The body** is 2–4 paragraphs of flowing prose that naturally weaves together:
   - What the project is and what problem it solves
   - Its core features and how they work (from README)
   - Design principles and architectural decisions (from README)
4. **No headers** like "Core Features" or "Principles & Architecture" inside the narrative — the prose flows naturally
5. **No bullet lists** in the body — everything is written as connected paragraphs
6. If `readme` is null, write: "No README available for this project."
7. For **Tech Stack**, calculate language percentages from the `languages` dict (byte counts → percentages)

### Step 9 - Clean up temp files

```bash
rm -f github-search-out/.popular.json github-search-out/.trending.json github-search-out/.report-*.json
```

### Step 10 - Present results

Print a summary to the user:

```
GitHub Search Complete: {topic}

  {dedupCount} projects → github-search-out/{topic}.md
```

Then paste the Overview table from the report into the chat so the user can see the results immediately.
