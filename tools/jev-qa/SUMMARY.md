# SUMMARY — jev-qa hybrid harness

**Location:** `/workspace/webcad/tools/jev-qa/`  
**Date:** 2026-09-19 (Asia/Hong_Kong / HKT)

Import shorthand: `PYTHONPATH=tools` (symlink `tools/jev_qa` → `jev-qa/jev_qa`) so `import jev_qa` works from repo root.

## What it is

Reusable Python package that wires the bakeoff recommendation:

- **Bot fastpath** for exact goal↔icon matches and SC char-map hits (≈0 ms, no tokens).
- **TypeSafe Jev** (`POST /v1/systemone`, `jev-latest`) only when escalated.
- Logs `path` + `latency_ms` on every `decide()`.

## Usage

```bash
cd /workspace/webcad/tools/jev-qa
python3 -m jev_qa.decide --self-check
python3 -m jev_qa.decide --demo
```

From other bots / scripts (ensure this directory is on `PYTHONPATH` or `cd` here):

```python
from jev_qa import decide

r = decide({
    "goal": "Shell",
    "visible_icons": ["Extrude", "Fillet", "Shell"],
})
assert r["path"] == "fastpath" and r["pick"] == "Shell"
```

Pass **visible icon labels + goal**. Optional: `check_sc` / `ui_string` for i18n triage; `force_jev=True` to skip fastpath.

## Self-check

`python3 -m jev_qa.decide --self-check` asserts goal `Shell` among `Extrude/Fillet/Shell` returns `Shell` via **fastpath** and **never** calls the API.

## Auth

Loads `card.TYPESAFE_API_KEY` from box-secrets (never printed). Override with env `TYPESAFE_API_KEY`.

## See also

- Bakeoff: `/tmp/jev-bakeoff/RESULTS.md`
- Bot guide: `README.md` in this folder

## Verified (HKT 2026-09-19)

```text
$ cd /workspace/webcad/tools/jev-qa && python3 -m jev_qa.decide --demo
SELF-CHECK PASS: pick=Shell path=fastpath
[OK] ribbon_shell / ribbon_fillet / ribbon_ambiguous_or_sc
exit 0
```
