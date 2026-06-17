#!/usr/bin/env python3
"""Research deduplication database — merge, filter, and track search results
across research skills.

Dedup is per-skill: the same URL can be used by different skills (e.g., an
arXiv paper relevant to both academic and industry research). Within a given
skill, duplicates are blocked via URL + title matching.

Subcommands:
  init      Create the SQLite database
  merge     Merge multiple search-result JSON arrays, dedup within batch
  filter    Filter results against DB history (cross-session, per-skill dedup)
  add       Persist results to DB after report generation
  history   Show previously recorded entries
  stats     Database statistics
  clean     Remove entries older than N days

Database: .wflow/data.db
"""

import argparse
import json
import os
import sqlite3
import sys

# ── platform ──────────────────────────────────────────────────────────

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data.db")

SKILL_CHOICES = ["academic", "industry", "practical"]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    url          TEXT    NOT NULL,
    title        TEXT    NOT NULL DEFAULT '',
    skill_type   TEXT    NOT NULL,
    search_query TEXT    DEFAULT '',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(url, skill_type)
);

CREATE INDEX IF NOT EXISTS idx_entries_title ON entries(title);
CREATE INDEX IF NOT EXISTS idx_entries_skill ON entries(skill_type);
"""


# ── helpers ───────────────────────────────────────────────────────────

def _get_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.executescript(CREATE_TABLE_SQL)


def _normalize(s: str) -> str:
    return (s or "").strip().lower()


def _read_json(path: str | None) -> object:
    if path and path != "-":
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return json.load(sys.stdin)


def _write_json(data: object, path: str | None, pretty: bool) -> None:
    indent = 2 if pretty else None
    if path and path != "-":
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
    else:
        print(json.dumps(data, ensure_ascii=False, indent=indent))


def _add_pretty(p: argparse.ArgumentParser) -> None:
    p.add_argument("--pretty", "-p", action="store_true", help="Pretty-print JSON output")


def _add_skill(p: argparse.ArgumentParser, required: bool = True) -> None:
    p.add_argument("--skill", required=required, choices=SKILL_CHOICES, help="Skill type")


def _dedup_key(entry: dict) -> tuple[str, str]:
    """Return (url, normalized_title) as the dedup identity."""
    return (_normalize(entry.get("url", "")), _normalize(entry.get("title", "")))


# ── commands ──────────────────────────────────────────────────────────

def cmd_init(args: argparse.Namespace) -> None:
    conn = _get_db()
    _ensure_table(conn)
    conn.close()
    _write_json({"status": "ok", "db_path": DB_PATH}, None, args.pretty)


def cmd_merge(args: argparse.Namespace) -> None:
    """Merge multiple JSON arrays, within-batch dedup (same URL or title → keep highest score)."""
    if not args.inputs:
        _write_json({"error": "No input files provided"}, None, args.pretty)
        sys.exit(1)

    seen_url: dict[str, dict] = {}
    seen_title: dict[str, dict] = {}
    round_stats: list[dict] = []
    total_raw = 0

    for idx, path in enumerate(args.inputs, 1):
        data = _read_json(path)
        if not isinstance(data, list):
            _write_json({"error": f"File '{path}' is not a JSON array"}, None, args.pretty)
            sys.exit(1)
        total_raw += len(data)
        unique_in_round = 0
        for entry in data:
            url, title = _dedup_key(entry)
            if not url:
                continue
            unique_in_round += 1
            score = entry.get("score") or 0

            # URL match — keep higher score
            existing = seen_url.get(url)
            if existing:
                if score > (existing.get("score") or 0):
                    existing.update(entry)
                    existing["_round"] = idx
                    existing["_search_query"] = args.round_queries[idx - 1] if idx - 1 < len(args.round_queries) else ""
                continue

            # Title match (same article, different URL) — keep higher score
            if title:
                existing = seen_title.get(title)
                if existing:
                    if score > (existing.get("score") or 0):
                        old_url = _normalize(existing.get("url", ""))
                        seen_url.pop(old_url, None)
                        entry["_round"] = idx
                        entry["_search_query"] = args.round_queries[idx - 1] if idx - 1 < len(args.round_queries) else ""
                        seen_url[url] = entry
                        seen_title[title] = entry
                    continue

            entry["_round"] = idx
            entry["_search_query"] = args.round_queries[idx - 1] if idx - 1 < len(args.round_queries) else ""
            seen_url[url] = entry
            if title:
                seen_title[title] = entry

        round_stats.append({"round": idx, "input_count": len(data), "unique_urls": unique_in_round})

    merged = list(seen_url.values())
    dupes = total_raw - len(merged)

    _write_json(
        {
            "total_input": total_raw,
            "within_batch_duplicates_removed": dupes,
            "final_count": len(merged),
            "rounds": round_stats,
            "results": merged,
        },
        args.output,
        args.pretty,
    )


def cmd_filter(args: argparse.Namespace) -> None:
    """Filter results against DB — per-skill cross-session dedup.

    An entry is considered a duplicate if it matches (within the same skill):
      - Same URL, OR
      - Same normalized title
    """
    data = _read_json(args.input)
    if isinstance(data, dict) and "results" in data:
        entries = data["results"]
    elif isinstance(data, list):
        entries = data
    else:
        _write_json({"error": "Input must be a JSON array or object with 'results' key"}, None, args.pretty)
        sys.exit(1)

    conn = _get_db()
    _ensure_table(conn)

    kept: list[dict] = []
    removed: list[dict] = []
    for r in entries:
        url = _normalize(r.get("url", ""))
        title = _normalize(r.get("title", ""))

        if not url:
            continue

        row = conn.execute(
            "SELECT id FROM entries WHERE url=? AND skill_type=?", (url, args.skill)
        ).fetchone()
        if row:
            removed.append({"url": r.get("url", ""), "title": r.get("title", ""), "reason": "url_in_db"})
            continue

        if title:
            row = conn.execute(
                "SELECT id FROM entries WHERE title=? AND skill_type=?", (title, args.skill)
            ).fetchone()
            if row:
                removed.append({"url": r.get("url", ""), "title": r.get("title", ""), "reason": "title_in_db"})
                continue

        kept.append(r)

    conn.close()

    _write_json(
        {
            "total_input": len(entries),
            "db_duplicates_removed": len(removed),
            "new_count": len(kept),
            "removed": removed,
            "results": kept,
        },
        args.output,
        args.pretty,
    )


def cmd_add(args: argparse.Namespace) -> None:
    """Persist results to DB under the given skill."""
    data = _read_json(args.input)
    if isinstance(data, dict) and "results" in data:
        entries = data["results"]
    elif isinstance(data, list):
        entries = data
    else:
        _write_json({"error": "Input must be a JSON array or object with 'results' key"}, None, args.pretty)
        sys.exit(1)

    conn = _get_db()
    _ensure_table(conn)

    added = 0
    skipped = 0
    for r in entries:
        url = _normalize(r.get("url", ""))
        title = _normalize(r.get("title", ""))
        if not url:
            skipped += 1
            continue
        try:
            conn.execute(
                "INSERT OR IGNORE INTO entries (url, title, skill_type, search_query) VALUES (?,?,?,?)",
                (url, title, args.skill, args.query or r.get("_search_query", "")),
            )
            if conn.total_changes > 0:
                added += 1
            else:
                skipped += 1
        except Exception:
            skipped += 1

    conn.commit()
    conn.close()
    _write_json({"status": "ok", "added": added, "skipped": skipped, "skill": args.skill}, None, args.pretty)


def cmd_history(args: argparse.Namespace) -> None:
    conn = _get_db()
    _ensure_table(conn)
    if args.skill:
        rows = conn.execute(
            "SELECT url, title, search_query, skill_type, created_at FROM entries WHERE skill_type=? ORDER BY created_at DESC LIMIT ?",
            (args.skill, args.limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT url, title, search_query, skill_type, created_at FROM entries ORDER BY created_at DESC LIMIT ?",
            (args.limit,),
        ).fetchall()
    conn.close()
    _write_json([dict(r) for r in rows], None, args.pretty)


def cmd_stats(args: argparse.Namespace) -> None:
    conn = _get_db()
    _ensure_table(conn)
    total = conn.execute("SELECT COUNT(*) AS cnt FROM entries").fetchone()["cnt"]
    by_skill = {}
    for row in conn.execute("SELECT skill_type, COUNT(*) AS cnt FROM entries GROUP BY skill_type"):
        by_skill[row["skill_type"]] = row["cnt"]
    conn.close()
    _write_json({"total": total, "by_skill": by_skill}, None, args.pretty)


def cmd_clean(args: argparse.Namespace) -> None:
    conn = _get_db()
    _ensure_table(conn)
    cursor = conn.execute("DELETE FROM entries WHERE created_at < datetime('now', ?)", (f"-{args.days} days",))
    conn.commit()
    removed = cursor.rowcount
    conn.close()
    _write_json({"status": "ok", "removed": removed, "older_than_days": args.days}, None, args.pretty)


# ── cli ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Research deduplication database — per-skill dedup")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="Initialize the database")
    _add_pretty(p)
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("merge", help="Merge multiple JSON arrays with within-batch dedup")
    p.add_argument("inputs", nargs="+", help="Input JSON files or '-' for stdin")
    p.add_argument("--output", "-o", default=None, help="Output file (default: stdout)")
    p.add_argument("--round-queries", "-q", nargs="*", default=[], help="Query strings per round (position-matched)")
    _add_pretty(p)
    p.set_defaults(func=cmd_merge)

    p = sub.add_parser("filter", help="Filter against DB — per-skill cross-session dedup")
    _add_skill(p, required=True)
    p.add_argument("--input", "-i", default=None, help="Input JSON file (default: stdin)")
    p.add_argument("--output", "-o", default=None, help="Output file (default: stdout)")
    _add_pretty(p)
    p.set_defaults(func=cmd_filter)

    p = sub.add_parser("add", help="Persist entries to DB under a skill")
    _add_skill(p, required=True)
    p.add_argument("--input", "-i", default=None, help="Input JSON file (default: stdin)")
    p.add_argument("--query", "-q", default="", help="Associated search query")
    _add_pretty(p)
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("history", help="List recent entries")
    _add_skill(p, required=False)
    p.add_argument("--limit", "-n", type=int, default=50, help="Max entries (default: 50)")
    _add_pretty(p)
    p.set_defaults(func=cmd_history)

    p = sub.add_parser("stats", help="Database statistics")
    _add_pretty(p)
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser("clean", help="Remove old entries")
    p.add_argument("--days", type=int, default=90, help="Remove entries older than N days (default: 90)")
    _add_pretty(p)
    p.set_defaults(func=cmd_clean)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
