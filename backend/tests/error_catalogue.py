"""Every error text the API can send, with sample values in the blanks.

The server answers in English and the frontend renders each wording in
Serbian through `apiError` (frontend/src/lib/i18n.ts), which matches the
texts by pattern. That only works while the two agree, so the texts are
collected from the source here (every `HTTPException` detail and every
`ValueError` a schema raises) and kept in `frontend/src/lib/api-errors.json`:

* `tests/test_error_catalogue.py` fails when the file is out of date;
* the frontend's `i18n.test.ts` fails when a text in it has no Serbian.

After changing a `detail` string: `python -m tests.error_catalogue` (from
`backend/`) rewrites the file, and the frontend test says what to translate.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
CATALOGUE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "api-errors.json"

# Raised for the developer, never shown to a person.
INTERNAL = {"webpush.py", "vapid.py"}


def _sample(expr: ast.expr, spec: ast.JoinedStr | None) -> str:
    """A plausible value for one `{...}` in an f-string, from what it is called."""
    src = ast.unparse(expr).lower()
    if spec is not None and "%H" in ast.unparse(spec):
        return "08:00"
    if "date" in src:
        return "2026-09-10"
    if "plate" in src:
        return "FIRM-001"
    if any(word in src for word in ("seats", "len(", "count", "used", "max_", "min_", "minutes", "limit")):
        return "3"
    if src.endswith(".name") and "existing" in src:
        return "Skoda Octavia"
    return "Ana Petrović"


def _render(node: ast.expr) -> list[str]:
    """The texts an expression can evaluate to: a literal, an f-string, or
    either side of a conditional."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, ast.JoinedStr):
        out = ""
        for part in node.values:
            if isinstance(part, ast.Constant):
                out += str(part.value)
            elif isinstance(part, ast.FormattedValue):
                # `{exc.detail} (...)` re-raises another error with a date on
                # it; the inner texts are collected on their own.
                if ast.unparse(part.value).endswith(".detail"):
                    return []
                spec = part.format_spec if isinstance(part.format_spec, ast.JoinedStr) else None
                out += _sample(part.value, spec)
        return [out]
    if isinstance(node, ast.IfExp):
        return _render(node.body) + _render(node.orelse)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        # "booked by X from 08:00" + (" to 09:00" if ... else "") + " that day"
        lefts, rights = _render(node.left), _render(node.right)
        return [a + b for a in lefts for b in rights]
    return []


def _detail_arg(call: ast.Call) -> ast.expr | None:
    for kw in call.keywords:
        if kw.arg == "detail":
            return kw.value
    return call.args[1] if len(call.args) > 1 else None


def _name(func: ast.expr) -> str:
    return func.id if isinstance(func, ast.Name) else func.attr if isinstance(func, ast.Attribute) else ""


def catalogue() -> list[str]:
    texts: set[str] = set()
    for path in sorted(APP.rglob("*.py")):
        if path.name in INTERNAL:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        # `detail = "..." if ... else "..."` followed by HTTPException(403, detail).
        details: list[ast.expr] = [
            node.value
            for node in ast.walk(tree)
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "detail" for t in node.targets)
        ]
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = _name(node.func)
            if name == "HTTPException":
                arg = _detail_arg(node)
                if isinstance(arg, ast.Name) and arg.id == "detail":
                    for value in details:
                        texts.update(_render(value))
                elif arg is not None:
                    texts.update(_render(arg))
            elif name == "ValueError" and node.args:
                texts.update(_render(node.args[0]))
    return sorted(t for t in texts if t)


def write() -> None:
    CATALOGUE.write_text(json.dumps(catalogue(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write()
    print(f"wrote {CATALOGUE}")
