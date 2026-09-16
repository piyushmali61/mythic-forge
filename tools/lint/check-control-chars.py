"""Finds (and with --fix, escapes) invisible control characters in source files.

Literal NUL / U+2028 / U+2029 characters break parsers or hide in diffs; source files
must use escape sequences instead. Run: python tools/lint/check-control-chars.py [--fix]
"""
import pathlib
import sys

ROOTS = ["packages", "apps/editor/src", "apps/editor/test", "tools"]
SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".css", ".html", ".json", ".md"}
BACKSLASH = chr(92)


def is_bad(ch: str) -> bool:
    code = ord(ch)
    return (code < 32 and ch not in "\t\r\n") or code in (0x7F, 0x2028, 0x2029)


def main() -> int:
    fix = "--fix" in sys.argv
    problems = 0
    for root in ROOTS:
        base = pathlib.Path(root)
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in SUFFIXES or "node_modules" in path.parts or "dist" in path.parts:
                continue
            text = path.read_text(encoding="utf-8")
            if not any(is_bad(c) for c in text):
                continue
            problems += 1
            if fix:
                fixed = "".join(f"{BACKSLASH}u{ord(c):04x}" if is_bad(c) else c for c in text)
                path.write_text(fixed, encoding="utf-8", newline="")
                print(f"fixed {path}")
            else:
                print(f"control characters in {path}")
    return 1 if problems and not fix else 0


if __name__ == "__main__":
    sys.exit(main())
