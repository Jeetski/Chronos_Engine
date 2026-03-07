#!/usr/bin/env python3
"""Validate docs drift for CLI commands, dashboard endpoints, and markdown links."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
COMMANDS_DIR = ROOT / "commands"
SERVER_FILE = ROOT / "utilities" / "Dashboard" / "server.py"
CLI_DOC = ROOT / "docs" / "reference" / "cli_commands.md"
API_DOC = ROOT / "docs" / "reference" / "dashboard_api.md"
DOCS_DIR = ROOT / "docs"


def slugify_heading(text: str) -> str:
    text = text.strip().lower()
    text = text.replace("`", "")
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text


def extract_markdown_headings(md_path: Path) -> set[str]:
    headings: set[str] = set()
    for line in md_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*$", line)
        if not m:
            continue
        raw = re.sub(r"\s+#*$", "", m.group(1).strip())
        slug = slugify_heading(raw)
        if slug:
            headings.add(slug)
    return headings


def extract_cli_commands_from_code() -> set[str]:
    commands = set()
    for path in COMMANDS_DIR.glob("*.py"):
        name = path.stem
        if name.startswith("_") or name == "__init__":
            continue
        commands.add(name.lower())
    return commands


def extract_cli_commands_from_docs() -> set[str]:
    text = CLI_DOC.read_text(encoding="utf-8")
    return {m.group(1).strip().lower() for m in re.finditer(r"^###\s+`([^`]+)`\s*$", text, flags=re.M)}


def extract_api_endpoints_from_server() -> set[str]:
    text = SERVER_FILE.read_text(encoding="utf-8")
    endpoints = set()
    for m in re.finditer(r'parsed\.path\s*==\s*"([^"]+)"', text):
        endpoints.add(m.group(1))
    for m in re.finditer(r'parsed\.path\.startswith\("([^"]+)"\)', text):
        endpoints.add(m.group(1))
    filtered = {
        ep
        for ep in endpoints
        if ep == "/health" or ep.startswith("/api/") or ep.startswith("/media/")
    }
    return filtered


def extract_api_endpoints_from_docs() -> set[str]:
    text = API_DOC.read_text(encoding="utf-8")
    return {m.group(1).strip() for m in re.finditer(r"-\s+`(/[^`]+)`", text)}


def doc_pattern_covers_endpoint(doc_pattern: str, endpoint: str) -> bool:
    if "*" in doc_pattern:
        prefix = doc_pattern.split("*", 1)[0]
        return endpoint.startswith(prefix)
    return doc_pattern == endpoint


def endpoint_is_documented(endpoint: str, doc_patterns: Iterable[str]) -> bool:
    return any(doc_pattern_covers_endpoint(p, endpoint) for p in doc_patterns)


def endpoint_exists_for_doc_pattern(doc_pattern: str, implemented_endpoints: Iterable[str]) -> bool:
    if "*" in doc_pattern:
        prefix = doc_pattern.split("*", 1)[0]
        return any(ep.startswith(prefix) for ep in implemented_endpoints)
    return doc_pattern in set(implemented_endpoints)


def extract_markdown_links(md_text: str) -> list[str]:
    links = []
    for m in re.finditer(r"!?\[[^\]]*\]\(([^)]+)\)", md_text):
        target = m.group(1).strip()
        if not target:
            continue
        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1].strip()
        links.append(target)
    return links


def validate_links() -> list[str]:
    errors: list[str] = []
    heading_cache: dict[Path, set[str]] = {}
    for md_file in DOCS_DIR.rglob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        for raw_target in extract_markdown_links(text):
            target = raw_target.split(None, 1)[0].strip()
            lower = target.lower()
            if lower.startswith(("http://", "https://", "mailto:")):
                continue

            if target.startswith("#"):
                anchor = unquote(target[1:])
                if md_file not in heading_cache:
                    heading_cache[md_file] = extract_markdown_headings(md_file)
                if slugify_heading(anchor) not in heading_cache[md_file]:
                    errors.append(f"{md_file.relative_to(ROOT)}: missing anchor '#{anchor}'")
                continue

            path_part, _, anchor_part = target.partition("#")
            path_part = unquote(path_part.split("?", 1)[0]).strip()
            resolved = (md_file.parent / path_part).resolve()
            if not resolved.exists():
                errors.append(
                    f"{md_file.relative_to(ROOT)}: missing link target '{path_part}' (from '{raw_target}')"
                )
                continue

            if anchor_part and resolved.suffix.lower() == ".md":
                if resolved not in heading_cache:
                    heading_cache[resolved] = extract_markdown_headings(resolved)
                anchor_slug = slugify_heading(unquote(anchor_part))
                if anchor_slug not in heading_cache[resolved]:
                    errors.append(
                        f"{md_file.relative_to(ROOT)}: missing anchor '#{anchor_part}' in {resolved.relative_to(ROOT)}"
                    )
    return errors


def main() -> int:
    errors: list[str] = []

    code_commands = extract_cli_commands_from_code()
    doc_commands = extract_cli_commands_from_docs()
    missing_commands = sorted(code_commands - doc_commands)
    stale_commands = sorted(doc_commands - code_commands)
    if missing_commands:
        errors.append("Commands present in code but missing in docs/reference/cli_commands.md:")
        errors.extend(f"  - {c}" for c in missing_commands)
    if stale_commands:
        errors.append("Commands documented but missing in commands/:")
        errors.extend(f"  - {c}" for c in stale_commands)

    implemented_endpoints = extract_api_endpoints_from_server()
    documented_endpoints = extract_api_endpoints_from_docs()
    missing_endpoints = sorted(
        ep for ep in implemented_endpoints if not endpoint_is_documented(ep, documented_endpoints)
    )
    stale_endpoints = sorted(
        ep for ep in documented_endpoints if not endpoint_exists_for_doc_pattern(ep, implemented_endpoints)
    )
    if missing_endpoints:
        errors.append("Endpoints present in server.py but missing in docs/reference/dashboard_api.md:")
        errors.extend(f"  - {e}" for e in missing_endpoints)
    if stale_endpoints:
        errors.append("Endpoints documented but missing in server.py:")
        errors.extend(f"  - {e}" for e in stale_endpoints)

    link_errors = validate_links()
    if link_errors:
        errors.append("Broken markdown links/anchors in docs/:")
        errors.extend(f"  - {e}" for e in sorted(link_errors))

    if errors:
        print("Docs drift check failed:")
        for line in errors:
            print(line)
        return 1

    print("Docs drift check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


