# webcad — next big-gap implementation plans (multi-agent designed 2026-06-14)

Two top-5 Fusion-parity gaps, each scoped to an **implementable, strictly-additive** plan with exact
anchors + verification. Both are serial monolith work (store.ts / cad.worker.ts) — do NOT parallelize the edits.

---

## GAP #1 — Topological/persistent naming for fillet/chamfer EDGE picks (Plan B)  [feasible: moderate · risk: medium]

**Problem:** edge picks are stored only as a 3D near-point (`Feature.fillet.near/nears`, worker types cad.worker.ts:32-33;
built store.ts:2092-2093). Each rebuild re-resolves by sampling `pointAt(t)` over live `shape.edges` + nearest-edge.
Upstream dim/position changes → near-point lands on a different edge → fillet jumps. `edgeFingerprint.ts`
(edgeGeom/edgeFingerprint/buildEdgeFingerprintMap/remapEdgePick/nearestEdge, EdgeRecord={poly}) already exists but is
imported by NOTHING. Only wiring is new. **Strictly additive: byte-identical when no `edgeFp` present.**

Files: src/worker/cad.worker.ts, src/store.ts, src/cad/edgeFingerprint.ts (read-only consume).

- **STEP 1** — cad.worker.ts:32/33 add optional `edgeFp?: string[]` to fillet+chamfer Feature variants (parallel-indexed to `nears`). Store consumes Feature type from worker; transform-remap (store.ts:10122) already preserves unknown fields via `...f`.
- **STEP 2** — Worker capture on the build that resolves a pick:
  - 2a. Split roundNearPoints/roundNearPoint/chamferAsym into a pure `resolvePickedEdges(shape, pts, chain?) -> {edges, mids}` (returns the actual selected OCCT edges) + the existing finder/apply. Capture point must run AFTER tangent-chain expansion (cad.worker.ts:318-327) and is shared by chamferAsym (348).
  - 2b. For each resolved edge sample its polyline via `e.pointAt(t)` on a **9-pt** fixed grid (denser than the existing 5-pt at 247/311/355 so edgeGeom sagitta/arclength are stable on arcs) → `edgeFingerprint(vertices, poly)`. Use the SAME flat verts meshOf will emit for this shape (call shape.mesh once, reuse m.vertices) so modelBox bbox-normalization matches.
  - 2c. Add `resolvedEdgeFp?: Record<string,string[]>` to MeshData (cad.worker.ts:11), keyed feature.id → fp[]. meshOf (1802) + rebuild (1880,1897) attach it.
- **STEP 3** — Worker select-by-fp when `f.edgeFp?.length`: `currentEdgeRecords(shape)` (9-pt grid) → `buildEdgeFingerprintMap(vertices, records)` once; per edgeFp[i] lookup. HIT → use that edge midpoint as containsPoint target. MISS → fall back to near-point for index i. fp ABSENT → code path literally unchanged (byte-identical). **Conservative:** if fp collides or maps to an edge whose near-point is far → treat as MISS (fall back). Caps worst case at today's behavior.
- **STEP 4** — Store write-back in the SAME success `set((s2)=>...)` block that calls remapFaceColors (store.ts:5630-5639): for each `bound` fillet/chamfer with `nears && !edgeFp && mesh.resolvedEdgeFp?.[id]` → `{...f, edgeFp: ...}`. **ONLY when record===true** (forward edit; mirror the record=false best-effort comment). NEVER write back in gotoStep (4922-4937, partial shapes). edgeFp then rides docSnap/undo/save automatically.

**Correctness:** partial-shape scrub → fp computed vs full-history bbox → miss at earlier index → near-point fallback (never worse); never WRITE during scrub. Symmetric/rotational edges collide (edgeFingerprint.ts:24-28 honest bound) → conservative fp-vs-nearpoint agreement check falls back. This is NOT true topological naming (that needs OCCT BRepTools_History — much larger); it raises the ceiling + never regresses.

**Verify:** (numeric, pure, no kernel) edgeFingerprint stability across unrelated-dim perturbation; map round-trip; fallback parity with bogus fp = byte-identical near-point selection; symmetric-collision conservative fallback; regression: fillet w/o edgeFp → identical mid array pre/post-patch. (live) draw rect→extrude→fillet one edge→change base width→fillet STAYS (today it jumps); tangent-chain rim resize; asymmetric chamfer + height change; timeline scrub back/forward no crash; doc w/o fillet rebuilds bit-identical. Then build+deploy+verify on live site.

**Watch items:** fp polyline must come from `pointAt(t)` (geometry-exact, tolerance-independent), NOT triangulated mesh; bump grid to 9pts for arc sagitta; thread live verts into resolvers (mesh-once-per-rebuild, precedent at 225/1600).

---

## GAP #2 — Nested subassembly (reuse the existing group tree)  [feasible: moderate · risk: medium · several commits]

**Approach:** do NOT add parentId to components — `groups` already nest. Give each GROUP a local frame.

Files: src/store.ts, src/assembly/kinematics.ts, src/components/Viewport.tsx, ComponentGumball.tsx, BrowserTree.tsx, faceMate.ts.

- **Data model:** extend group node (store.ts:680) `{id;name;parentId?}` → `+ origin?:[3]; rot?:[3]` (local frame rel. to parent group / world). Absent = identity = today's flat behavior.
- **Helper:** `groupWorldMatrix(groups, gid)` near _groupSubtree (356): walk parentId chain root→leaf composing T(origin)·Rrot about group origin. Memoize a `groupFK` Map (like computeFK).
- **compWorldMatrix (311):** add optional 3rd arg `groupMat?` and LEFT-multiply: `M = groupMat · fk · T(pos) · Rrot · R`. Backward compatible — callers w/o groupMat unchanged. Only render-loop / export bakers / BOM / interference / gumball need the arg; single-body call sites stay 2-arg.
- **computeFK (kinematics.ts:90):** UNCHANGED (joints stay part-level). Group frame applied OUTSIDE FK: world = groupWorld(groupId) · fkLocal · T(pos)·Rrot·R.
- **Render (Viewport 1660/1737):** `groupFK=useMemo(...)`; `motion = composedMotion(groupFK.get(c.groupId), fk.get(c.id))`. KernelBody applies motion as outer matrix (457) — no KernelBody change.
- **Gumball (ComponentGumball 95/121-122 + worldToPose):** strip group frame before decode: `localTarget = groupWorld(groupId).invert() · Mnew` → worldToPose(localTarget, gc) → writes LOCAL pos/rot. Round-trips exact.
- **moveGroupBy/rotateGroup (4199):** mutate the GROUP's origin/rot instead of per-member pos (the payoff: one transform moves+ROTATES the whole subassembly; rotation is brand new). Must push docSnap (moveGroupBy currently does NOT). duplicateGroup (4165) simplifies (offset root origin, keep member-local poses).
- **Export bakers (~7912-8315):** pass groupFK.get(groupId) as 3rd arg. buildProjectPayload (10207) serializes groups verbatim → origin/rot ride free.
- **Migration:** zero-effort (optional fields default identity; old docs render byte-identical). Add defensive normalize for origin-without-rot.

**FIRST SHIPPABLE SLICE (1 focused commit):** group type origin/rot + groupWorldMatrix + groupFK + compWorldMatrix 3rd arg + render pre-multiply + moveGroupBy/rotateGroup (push docSnap) + gumball strip-frame. DEFER: export bakers, interference, cross-group joint semantics, BrowserTree frame UI, copy-subassembly rewrite.

**Verify:** build clean; load existing 齿轮组/轴承 template pre/post = pixel-identical (identity groups); group 2+ parts → moveGroupBy + rotateGroup rigid about frame, children keep relative pose, gumball child still round-trips; Ctrl+Z restores frame; autosave + shareLink round-trip persists frame; revolute joint inside a self-contained moved group still drives.

**Hazard:** joints store anchor/axis in three-WORLD coords (kinematics.ts:13-14); a group with non-identity frame desyncs a contained joint's anchor. Slice-1 restricts group transforms to self-contained groups (or transforms contained joint anchors) + flags cross-group joints (like duplicateGroup already warns). compWorldMatrix has ~56 call sites — audit each for group-arg yes/no (render/export/interference/gumball=yes; single-body=no). store.ts is the serialized-edit monolith — edit serially.

---

_Source: multi-agent design workflow wjos5o7nc (2026-06-14). See [[webcad-fusion-parity-status]]._
