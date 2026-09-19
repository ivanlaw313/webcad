#!/usr/bin/env python3
"""Hybrid decide: bot fastpath first, TypeSafe Jev only when needed.

Maximize Jev value for WebCAD QA without slowing obvious ribbon / SC cases.
Never prints the API key.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .sc_map import has_sc_leak, to_tc_label

log = logging.getLogger("jev_qa.decide")

API_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"
SECRETS_CANDIDATES = (
    Path("/home/box/agent-data/box-secrets.json"),
    Path("/home/box/sand-data/box-secrets.json"),
    Path(os.environ.get("BOX_SECRETS", "") or "/nonexistent"),
)


# ---------------------------------------------------------------------------
# Key loading (never log/print the value)
# ---------------------------------------------------------------------------

def load_api_key() -> str:
    env = os.environ.get("TYPESAFE_API_KEY")
    if env:
        return env
    for path in SECRETS_CANDIDATES:
        if not path.is_file():
            continue
        with path.open() as f:
            data = json.load(f)
        key = (data.get("card") or {}).get("TYPESAFE_API_KEY")
        if key:
            return key
    raise RuntimeError(
        "TYPESAFE_API_KEY missing (env or box-secrets.json card.TYPESAFE_API_KEY)"
    )


# ---------------------------------------------------------------------------
# Fastpath
# ---------------------------------------------------------------------------

def _candidates(state: dict[str, Any]) -> list[str]:
    for key in ("candidates", "visible_icons", "options", "icons"):
        val = state.get(key)
        if isinstance(val, list) and val:
            return [str(x) for x in val]
    return []


def _goal_text(state: dict[str, Any]) -> str:
    for key in ("goal", "task", "intent"):
        if state.get(key):
            return str(state[key])
    return str(state.get("query") or "")


def _exact_goal_candidate_match(goal: str, candidates: list[str]) -> str | None:
    """If goal uniquely names one candidate (case-insensitive token/phrase), return it."""
    if not goal or not candidates:
        return None
    g = goal.strip().lower()
    # full-string equality
    hits = [c for c in candidates if c.strip().lower() == g]
    if len(hits) == 1:
        return hits[0]
    # candidate name appears as whole word / token in goal
    token_hits: list[str] = []
    for c in candidates:
        name = c.strip().lower()
        if not name:
            continue
        # word-boundary-ish for ASCII; substring for CJK labels
        if re.search(rf"(?<![a-z0-9_]){re.escape(name)}(?![a-z0-9_])", g, re.I):
            token_hits.append(c)
        elif not name.isascii() and name in goal:
            token_hits.append(c)
    # unique among candidates
    uniq = list(dict.fromkeys(token_hits))
    if len(uniq) == 1:
        return uniq[0]
    return None


def bot_fastpath(state: dict[str, Any]) -> dict[str, Any] | None:
    """Return an immediate decision when SC map / exact goal↔candidate match applies.

    Returns None when the case should escalate to Jev.
    Decision dict keys: pick, path, reason, (optional) confidence, noul, fixed_label.
    """
    if not isinstance(state, dict):
        return None

    kind = (state.get("kind") or state.get("question_kind") or "choice").lower()
    candidates = _candidates(state)
    goal = _goal_text(state)

    # --- SC leak yes/no (noul-style) ---
    ui = state.get("ui_string") or state.get("text") or state.get("broken_label")
    if kind in ("noul", "sc_leak") or state.get("check_sc"):
        text = str(ui if ui is not None else "")
        if text:
            return {
                "pick": "yes" if has_sc_leak(text) else "no",
                "path": "fastpath",
                "reason": "sc_char_map",
                "noul": 1.0 if has_sc_leak(text) else 0.0,
                "confidence": 1.0,
            }

    # --- SC→TC label fix when preferred/fix requested ---
    if kind in ("fix_label", "sc_fix") or state.get("fix_sc_label"):
        text = str(ui or state.get("broken_label") or "")
        if text and has_sc_leak(text):
            fixed = to_tc_label(text)
            # If closed candidates include the fixed form, pick that
            if candidates:
                for c in candidates:
                    if c == fixed or to_tc_label(c) == fixed:
                        return {
                            "pick": c,
                            "path": "fastpath",
                            "reason": "sc_char_map_fix",
                            "fixed_label": fixed,
                            "confidence": 1.0,
                        }
            return {
                "pick": fixed,
                "path": "fastpath",
                "reason": "sc_char_map_fix",
                "fixed_label": fixed,
                "confidence": 1.0,
            }

    # --- Preferred label already in candidates ---
    preferred = state.get("preferred")
    if preferred and preferred in candidates:
        return {
            "pick": preferred,
            "path": "fastpath",
            "reason": "preferred_in_candidates",
            "confidence": 1.0,
        }

    # --- Exact / unique goal↔candidate match (ribbon next-click) ---
    if candidates and goal:
        hit = _exact_goal_candidate_match(goal, candidates)
        if hit is not None:
            return {
                "pick": hit,
                "path": "fastpath",
                "reason": "exact_goal_candidate_match",
                "confidence": 1.0,
            }

    return None


# ---------------------------------------------------------------------------
# Jev API
# ---------------------------------------------------------------------------

def jev_decide(
    state: Any,
    questions: dict[str, Any],
    *,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """POST System One; return answers + meta. Never echoes the key."""
    key = api_key or load_api_key()
    body = {
        "model": model,
        "state": state,
        "questions": questions,
    }
    raw = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=raw,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        ms = (time.perf_counter() - t0) * 1000.0
        return {
            "error": True,
            "status": e.code,
            "body": err_body[:2000],
            "latency_ms": ms,
            "path": "jev",
        }
    except Exception as e:  # noqa: BLE001
        ms = (time.perf_counter() - t0) * 1000.0
        return {
            "error": True,
            "status": None,
            "body": f"{type(e).__name__}: {e}",
            "latency_ms": ms,
            "path": "jev",
        }
    ms = (time.perf_counter() - t0) * 1000.0
    return {
        "error": False,
        "payload": payload,
        "answers": payload.get("answers") or {},
        "model": payload.get("model"),
        "usage": payload.get("usage"),
        "latency_ms": ms,
        "path": "jev",
    }


def _default_questions_from_state(state: dict[str, Any]) -> dict[str, Any]:
    """Build a single choice/noul question when caller only passed state."""
    kind = (state.get("kind") or "choice").lower()
    candidates = _candidates(state)
    goal = _goal_text(state) or "select the best next action"
    if kind == "noul" or state.get("check_sc"):
        text = state.get("ui_string") or state.get("text") or ""
        return {
            "q": {
                "type": "noul",
                "instructions": state.get("instructions")
                or "Is this Simplified Chinese leaking into a Traditional Chinese (zh-TW/HK) UI?",
                "criteria": {
                    "true": "Contains Simplified Chinese characters that should be Traditional",
                    "false": "Already Traditional / English / no SC leak",
                },
            }
        }
    criteria = state.get("criteria")
    if not criteria and candidates:
        criteria = {c: f"Select ribbon/tool icon labeled {c}" for c in candidates}
    if not criteria:
        criteria = {"unknown": "No candidates supplied"}
    return {
        "q": {
            "type": "choice",
            "instructions": state.get("instructions")
            or f"Given the user goal, which option should be chosen next? Goal: {goal}",
            "criteria": criteria,
        }
    }


def _pick_from_jev(result: dict[str, Any], state: dict[str, Any]) -> Any:
    if result.get("error"):
        return None
    answers = result.get("answers") or {}
    ans = answers.get("q") or next(iter(answers.values()), {})
    kind = (state.get("kind") or "choice").lower()
    if kind == "noul" or "noul" in ans:
        noul = ans.get("noul")
        if noul is None:
            return None
        return "yes" if float(noul) >= 0.5 else "no"
    return ans.get("choice")


# ---------------------------------------------------------------------------
# Public decide()
# ---------------------------------------------------------------------------

def decide(
    state: dict[str, Any],
    questions: dict[str, Any] | None = None,
    *,
    force_jev: bool = False,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Fastpath else Jev. Logs which path + latency. Returns decision dict."""
    t0 = time.perf_counter()
    if not force_jev:
        fp = bot_fastpath(state)
        if fp is not None:
            ms = (time.perf_counter() - t0) * 1000.0
            out = {**fp, "latency_ms": ms}
            log.info(
                "path=%s reason=%s pick=%s latency_ms=%.3f",
                out["path"],
                out.get("reason"),
                out.get("pick"),
                ms,
            )
            return out

    qs = questions or _default_questions_from_state(state)
    # Strip harness-only keys from state sent to API if present
    api_state = {
        k: v
        for k, v in state.items()
        if k
        not in {
            "kind",
            "question_kind",
            "check_sc",
            "fix_sc_label",
            "preferred",
            "instructions",
            "criteria",
            "bot_hints",
        }
    } or state
    result = jev_decide(api_state, qs, api_key=api_key)
    pick = _pick_from_jev(result, state)
    ms = result.get("latency_ms", (time.perf_counter() - t0) * 1000.0)
    out = {
        "pick": pick,
        "path": "jev",
        "reason": "escalated",
        "latency_ms": ms,
        "confidence": None,
        "error": result.get("error", False),
    }
    if not result.get("error"):
        answers = result.get("answers") or {}
        ans = answers.get("q") or next(iter(answers.values()), {})
        out["confidence"] = ans.get("confidence")
        out["noul"] = ans.get("noul")
        out["model"] = result.get("model")
        out["usage"] = result.get("usage")
        out["probabilities"] = ans.get("probabilities")
    else:
        out["error_status"] = result.get("status")
        out["error_body"] = result.get("body")
    log.info(
        "path=%s pick=%s latency_ms=%.3f error=%s",
        out["path"],
        out.get("pick"),
        ms,
        out.get("error"),
    )
    return out


# ---------------------------------------------------------------------------
# Self-check (no API)
# ---------------------------------------------------------------------------

def self_check() -> bool:
    """Shell goal among Extrude/Fillet/Shell → Shell via fastpath, no API."""
    state = {
        "goal": "Shell",
        "visible_icons": ["Extrude", "Fillet", "Shell"],
        "kind": "choice",
    }
    # Assert fastpath alone; no need to patch — decide() must not escalate.
    fp = bot_fastpath(state)
    if fp is None or fp.get("pick") != "Shell" or fp.get("path") != "fastpath":
        print(f"SELF-CHECK FAIL: bot_fastpath={fp!r}", file=sys.stderr)
        return False

    called = {"jev": False}
    real = globals()["jev_decide"]

    def boom(*_a, **_k):
        called["jev"] = True
        raise AssertionError("jev_decide must not be called on exact Shell match")

    globals()["jev_decide"] = boom
    try:
        out = decide(state)
    finally:
        globals()["jev_decide"] = real

    ok = (
        out.get("pick") == "Shell"
        and out.get("path") == "fastpath"
        and not called["jev"]
        and out.get("reason") == "exact_goal_candidate_match"
    )
    if ok:
        print(
            f"SELF-CHECK PASS: pick={out['pick']} path={out['path']} "
            f"latency_ms={out['latency_ms']:.3f}"
        )
    else:
        print(f"SELF-CHECK FAIL: {out!r} jev_called={called['jev']}", file=sys.stderr)
    return ok


# ---------------------------------------------------------------------------
# Demo CLI
# ---------------------------------------------------------------------------

DEMO_CASES = [
    {
        "name": "ribbon_shell",
        "state": {
            "context": "WebCAD LOCAL ribbon",
            "goal": "Shell (hollow solid)",
            "visible_icons": ["Extrude", "Fillet", "Shell"],
            "kind": "choice",
        },
        "expect_path": "fastpath",
        "expect_pick": "Shell",
    },
    {
        "name": "ribbon_fillet",
        "state": {
            "context": "WebCAD LOCAL ribbon",
            "goal": "Fillet",
            "visible_icons": ["Extrude", "Fillet", "Shell"],
            "kind": "choice",
        },
        "expect_path": "fastpath",
        "expect_pick": "Fillet",
    },
    {
        "name": "ribbon_ambiguous_or_sc",
        "state": {
            "context": "WebCAD LOCAL ribbon / i18n",
            "goal": "pick the preferred release-mouse hint",
            "candidates": ["Release mouse", "放开鼠标", "放開滑鼠"],
            "preferred": "放開滑鼠",
            "kind": "choice",
        },
        "expect_path": "fastpath",
        "expect_pick": "放開滑鼠",
    },
]


def run_demo(*, live_jev: bool = False) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    print("=== jev_qa demo (3 ribbon decisions) ===")
    if not self_check():
        return 1
    all_ok = True
    for case in DEMO_CASES:
        st = dict(case["state"])
        if live_jev and case["name"].startswith("ribbon_ambiguous"):
            # force Jev on a novel phrasing without preferred
            st.pop("preferred", None)
            st["goal"] = "user wants Traditional Chinese release-mouse instruction"
            out = decide(st, force_jev=True)
        else:
            out = decide(st)
        exp_path = case.get("expect_path")
        exp_pick = case.get("expect_pick")
        path_ok = (exp_path is None) or (out.get("path") == exp_path) or live_jev
        pick_ok = (exp_pick is None) or (out.get("pick") == exp_pick) or (
            live_jev and out.get("pick") is not None
        )
        status = "OK" if path_ok and pick_ok and not out.get("error") else "FAIL"
        if status != "OK":
            all_ok = False
        print(
            f"[{status}] {case['name']}: pick={out.get('pick')!r} "
            f"path={out.get('path')} reason={out.get('reason')} "
            f"latency_ms={out.get('latency_ms', 0):.3f}"
        )
    return 0 if all_ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="WebCAD Jev hybrid decide harness")
    parser.add_argument("--demo", action="store_true", help="Run 3 sample ribbon decisions")
    parser.add_argument(
        "--live-jev",
        action="store_true",
        help="With --demo, force one case through live Jev API",
    )
    parser.add_argument("--self-check", action="store_true", help="Fastpath Shell unit check only")
    parser.add_argument(
        "--state-json",
        type=str,
        help="JSON object or path to JSON file for a single decide()",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    if args.self_check:
        return 0 if self_check() else 1
    if args.demo:
        return run_demo(live_jev=args.live_jev)
    if args.state_json:
        raw = args.state_json
        if raw.endswith(".json") and Path(raw).is_file():
            state = json.loads(Path(raw).read_text())
        else:
            state = json.loads(raw)
        out = decide(state)
        # never dump secrets; safe to print decision
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0 if not out.get("error") else 2

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
