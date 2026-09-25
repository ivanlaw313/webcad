# Aero / hydro design: how to use it

This guide is for Fusion 360 users who do not write code. WebCAD can design a fan, a wing, or a streamlined shell in three layers: rank shapes quickly, compare them in the browser, then confirm the final few with a local flow solver.

Button names below match the on-screen labels. The Aero Design Lab follows the language you picked (this page uses the English labels). The wind-tunnel panel is still labelled in Cantonese; those labels are given with an English gloss.

In the app, press **F1**, or press **/** and search “氣動”, “CFD”, “風洞教學”, or “aero guide”, then choose **Aero / hydro design guide**.

---

## The three layers

They are not three equally accurate calculators. Lower in the list means closer to a real tunnel, and slower.

| | ① Engineering estimate | ② Browser wind tunnel | ③ Local OpenFOAM |
| --- | --- | --- | --- |
| Where | Aero Design Lab, **▶ Run optimisation** | **Accurate (LBM)** on a result row, or **Run** in the wind/water tunnel | **OpenFOAM CFD verification** under the lab results, or **Verify this shape with OpenFOAM** on the tunnel panel |
| How accurate | For **ranking**. Drag and efficiency usually read **about 30% low**. Correct them with the layer-③ factor. This is not CFD. | **Trend-level**. With the same settings, which shape has less drag is trustworthy. Do not treat the absolute drag coefficient Cd as a lab report. | The most accurate of the three. A sphere checks out at Cd **0.490** against a reference of about **0.47** (a few percent). A spinning propeller or fan is **not validated**. |
| How long | The panel shows **milliseconds**. 1200 evaluations usually finish within a few seconds. 300 is faster; 8000 is still seconds. | CPU: resolution around 24 is tens of seconds; 48 can be minutes (large parts slower). GPU: drag the part and watch the flow live, but Cd reads **about 2× high**. | Coarse mesh: minutes, up to about ten (the checked sphere setup is about 10 minutes). Fine mesh or a difficult shape can be tens of minutes. **One job at a time**; the rest queue. |
| When | Sweep many sizes, drop the obvious losers, keep a shortlist. | Which outline is cleaner, which direction has less drag, or you want to see smoke. | The last one or two candidates, or a shape you modelled yourself, when you need a serious Cd or drag force. |

Rule of thumb: the estimate picks the shortlist, the tunnel compares shapes, OpenFOAM is the one you keep.

---

## Open the lab

1. On the top workspace bar, click **🧪 Lab**.
2. In the **Simulation** group, click **Aero Design Lab**.
3. A panel opens on the right. The orange note says the numbers are estimates, not CFD.

Or press **/** , type “aero”, and pick **Aero Design Lab**.

The panel is four steps: ① Design brief, ② Design space, ③ Optimise, ④ Results.

---

## a) A 120 mm quiet fan from the template

The template is already a 120 mm diameter, 2500 rpm, air, static fan. It maximises efficiency and minimises a relative noise index. Thrust must be at least 0.08 N, and the stalled fraction must stay at or below 0.3.

1. In step ① click **🌀 Propeller / fan**. The button highlights and the title becomes “120mm 靜音風扇 / 螺旋槳”.
2. Check step ②. Fixed: diameter 120, speed 2500 rpm, inflow 0, fluid **air**. Variables are min → max pairs (blade count, pitch, chord, twist, camber, thickness). The default ranges are fine.
3. Objectives should be two: efficiency (maximise) and noise index (minimise). Because inflow is 0, “efficiency” here is a fan figure of merit, not the propulsive efficiency of a propeller in forward flight.
4. In step ③ leave **Evaluations** at **1200** (pick 300 if you want it faster). Leave **Seed** at 42. The same seed gives the same run.
5. Click **▶ Run optimisation**. When the bar finishes, the line shows milliseconds. **■ Stop** cancels it.
6. Step ④, the table:
   - **Start design** is the unoptimised row, for comparison.
   - **★** marks designs that are still strong on the trade-off. Two objectives do not have a single winner.
   - A faded row with **⚠** missed a constraint. Do not treat it as the best.
   - Click a row. A ▶ appears, and the detail under the table is the one you picked.
7. Read efficiency and the noise index. Higher efficiency and lower noise is the quiet fan you asked for. The detail line also says how it compares with the start design.

With two objectives you get a Pareto chart (each dot is a feasible design). One objective shows a convergence curve instead.

---

## b) A glider wing from one sentence

You do not fill in the span yourself. The built-in rules are enough. An AI key is optional.

1. Open Aero Design Lab (same as above).
2. Paste this into the text box (it is the example in the placeholder):

   滑翔機翼 1.2m 翼展 最高升阻比

   That sentence means: glider wing, 1.2 m span, maximum lift-to-drag.

3. Click **Build design space (rules)**.
   - If you have already put your own key in the AI assistant ✦ at the bottom right, the button is **✦ AI → design space**. Either is fine. If the AI reply is unusable, the lab falls back to the rules and says so.
4. Step ② becomes a wing with span about **1200 mm** (1.2 m), fluid air. The objective becomes lift-to-drag **L/D, maximise**. The sentence did not ask to minimise weight, so weight is not a second objective.
5. Inflow defaults to **10 m/s** and weight to **0.6 kg**. Both are fixed fields you can edit. Lift is trimmed to that weight.
6. Click **▶ Run optimisation**.
7. The first feasible row with ★ is normally the highest L/D. Larger L/D is better. Skip ⚠ rows.

After insert: the span runs left–right, the chord runs fore–aft, and the flow is from the front (+X).

---

## c) A low-drag underwater thruster shell

This is the outer shape, not a spinning blade. One sentence:

1. Type:

   水底推進器 殼要最低水阻

   That means: underwater thruster, the shell should have the lowest water drag.

2. Click **Build design space (rules)** (or the AI button if you have a key).
3. Step ② should be a streamlined shell. Check fluid is **water** and inflow is about **2 m/s** (the sentence did not give a speed; underwater defaults to 2). The objective is drag in newtons, minimise.
4. The constraint **volume ≥ 1.5 L** means the interior is at least about 1.5 litres. Raise that number if your mechanism is larger.
5. Variables: length, diameter, where the body is thickest, nose shape, tail shape, and base diameter ratio. Nose 1 is pointed and 3 is blunt. Tail 1 is a cone and 3 is full. Default ranges are fine.
6. Click **▶ Run optimisation**.
7. Pick the lowest-drag row that says **feasible** (✓). Rows under 1.5 L are marked ⚠.

To skip typing, click **🐟 Streamlined shell**. The title is the low-drag underwater thruster shell: water, 2 m/s, at least 1.5 L, minimise drag.

The inserted shell is a **solid** body of revolution (nose at the origin, length along X). Wall thickness is only a weight estimate. It does not hollow the part. Use the normal **Shell** tool after insert if you want a wall.

---

## d) Insert the best design, edit it, export STL

1. Click the row you want (▶).
2. Optional: **👁 Preview 3D**, then click it again to hide.
3. Click **＋ Insert into model**. The first insert loads the geometry kernel and can take a few seconds. Success says it was inserted as a timeline STEP body.
4. Click **✕** to close the lab.
5. Edit it like any other solid:
   - Fillet, chamfer, shell, hole, and combine/cut are on the solid toolbar.
   - The timeline at the bottom can roll back a step.
   - If another body is already on screen, insert parks it and adds the new one. It does not silently overwrite.
6. Export:
   - Top left **File ▾** → **Export STL**.
   - To take it back into Fusion 360, use **Export STEP** instead.

**⬇ Download STL** on the result downloads that candidate as it is, before insert and before any later edits. After you modify the body, use the File menu export.

Fan: spin axis up (Z), thrust up. Wing and shell: inflow along +X.

---

## e) Send the top few to CFD, and read the calibration factor

This is layer ③. Before you send:

1. On this PC, double-click

   `C:\ClaudeCode\aero-cfd-service\start-service.bat`

   Leave the black console window open. Closing it stops the service.
2. Open WebCAD in Chrome. If a later message says the browser blocked local network access, see Common questions.

Then:

1. After optimisation, scroll to **🧮 OpenFOAM CFD verification**.
2. Click **Check service**. Wait until you see a green **CFD service online**. The address defaults to this PC, `127.0.0.1` port `8765`. Leave it unless you moved the service.
3. **N** is how many to send. It sends the first N **feasible** rows from the top of the table, **not** whichever row you clicked. For a quick check set N to **1** (usually the best row at the top). Maximum 8.
4. Set **Mesh** to **coarse** the first time. Move to medium or fine only after that shape is worth the wait.
5. Wings and shells have **Solver preset**. Leave **Auto (Re<3e5 → laminar transient)**. Slower bluff bodies use the setup that was checked on a sphere; higher Reynolds number uses steady SST. Propellers do not show this list; they use a rotor setup instead.
6. Click **🧮 Send to CFD verification**.
7. Under **CFD jobs** the state goes queued → running → done. You get a progress bar, elapsed time, and a live Cd while it runs. Only one job runs; the others wait. **Cancel** if you do not want to wait.
8. When it finishes, the table has three columns:
   - **Engineering estimate** — the lab number.
   - **OpenFOAM** — this run.
   - **Ratio CFD/est.** — OpenFOAM divided by the estimate. ×1.40 means the estimate was about 70% of the CFD value, **about 30% low**.
9. **Calibration factor (CFD ÷ estimate, per template)** stores that multiplier (averaged if you finish more than one job on the same template). It stays empty until a job finishes.
10. Tick **Re-rank with CFD / calibrated values**. A candidate that already has CFD uses the CFD number. The others use estimate × factor. Lower is better for drag; higher is better for efficiency.

If the service is off or the browser blocked it, the red note includes **⬇ Download case ZIP**. Save that and run it later. You do not edit the zip by hand.

A propeller job adds a yellow **NOT validated** line. You can look at the ratio. Do not treat it as a real thrust correction. See the limits below.

---

## f) Wind-tunnel a shape you modelled, then verify it with OpenFOAM

This path does not go through the design lab. Any solid you sketched, or a lab body you edited afterwards, works.

1. Have a body on screen (for example a sketch extruded). An empty scene says it needs an active body or a selected mesh component. The button label is **需要先有活動實體或選中網格件**.
2. **🧪 Lab** → **Simulation** → **Wind/Water Tunnel**.
3. The panel title is **風洞 / 水洞（LBM 體素趨勢）** (wind / water tunnel, voxel LBM, trend-level). Labels on this panel are Cantonese:
   - **流體** (fluid): **空氣（風阻）** air, or **水（水阻）** water. Pick water for an underwater part.
   - **速度** (speed): the slider. 10 m/s is about 36 km/h.
   - **吹向** (flow direction): **自動（最長軸）** (automatic, longest axis) is usually right. **+向 / −向** flips the direction.
   - **精細度** (resolution): start in the middle. Further right is slower.
   - **引擎** (engine): leave **CPU（準·可比舊數）** (CPU, the number you can compare). GPU is only for dragging the part. Its Cd is not trustworthy; see the limits.
4. Click **運行** (Run) and wait for the bar. Then read **風阻係數 Cd** (drag coefficient) and **阻力** (drag force). The small print says this is trend-level: relative comparisons are the trustworthy part; absolute Cd is only a trend.
5. At the bottom of the same panel, click **🧮 Verify this shape with OpenFOAM** (in Chinese UI: **用 OpenFOAM 驗證呢個形狀**). `start-service.bat` must be open. If it is not, the panel says the service is offline or the browser blocked local network access.
6. The LBM Cd is printed beside the button. When the job finishes, the OpenFOAM Cd is shown against that LBM number. They will not match. That is expected; see Common questions.

Keep the OpenFOAM number. Do not compare a GPU-engine Cd with OpenFOAM as if both were absolute.

---

## Known limits (plain)

- **Propeller and fan CFD is not validated.** The local run is a steady rotor approximation. It has not been checked against measured propeller data. The panel marks it **NOT validated**. Use it only as a rough “which one makes more thrust” hint, not as real thrust, power, or efficiency.
- **Browser-tunnel absolute Cd is biased.** It is a lattice trend solver. Compare two shapes at the same speed, fluid, and engine. Do not write that Cd into a report as a tunnel measurement.
- **The engineering estimate runs about 30% low and needs a correction.** Drag and efficiency in the lab are fast formulas. Multiply the estimate by the **calibration factor** (CFD ÷ estimate) from layer ③ before you trust a ranking. Until you have run CFD, the estimate is only a filter.
- **GPU tunnel Cd is about 2× high.** On a sphere it measured 2.0–2.2 times the reference, at several resolutions, so it is not “the mesh was coarse”. The engine therefore defaults to CPU. GPU is for “which direction is less drag, in percent” and for dragging the part around. Absolute Cd and drag come from CPU or from OpenFOAM.
- Neither the estimate nor the browser tunnel is a certified solver. OpenFOAM’s sphere check is a few percent. Wing drag can still read high; read the job warnings (not converged, mesh warnings).
- The shell you insert is a solid outer shape. Wall thickness is not a hollow wall.
- The service runs one job at a time. Do not send eight fine-mesh jobs on the first try.

---

## Common questions

### The CFD service is not running

The red line is **Local CFD service is not running** (Chinese UI: **本機 CFD 服務未開**). Double-click `C:\ClaudeCode\aero-cfd-service\start-service.bat`, leave the console open, and click **Check service** until you see **CFD service online**. Closing the window stops the service. If it still will not start, use **Download case ZIP** and run later.

### The browser blocks local network access

The page is on the web and the solver is on your PC, so Chrome asks for local network access. If you refused it, the lab says the browser blocked the call even when the service is actually running.

Click the lock or settings icon **to the left of the address bar** → **Site settings** → set **Local network access** to **Allow** → reload → **Check service** again.

### It is taking too long

- An estimate should be seconds. 8000 evaluations with several objectives can take a bit longer; past a minute, click **■ Stop** and try 1200.
- A CPU tunnel at the finest resolution can take minutes on a large part. Use a middle resolution for a trend.
- OpenFOAM is minutes even on coarse, longer on fine, and jobs queue. First time: N = 1, mesh coarse. If the bar and the elapsed time are moving, it is working. **Cancel** if you do not want to wait.

### Why the result does not match the estimate

The three layers are three different methods. The numbers are not supposed to match.

- The estimate is fast and usually **about 30% low**.
- The tunnel is a trend. Absolute Cd is off, and the GPU path is about twice as high.
- OpenFOAM is the one that lands near the reference (sphere 0.490 versus 0.47).

Read **Ratio CFD/est.** For a wing or a shell, use that factor to calibrate and re-rank. For a propeller, neither side is validated well enough for a report; only the rough ordering is useful. If the job says **not converged**, discount the CFD number too.
