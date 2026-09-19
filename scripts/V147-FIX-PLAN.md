# V147 FIX PLAN — Form Create Pipe/dims Chinese + Edit Finish/Cancel Chinese

**Ship:** APP_VERSION **1.47** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.46 (PR #93) — Form Cylinder/Sphere/… plane XY/XZ/YZ buttons PASS; MESH PASS

## Scan (remaining UX debt)
| Item | Notes | Pick? |
|------|-------|------:|
| Pipe plane dropdown? | Pipe is path-based — **no plane control** (by design); not a dropdown leftover | no |
| Create Form Pipe EN labels | Path points / Profile / Diameter / Profile Faces / Circle still English | **YES** |
| Create Form dim EN (Cylinder…) | Diameter / Height / Length / Width / Faces / Major Ø / Tube Ø | **YES** (same dialog) |
| Edit Form Finish/Cancel EN | Panel + ribbon pin still `Finish Form` / `Cancel Form` / `Edit Form` while Sketch pin is 完成草图 | **YES** (same Form Chinese pass) |
| Box Length/Width/Height EN | Same Create Form family leftovers | with fix |
| ASSY / DXF / sketch | No fresh FAIL in V14x | no |
| MESH drag-drop | PASS; do not touch | no |

## Bug / debt
After v1.45–1.46 Plane/OK/Cancel Chinese, Create Form **Pipe** and dimension rows, plus Edit Form **Finish/Cancel**, still show English in Chinese UI — breaks mouse/icon + Chinese consistency right after plane pick.

## Fix
1. Pipe create: 路径点 / 轮廓 / 圆 / 直径 / 轮廓面数 + hint「输入路径点后点确定」; keep aria-labels for automation.
2. Non-pipe create dims: 直径/高度/长度/宽度/面数/大径Ø/管径Ø when `lang !== 'en'`.
3. Box draft rows: 长度/宽度/高度 + Faces Chinese; Direction/Symmetry options Chinese.
4. Edit Form: title 编辑造型; ✓ 完成造型 / 取消造型; Ribbon finish pin parity with 完成草图.
5. APP_VERSION 1.47 + contract `grok-qa-v1.47-form-chinese-labels`.
6. Do **not** regress plane buttons (v1.46), Box soft-lock (v1.45), MESH DnD (v1.41–1.44).

## Do not
- Add plane buttons to Pipe (path is 3D; orientFormCage skipped intentionally).
- Regress MESH drag-drop / chooser parity.
- Regress Shell CLEAN / DXF / component boolean Chinese.
