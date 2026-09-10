# Fusion demonstration car — native WebCAD source

`fusion-demo-car-native.json` contains 28 components, 72 native modeling features, 49 editable sketch sources and 208 sketch constraints/dimensions. All shapes are analytically reconstructed from the Fusion demonstration car. This is not the earlier simplified wheel rig or a STEP import.

Rebuild with the actual application kernel from the repository root:

```
node --experimental-strip-types --import ./tests/register-resolver.mjs examples/build-fusion-demo-car.mjs /absolute/output.json
```

Open that output with File → Open. Double-click a component to edit its features, then double-click a sketch in the browser to edit its geometry and dimensions. Finish Sketch rebuilds its downstream history; Finish Component Edit writes it back into the assembly. Named Views includes front, side and rear car views.

The per-component histories expand Fusion body mirrors into independent editable components. They do not preserve Fusion's global assembly parameter dependency graph. Circle sketches expose diameter and center position dimensions; rectangular sketches expose width/height and horizontal/vertical relationships. Other sketches retain editable lines/arcs and applicable direction constraints. Underconstrained sketches intentionally allow dragging. All dimensions are millimeters.

## Step-by-step lesson and recording

Run `pnpm exec vite --host 127.0.0.1 --port 4174`, then open `http://127.0.0.1:4174/examples/car-tutorial.html?ui-test=1` in a separate browser tab. This isolated lesson starts blank and does not restore or autosave the operator's project. Use Next/Previous to step through 151 stages. Every solid stage invokes the real application worker; sketches are populated from the analytic recipe, not traced by mouse. This is explicitly an automated parameter lesson, not a claim of hand-drawn UI operation. Save JSON at the final stage.

`record-car-tutorial.mjs` captures the actual browser with Playwright and checks sketch camera alignment. Its local browser and output paths describe the recording environment; configure those paths for another computer. The distributed MP4 and video guide can be viewed without installing a browser runtime or building the app.
