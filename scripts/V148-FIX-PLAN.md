# V148 FIX PLAN — FORM ribbon + Create Form Chinese labels

**Ship:** APP_VERSION **1.48** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.47 (PR #95) — Pipe/dims/Finish Form Chinese PASS; MESH PASS

## Scan (remaining UX debt)
| Item | Notes | Pick? |
|------|-------|------:|
| FORM contextual ribbon EN | Box/Cylinder/Pipe/Edit Form/Subdivide… still English source while SKETCH ribbon is Chinese | **YES** |
| SOLID `Create Form` EN | Entry tool still `Create Form` next to 创建草图/拉伸 | **YES** (same pass) |
| FORM tab chip `FORM` | Contextual tab hard-coded English | with fix |
| SYMMETRY/UTILITIES group titles | Missing from ZH_GROUP → show EN in zh UI | with fix |
| Hole dialog Placement/Shape Settings EN | Solid dialog leftovers | later |
| SOLID Derive/Automated Modeling/Emboss EN | CREATE leftovers | later |
| ASSY / DXF / sketch | No fresh FAIL in V14x | no |
| MESH drag-drop | PASS; do not touch | no |

## Bug / debt
After v1.45–1.47 Form **dialog** Chinese, the **FORM workspace ribbon** (and SOLID entry **Create Form**) still show English tool captions in Chinese UI — breaks mouse/icon + Chinese consistency the moment user enters FORM.

## Fix
1. `FORM_PANELS` labels → Chinese source (长方体/圆柱/管道/编辑造型/细分/…); EN via `tLabel` + new `EN_LABEL` rows.
2. SOLID `createform` label → `创建造型`.
3. FORM tab chip: zh `造型` / en `FORM`; ZH_GROUP SYMMETRY/UTILITIES; ZH_TAB FORM.
4. APP_VERSION 1.48 + contract `grok-qa-v1.48-form-ribbon-chinese`.
5. Do **not** regress Pipe/dims (v1.47), plane buttons (v1.46), Box soft-lock (v1.45), MESH DnD (v1.41–1.44).

## Do not
- Regress MESH drag-drop / chooser parity.
- Clobber sketch constraint `对称` → Symmetric (use `造型对称` for FORM Symmetry).
- Regress Shell CLEAN / DXF / component boolean Chinese.
