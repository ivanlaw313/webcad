# jev-qa — WebCAD hybrid Jev harness

Maximize TypeSafe Jev for WebCAD QA speed **without** slowing obvious cases.

Design (from `/tmp/jev-bakeoff` RESULTS):

1. **`bot_fastpath(state)`** — SC char map + exact goal↔candidate match → return immediately.
2. **`jev_decide(state, questions)`** — `POST https://api.typesafe.ai/v1/systemone` model `jev-latest`; key from `box-secrets.json` → `card.TYPESAFE_API_KEY` (never printed).
3. **`decide(state)`** — fastpath else Jev; logs path + latency.

## How bots should call it

Pass **visible icon labels** (scraped ribbon `aria-label` / `title` / tooltip) plus the **goal**:

```python
from jev_qa import decide

state = {
    "context": "WebCAD LOCAL ribbon toolbar",
    "goal": "Shell (hollow solid / shell feature)",
    "visible_icons": ["Extrude", "Fillet", "Shell", "Revolve", "Chamfer"],
    "kind": "choice",  # optional; default choice
}
result = decide(state)
# result["pick"]   -> "Shell"
# result["path"]   -> "fastpath" | "jev"
# result["latency_ms"]
# result["confidence"]  # when path=jev
```

### State fields bots should fill

| Field | Required | Meaning |
| --- | --- | --- |
| `goal` | yes (for ribbon) | What the QA step is trying to do |
| `visible_icons` / `candidates` / `options` | yes (for choice) | Closed list of clickable labels |
| `kind` | no | `choice` (default), `noul` / set `check_sc` for SC leak yes/no |
| `ui_string` / `text` | for SC | String to test for Simplified leak |
| `preferred` | no | If present and in candidates → fastpath |
| `fix_sc_label` | no | Apply SC→TC map and return fixed label |
| `instructions` / `criteria` | no | Passed through when escalating to Jev |

### When fastpath fires (no API)

- Goal uniquely names one candidate (case-insensitive token match), e.g. goal `Shell` among `Extrude/Fillet/Shell`.
- `preferred` already in candidates.
- SC char-map detects leak (`check_sc` / `kind=noul`) or fixes a label (`fix_sc_label`).

### When Jev fires

Anything novel / ambiguous / multi-criteria where rules would need constant maintenance. Build questions yourself or let `decide()` synthesize a single `choice`/`noul` from state:

```python
from jev_qa import jev_decide, decide

# Explicit questions (batch several on one state for cost):
questions = {
    "next_icon": {
        "type": "choice",
        "instructions": "Which toolbar icon next?",
        "criteria": {"Extrude": "...", "Fillet": "...", "Shell": "..."},
    },
    "sc_leak": {
        "type": "noul",
        "instructions": "Is this Simplified Chinese leaking into zh-TW?",
    },
}
# Bypass fastpath:
decide(state, questions, force_jev=True)
```

### Canvas / WebGL caveat

Jev (and this harness) decide **UI chrome** (ribbon icons, i18n strings). They do **not** locate WebGL mesh faces. After Shell/Fillet, face picks need vision or CAD kernel hooks.

## CLI

```bash
cd /workspace/webcad/tools/jev-qa
python3 -m jev_qa.decide --self-check   # Shell among Extrude/Fillet/Shell, no API
python3 -m jev_qa.decide --demo         # 3 sample ribbon decisions
python3 -m jev_qa.decide --demo --live-jev   # optional live API on ambiguous case
python3 -m jev_qa.decide --state-json '{"goal":"Fillet","visible_icons":["Extrude","Fillet","Shell"]}'
```

Auth: `TYPESAFE_API_KEY` env, else `/home/box/agent-data/box-secrets.json` (or `sand-data`) `card.TYPESAFE_API_KEY`.

## Layout

```
jev-qa/
  jev_qa/
    __init__.py
    decide.py      # bot_fastpath, jev_decide, decide, CLI
    sc_map.py      # SC markers + SC→TC map
  README.md
  SUMMARY.md
```
