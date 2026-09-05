# webcad — CURRENT View / Display / Navigation / Settings Behavior (code inventory)

READ-CODE-ONLY inventory as of 2026-07-11. All anchors are `file:line`. To be diffed against a Fusion 360 view/display/settings spec.
Source of truth files: `src/components/Viewport.tsx` (6715 ln), `src/components/SketchLayer.tsx` (camera/view rigs live here, not Viewport), `src/store.ts` (17298 ln, view/display state), `src/App.tsx` (global keyboard shortcuts), `src/ribbon.ts` (modeling ribbon — NO view/display commands), `src/components/BrowserTree.tsx` (doc settings + named views), `src/components/Ribbon.tsx` (language switch).

Key structural fact: **the ribbon (`ribbon.ts`) contains ZERO view/display/nav commands** — it is 100% modeling tools mirroring Fusion's SOLID/SURFACE/etc tabs. ALL view/display/nav controls live in a bottom-center floating **navbar** (`.vp-navbar`, `Viewport.tsx:6233`), plus the `drei` ViewCube (top-right) and the BrowserTree "文档设置 / 命名视图 / 原点" tree.

---

## Navigation — orbit / pan / zoom

- **OrbitControls** (`@react-three/drei`) is the single nav engine: `Viewport.tsx:3634-3647`. Config: `makeDefault`, `target={[0,20,0]}`, `enableDamping` `dampingFactor={0.08}`, `zoomToCursor`, `zoomSpeed={0.6}`, `minDistance=ZOOM_MIND(2)`, `maxDistance=camMaxDist` (bbox-adaptive, default 30000, `Viewport.tsx:2317/2343`).
- **navTool** state `'orbit'|'pan'|'zoom'|'select'` — store `store.ts:1997`, setter `store.ts:13882`. Default `'orbit'`. LEFT-button meaning is remapped live by navTool: `mouseButtons={{ LEFT: navTool==='pan'?MOUSE.PAN : navTool==='zoom'?MOUSE.DOLLY : MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}` (`Viewport.tsx:3644`). So **MIDDLE and RIGHT are ALWAYS pan** (Fusion default = MIDDLE pan; note webcad also makes RIGHT pan, and has no right-drag orbit).
- `enableRotate={navTool==='orbit'}` (`Viewport.tsx:3643`) — orbit allowed even inside sketch mode (recently unlocked; comment "GM-FP1 #8 草图内亦准 orbit/ViewCube 倾斜睇").
- **Navbar buttons** (`Viewport.tsx:6234-6237`): 🔄 orbit / ✋ pan / 🔍 zoom / ⛶ select(marquee). These set navTool; active button gets `.tb-on`.
- **navTool='select'** = rubber-band marquee multi-select of components (window L→R blue solid / crossing R→L green dashed, Shift=additive), `Viewport.tsx:3254-3346`, marquee div `6232`. Middle/right still pan.
- **Touch**: `touches={{ ONE: mode==='sketch'?TOUCH.PAN:TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}` (`Viewport.tsx:3646`) — 1-finger orbit (pan in sketch to avoid accidental spin), 2-finger pinch zoom+pan.

### Wheel zoom (custom, replaces OrbitControls' native dolly)
- `WheelZoom` component `Viewport.tsx:2346-2404`. Intercepts wheel in **capture phase** with `stopImmediatePropagation()` (`2361`) to kill OrbitControls' too-fast built-in dolly.
- **Cursor-pivot** zoom (Fusion behavior): raycasts scene under cursor; camera AND target converge on the hit point (surface/sketch/ground), falls back to orbit target on miss (`2363-2398`).
- Fixed gentle magnitude-clamped step `ZOOM_STEP=1.08` (`2317`); `unit = clamp(|deltaY|/100, 0.45..1.6)` so free-spin mice can't overshoot (`2376`); **Shift = fine zoom** (0.32× step, `2375`). Direction: deltaY>0 = zoom out. Handles both perspective (dolly distance) and orthographic (camera.zoom, `2378-2388`) — ortho needs custom because native wheel was swallowed.

### Fit view
- `FitView` component `SketchLayer.tsx:2406-2477`. Triggered by `fitNonce` bump. `requestFit(id?)` store `store.ts:9385` (fits all visible parts, or only `fitTargetId` component). `requestFitBBox(min,max)` `store.ts:9387` / `SketchLayer.tsx:2420` fits an arbitrary three-world bbox (used by interference 🔍 rows).
- Framing math: bounding-sphere radius, camera offset `d = r*3.4` at iso-ish `(cx+.7d, cy+.7d, cz+.9d)` (`2467-2469`); ortho frames via `camera.zoom = halfFrame/(r*1.15)` (`2472`).
- Activation: navbar 🏠 (`Viewport.tsx:6238`), Home key (`App.tsx:197`), radial menu "适应窗口" (`Viewport.tsx:3723`), and internally after many feature ops.

### Standard views (front / top / right / iso)
- `ViewRig` component `SketchLayer.tsx:2480-2545`, triggered by `viewNonce`. `view: 'front'|'top'|'right'|'iso'`, `setView` `store.ts:9411`. Positions camera: top=`+d` Y, front=`+d` Z, right=`+d` X, else iso `(.7d,.7d,.9d)` with `d=r*3.2` (`2533-2537`); ortho zoom-fit same formula.
- **No dedicated on-screen front/top/right/iso button row.** Access paths: (1) drei ViewCube faces, (2) BrowserTree "命名视图" leaves 主/前/上/右/等轴测 `BrowserTree.tsx:417-421`, (3) empty-scene radial menu sectors `Viewport.tsx:3742-3746`, (4) the Home屋 button = iso+fit `Viewport.tsx:6183-6187` / `6185`.

### Sketch-mode orbit lock (recently unlocked)
- Sketch mode now allows orbit/ViewCube tilt — `enableRotate` no longer force-off in sketch (`Viewport.tsx:3643` comment). Drawing gestures freeze controls on pointerdown so left-drag drawing is unaffected; auto-ortho subscription keeps orthographic projection.

---

## ViewCube

- **YES — drei `GizmoViewcube` inside `GizmoHelper`**: `Viewport.tsx:3650-3652`. `alignment="top-right"`, `margin={[78,92]}`. Styling: face `#e3e9ef`, text `#33404d`, stroke `#8c99a6`, hover `#cdeafb`.
- Behavior = stock drei: clicking a face/edge/corner snaps the OrbitControls camera to that orientation (animated), preserving target. It is the primary "click faces / corners" widget.
- **"Home" small-house button** rendered separately at fixed `top:172 right:116` (`Viewport.tsx:6182-6187`) beside the cube → `setView('iso'); requestFit()`.
- GAP vs Fusion: drei ViewCube has no right-click context menu (set-as-front, fit-to-view options), no roll arrows, no compass ring. It is orientation-snap only.

---

## Display settings / Visual style

Two dropdown popups in the navbar (`navPop` state): "🖥▾ 显示" and "▦▾ 网格".

- **Shaded / Wireframe** — 显示▾ popup `Viewport.tsx:6243-6244`. `wireframe` bool + `toggleWireframe`. Radio-style (着色 vs 线框). This is the only "visual style" toggle — there is **no separate "shaded+edges vs shaded-no-edges vs wireframe-only" enumerated render style like Fusion**; instead edges are a separate independent toggle.
- **Edge display** — 显示▾ `Viewport.tsx:6245`. `edgeDisplay: 'on'|'off'` store `store.ts:9416`, setter `9417`. Toggles B-rep edge overlay. Applied via `<Edges>` in KernelBody (imported `Viewport.tsx:11`).
- **Render mode (工作/渲染)** — navbar 🌅 `Viewport.tsx:6259`. `renderMode` bool `store.ts:7999`, `toggleRenderMode` `store.ts:8008` → HDRI env reflection + soft shadow + ACES exposure. NOT the same as "visual style"; it is a heavier PBR display mode for publish screenshots.
- **In-canvas path tracer (光追)** — navbar 🔆 `Viewport.tsx:6297`, `rtMode`/`toggleRtMode` `store.ts:8028`, sample slider 16–1024 `6298`. Progressive GI/reflect/refract/caustics; resets on camera move.
- **Ambient occlusion (GTAO)** — navbar 🌑 `Viewport.tsx:6260`, `ssao`/`toggleSsao`, applied by `AOEffect` (three `EffectComposer`+`GTAOPass`, `Viewport.tsx:1691-1710`, mounted `3518` only when `ssao && !cameraOrtho`). **Disabled in ortho** (`disabled={cameraOrtho}`).
- **Material / appearance** — live navbar sliders: metalness + roughness `Viewport.tsx:6268-6269` (`setMatProp`), material-library presets 📚 `6266` (`matLibOpen`), color/material via ribbon "外观" command (`ribbon.ts:79`) and top-ribbon `.tb-mat` preset `<select>` (`Ribbon.tsx:333`). Image/normal/decal texture loaders `Viewport.tsx:6271-6286` (triplanar projection).
- **HDRI / environment** — `hdriPreset` `store.ts:1498/8011`, `setHdriPreset` `8014`; navbar `<select>` + intensity + rotation sliders `Viewport.tsx:6296` (only shown when `renderModeOn`). Preset list `HDRI_PRESETS` from `render/hdriPresets.ts`; env rendered by `HdriEnvironment.tsx`.
- **Ground shadow / reflection** — 显示▾ popup: 接地阴影 `Viewport.tsx:6246` (`groundShadow` `store.ts:13886`, `toggleGroundShadow` `13887`) + opacity slider `6247-6251` (`groundShadowOpacity` 0.05–1, default 0.35, `13888`); 地面反射 `6252` (`groundReflection` `13890`, drei `MeshReflectorMaterial`). Both session-level, not saved.
- **Background** — `bgPreset` `store.ts:1678/9413`, navbar `<select>` `Viewport.tsx:6287-6294`: 无/冷灰/暖棚/蓝图/白扫光/纯色.
- **FOV** — perspective only; navbar slider 12–55° default 28 `Viewport.tsx:6261-6265`, `cameraFov`/`setCameraFov`, wired to camera by `FovRig` (`Viewport.tsx:1678-1687`), hidden when ortho.
- **Section clip display** — see Camera/Section below. Two render paths: clip-plane (hollow cut) via `clippingPlanes` `Viewport.tsx:646/3224-3232`, or `capped` boolean-intersect solid half (`section.capped`, `KernelBody sectionMesh` `3373-3374`, cut-face highlight `CutFaceOverlay` / `742-760`).

---

## Camera — perspective vs orthographic

- **cameraOrtho** bool `store.ts:1489/8000` (default false = perspective). `toggleCameraOrtho` `store.ts:8001` (bumps fitNonce to re-fit + status). `setCameraOrtho(v)` `store.ts:8003` = pure setter, no fit/status (used by auto-ortho).
- Ortho camera is a drei `<OrthographicCamera makeDefault>` conditionally mounted only when `cameraOrtho` (`Viewport.tsx:3348`), `near={-100000} far={200000} zoom={4}`; unmount reverts to Canvas default perspective (`camera={{position:[240,190,270], fov:28, near:.5, far:100000}}` `Viewport.tsx:3343`).
- Navbar 📐 toggle `Viewport.tsx:6256`.
- **Auto-ortho on sketch entry** — `store.ts:17291-17297` zustand subscription (deliberately in store layer, NOT an R3F effect, because Canvas effects can stall on background/headless tabs). On entering sketch it records prior ortho state and forces ortho; on exit it restores. If the user manually toggles 📐 while sketching, that is respected.
- **340ms camera tween** — `CameraRig` `SketchLayer.tsx:213-377`. Module-level tween state `_camTween` (`196`). Policy: the goal orientation is ALWAYS applied instantly (headless/background correctness); the tween is a per-frame `useFrame` eased lerp (`_easeInOut` `200`) from old→goal, `dur:340` (`369`), with a `setTimeout(340+260)` failsafe to restore controls (`372`). Any user pointerdown/wheel cancels the tween (`231-239`). **Only the explicit "Look At" button (skLookAtNonce) animates**; entering sketch / changing plane / changing face = instant re-orient (no tween) to avoid a first-frame yank (`268-269`, `363-364`). Orients camera normal to the active sketch plane; distance follows content span `d=max(1.6*span,120)` (`296-341`).

---

## Grid & snaps

- **Grid** — drei `<Grid>` `Viewport.tsx:3584-3595`, shown when `mode==='sketch'?skGrid:showGrid`. Fixed params: `infiniteGrid`, `cellSize=10`, `sectionSize=100`, cell/section colors, `fadeDistance=2800`. In sketch it re-orients to the sketch plane via `skGridXform` quaternion/position (`3585`). Toggle: 网格▾ popup 显示网格 `Viewport.tsx:6318` (`showGrid`/`toggleGrid`). **Grid cell size is NOT user-configurable** (hardcoded 10/100mm).
- **Grid snap** — sketch points snap to grid via `snapPt` in store (`store.ts:384`); scale set by `setSnapScale`. No exposed "snap increment" numeric field found.
- **Geometry snap** — `geoSnap` bool `store.ts:1238/5049`, module mirror `_geoSnap` `store.ts:299`; **Alt** temporarily disables (`_geoSnapAlt`, `setGeoSnapAlt` `300`, `geoSnapOn()` `301`). Snaps to hole-center/edge/point.
- **Snap types (per-type toggles)** — `snapTypes` (point/midpoint/center/quadrant/intersection/tangent) `store.ts:1240/5051`, `setSnapType` `5052`, persisted to localStorage `webcad-snaptypes`, module mirror `_snapTypes` `310`, weighted-distance priority in `snapInSketch` (`478`). UI in sketch-bar "更多▾".
- **Incremental move** — arrow-key nudge of selected component (`App.tsx:164-177`): ←→=X, ↑↓=Z, step 1mm, Shift=×10. No numeric grid-snap-move field beyond this.

---

## Viewports — multi-view (1/2/3/4)

- **无此功能.** There is exactly one `<Canvas>` (`Viewport.tsx:3335`ish) and one camera/controls set. No quad-view, no split-screen, no viewport count control anywhere in the code (grep for quad/viewports/splitView = none). Single viewport only.

---

## Units & Document settings

- **Unit** — `unit: 'mm'|'cm'|'inch'` `store.ts:1993/13878` (default mm), `setUnit` `store.ts:13879`. UI: a single BrowserTree leaf under "文档设置" that **cycles** mm→cm→inch→mm on click (`BrowserTree.tsx:414`). Display-only: affects on-screen readouts (measure/props/joint limits) via `fmtLen`; **all model data stays in mm and fabrication exports (STL/STEP/DXF) always emit mm** (`store.ts:2346-2348`, `13879`). Inch supports fractional input (`io/units.ts`).
- **Document settings tree section** "文档设置" `BrowserTree.tsx:413-415` currently holds ONLY the unit leaf. Named views section `416-422`, Origin section (XY/XZ/YZ planes + X/Y/Z axes) `423-430`.
- **Bed preset** — `bedPreset` `store.ts:2009/13894`, `setBedPreset` `13895`, `customBed`/`setCustomBed` `13897`. Used by 3D-print bed-arrange ops (`PRINT_BEDS`, `store.ts:8961`), not a general document setting. No UI in the view/nav area.

---

## Preferences / global settings

- **No dedicated application preferences panel.** No theme picker, no defaults panel, no settings modal (grep preferences/theme = none in UI).
- The only global toggles are: **language** zh/EN (ribbon top-right 中/EN buttons `Ribbon.tsx:371-372`, `lang`/`setLang`); File menu New/Clear-All reset (`Ribbon.tsx:263/283`, `reset`). Autosave is automatic (localStorage 800ms + IndexedDB 5s, `store.ts:17273-17286`) — no user-facing setting.
- Persistence: snapTypes → localStorage; project autosave → localStorage+IDB; most display toggles (render/shadow/reflection/ssao/bg) are session-level. A subset (bgPreset/edgeDisplay/renderMode/groundShadow/hdriPreset/unit/bedPreset) IS saved into the project payload (`store.ts:14304-14317`).

---

## GAP SUMMARY (vs typical Fusion view/display/settings)

- **无此功能**: multi-viewport/quad-view; configurable grid spacing; discrete "visual style" enum (shaded / shaded+edges / wireframe as one control — here shaded/wireframe + edges are independent); ViewCube right-click menu / roll arrows / compass; application Preferences dialog (theme, default units, default plane, pan/zoom-reverse, graphics options); per-document precision/tolerance settings.
- **Different from Fusion**: RIGHT mouse = pan (Fusion right-drag has no orbit either, but Fusion default orbit is MIDDLE+Shift; webcad orbit is LEFT). Unit is a click-cycle leaf, not a settings dropdown, and is display-only. Standard views have no persistent on-screen toolbar (rely on ViewCube / tree / radial menu). Wheel zoom is a custom clamped cursor-pivot implementation, not OrbitControls native.
- **Present & solid**: cursor-pivot wheel zoom (Shift=fine), ortho/perspective toggle + auto-ortho in sketch, 340ms eased Look-At tween, drei ViewCube + Home, FitView + Fit-to-bbox, named-view bookmarks (📑 `Viewport.tsx:6322-6337`, `saveViewBookmark`/`applyViewBookmark`), section analysis (axis X/Y/Z + offset slider + solid-cap + flip + live section props, `Viewport.tsx:6123-6137`), rich display cluster (render mode, GTAO, HDRI, ground shadow/reflection, FOV, background, high-res still export, turntable/explode video).
