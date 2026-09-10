# Phase33 non-copy Move: bounded native plan (prepared, not executed)

Prepared harness: `phase33-move-native-prepared.mjs`, outside test discovery. No product edits. Run only after Phase32 UI/build is final and Phase33 source owner permits.

24 primary cases: actual gizmo commit or numeric Move prompt, free whole ellipse / signed270 elliptical segment / rectangle, XY/XZ/YZ/ARB. dx70, rotation30°. Metadata and exact geometry must remain native. One moved shape, one Undo step, exact Undo/Redo, extrusion independent area, STEP BRep; XY JSON reload and height5→8. The actual Move pivot must come from store, especially for sampled arcs whose centroid is not the ellipse center.

Before promoting this harness, strengthen it with actual gizmo handle operations (currently only startSkMove and commit are actual, transform fields are supplied), world bounding-box independent transformed extrema, negative rotation, and geometry sample transforms. These are explicit preparation gaps, not verified acceptance.

Additional required transaction tests:
- Construction rectangle translation preserves construction; stays excluded from extrusion next to a separate real closed profile.
- Fix circle or ellipse and incompatible Move: shapes, raw constraints, IDs, reference metadata and both histories unchanged on failure.
- Pending async solver followed by Esc/tool/reference-plane change: no late commit/history insertion.
- External projected geometry copy/move policy explicit; no retained stale projectLink after an independent transform.
- Selected-set references to unselected geometry: enforce existing constraint or reject atomically, never detach silently.
- Constrained local-frame rectangle rotation: transform frame semantics together with geometry or reject before commit; no silent constraint loss.
- Tangent ellipse/earc + line selected together: metadata and relationUpdates adopt atomically; separately moved endpoint cannot leave stale tangent contact.

Source prototype already confirms metadata omissions and commit-before-solve hazard. A construction-line tangent case must not be called full mixed-region validation. Numeric prompt and gizmo must share one transform/transaction implementation to avoid divergent preservation policy.
