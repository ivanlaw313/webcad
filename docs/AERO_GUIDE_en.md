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
| How accurate | For **ranking and shortlisting**, not CFD. On the same 555×73 mm streamlined shell in water at 2 m/s, the engineering estimate is Cd 0.115, about **10%** from the finest-mesh CFD (0.1048). Coarse and medium are only about 4–5% from that finest mesh (see e). Still correct it with layer ③. Auto-design mode learns that gap (see g). | **Trend-level**. With the same settings, which shape has less drag is trustworthy. Do not treat the absolute drag coefficient Cd as a lab report. | The most accurate of the three. A sphere checks out at Cd **0.490** against a reference of about **0.47** (a few percent). A spinning propeller or fan is **partly validated** (static thrust −12% and power −3% are on target; forward-flight thrust is 22–36% low, trend correct). See the limits. |
| How long | The panel shows **milliseconds**. 1200 evaluations usually finish within a few seconds. 300 is faster; 8000 is still seconds. | CPU: resolution around 24 is tens of seconds; 48 can be minutes (large parts slower). GPU: drag the part and watch the flow live, but Cd reads **about 2× high**. | CFD verification and auto-design default to mesh **coarse** (about 1–5 minutes, error about 5%). On the shell: coarse 1.4 minutes, medium 7.7 minutes, finest mesh 71 minutes. The checked sphere setup is about 10 minutes. **One job at a time**; the rest queue. |
| When | Sweep many sizes, drop the obvious losers, keep a shortlist. | Which outline is cleaner, which direction has less drag, or you want to see smoke. | The last one or two candidates, or a shape you modelled yourself, when you need a serious Cd or drag force. |

Rule of thumb: the estimate picks the shortlist, the tunnel compares shapes, OpenFOAM is the one you keep.

---

## Open the lab

1. On the top workspace bar, click **🧪 Lab**.
2. In the **Simulation** group, click **Aero Design Lab**.
3. A panel opens on the right. The orange note says the numbers are estimates, not CFD.

Or press **/** , type “aero”, and pick **Aero Design Lab**.

The panel is four steps: ① Design brief, ② Design space, ③ Optimise, ④ Results. At the bottom there is also **⑤ Auto-design mode**. See section g. You do not have to finish the four steps first.

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
4. **Mesh** defaults to **coarse**, for both CFD verification and auto-design. It is fast: about 1–5 minutes, error about 5%. Use **medium** or **fine** for a final check. Next to the mesh picker there is now a gray line of explanation. It is no longer a yellow warning.

   What was wrong: when the model was thinner than the background mesh, the mesher could not see the surface, so coarse-mesh drag used to read far too high. That is fixed (automatic pre-refinement).

   After the fix, the same 555×73 mm streamlined shell in water at 2 m/s: coarse, 210 thousand cells, 1.4 minutes, Cd **0.1096**; medium, 590 thousand cells, 7.7 minutes, **0.1090**; finest mesh, 2.69 million cells, 71 minutes, **0.1048**. Coarse and medium differ from the finest mesh by about 4–5%. The engineering estimate is 0.115 (about 10% off). A 6:1 ellipsoid was checked too (about 2–4% off).
5. Wings and shells have **Solver preset**. Leave **Auto (Re<3e5 → laminar transient)**. Slower bluff bodies use the setup that was checked on a sphere; higher Reynolds number uses steady SST. On a slender body (length ÷ equivalent diameter > 3), steady SST automatically uses the streamlined-rans setup. Propellers do not show this list; they use a rotor setup instead.
6. Click **🧮 Send to CFD verification**.
7. Under **CFD jobs** the state goes queued → running → done. You get a progress bar, elapsed time, and a live Cd while it runs. Only one job runs; the others wait. **Cancel** if you do not want to wait.
8. When it finishes, the table has three columns:
   - **Engineering estimate** — the lab number.
   - **OpenFOAM** — this run.
   - **Ratio CFD/est.** — OpenFOAM divided by the estimate. ×1.40 means this CFD result is 1.4 times the estimate. Do not memorise “always 30% low”. On a streamlined shell the estimate and the finest-mesh CFD differ by about 10% (0.115 versus 0.1048). Coarse and medium differ from that finest mesh by about 4–5%. Still calibrate with CFD. Auto-design mode learns those multipliers (see g).
9. **Calibration factor (CFD ÷ estimate, per template)** stores that multiplier (averaged if you finish more than one job on the same template). It stays empty until a job finishes.
10. Tick **Re-rank with CFD / calibrated values**. A candidate that already has CFD uses the CFD number. The others use estimate × factor. Lower is better for drag; higher is better for efficiency.

If the service is off or the browser blocked it, the red note includes **⬇ Download case ZIP**. Save that and run it later. You do not edit the zip by hand.

A propeller job adds a yellow line: **partly validated (static thrust −12% / forward flight 20–35% low)**. A stationary fan (inflow 0) can use that CFD as a reference. A propeller with forward speed will read low on thrust; use the ranking, not the thrust as a real number. See the limits below.

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
5. At the bottom of the same panel, click **🧮 Verify this shape with OpenFOAM** (in Chinese UI: **用 OpenFOAM 驗證呢個形狀**). `start-service.bat` must be open. If it is not, the panel says the service is offline or the browser blocked local network access. This panel has no mesh picker. The lab’s CFD verification and auto-design are where you choose a mesh, and those default to **coarse** (see e). This button also sends **coarse**.
6. The LBM Cd is printed beside the button. When the job finishes, the OpenFOAM Cd is shown against that LBM number. They will not match. That is expected; see Common questions.

Keep the OpenFOAM number. Do not compare a GPU-engine Cd with OpenFOAM as if both were absolute.

---

## g) Auto-design mode (it designs, tests, and looks for the best)

At the bottom of the lab the title is **⑤ Auto-design mode (closed loop)**. You do not click **▶ Run optimisation** and then send CFD by hand, round after round. One click on **▶ Start auto-design** repeats: search with the estimate → send a few different shapes to local OpenFOAM → teach a correction model from the CFD → search again with the corrected estimate.

Set the design space first (a template or one sentence, sections a–c). If you do not, the lab opens on the propeller / fan template, and a propeller does **not** send CFD unless you opt in (below).

### Which settings to pick

You cannot edit these while a loop is running. The defaults are a reasonable first try:

| Field | Default | What it does |
| --- | --- | --- |
| **Rounds** | 3 | How many times to optimise, then CFD, then learn. About 1 to 20. Leave 3 the first time. |
| **CFD per round** | 2 | How many **different** designs this round sends to OpenFOAM. Use 1 if you want it faster. About 1 to 8. |
| **CFD job budget** | 6 | Total CFD jobs for the whole loop. When it is used up the loop stops, even if rounds remain. 3 rounds × 2 jobs = 6, so the default spends the budget exactly. |
| **Time limit (min)** | 120 | Stop when the clock runs out. The default mesh is coarse: one job is about 1–5 minutes (1.4 minutes on the shell). Medium is about 8 minutes, and the finest mesh can pass an hour (71 minutes). Six coarse jobs usually stay inside this cap; fine may not. |
| **Stop if improvement < ε** | 0.01 | Stop when the best so far is not at least 1% (0.01) better than the previous round. Smaller searches harder; larger stops sooner. |

On the same row:

- **Mesh** defaults to **coarse** (about 1–5 minutes, error about 5%). Use medium or fine for a final check. Next to the picker is a gray line of explanation, not a yellow warning. The old failure (a model thinner than the background mesh, so the mesher missed the surface and coarse drag read far too high) is fixed: the service pre-refines automatically. See e.
- Wings and shells have **Solver preset**. Leave **Auto (Re<3e5 → laminar transient)**. On a slender body (length ÷ equivalent diameter > 3), steady SST automatically uses streamlined-rans. Propellers do not show this list.
- Leave **Evaluations** at **1200**. That is how many estimates each auto-design round runs. The Evaluations control in step ③ applies only when you press **▶ Run optimisation** yourself. It is not copied here.

Then click **▶ Start auto-design**. The line beside it reads round 0/3, CFD jobs 0/6, and elapsed time, plus the step it is on: checking the CFD service, optimising, submitting CFD jobs, waiting for CFD, updating the correction model.

**■ Stop auto-design** keeps finished results and cancels queued or running CFD jobs. **Clear** is available only after the loop has stopped.

The stop line names the reason. Usual ones: **all rounds done**, **CFD job budget used up**, **time limit reached**, **improvement below ε — converged**, **stopped**. If every CFD job in a round fails, it stops and keeps the best estimate.

### What each round does

1. **Optimise.** Search the design space with the engineering estimate. From round 2 on, that estimate is **corrected**. It is no longer the raw formula.
2. **Pick the top N.** N is **CFD per round**. It does not send N near-copies. It spreads the picks, and it skips shapes already verified by CFD.
3. **CFD.** Local OpenFOAM. The service runs one job at a time; the rest queue. Default coarse is about 1–5 minutes (1.4 minutes on the shell). Medium is about 8 minutes. The finest mesh can pass an hour (2.69 million cells and 71 minutes on the 555×73 mm shell).
4. **The correction model learns.** After CFD finishes it learns from CFD ÷ estimate (the panel intro calls this a Gaussian process). In plain words: for a shape like this, what multiplier makes the estimate land near the CFD number.
5. **Optimise again.** Back to step 1, until the rounds, the CFD budget, or the time limit is used up, or the improvement is below ε.

### How to read the chart and the round table

The chart title is **Best per round (solid = CFD-verified, dashed = corrected estimate)**.

- **Dashed line, grey dots**: that round’s best corrected estimate.
- **Green dots**: that round’s best CFD.
- **Solid green line**: the best CFD-verified result up to that round. It can stay flat. It is not always equal to this round’s green dot, because an earlier round may still be better.
- Estimator-only for the whole loop: no green line, only the dashed one.

Each table row is one round:

- **Round**. A **⚠** after the number means this round did not use CFD.
- **Best estimate (corrected)**.
- **Best CFD**. Blank means no CFD job finished this round.
- **Correction**. The learned multiplier, for example `Cd×1.800 (n=2)`. n is how many CFD points were used. “—” means no CFD yet.
- **Prediction error**. How far the model’s multiplier was from what this round actually measured, in percent. Round 1 has no earlier data, so this is how far the raw estimate was from CFD.
- **CFD jobs**. `#id:✓` done, `✗` failed, a percent while it runs, `…` not sent yet.

While a round is running, the lines under the table show each job id, stage, and progress. Open **Log** for a timed line of what happened.

### How to use the “best verified design” card

When there is a result, a card appears underneath.

- **Green border, 🏆 Best verified design**: at least one design has finished CFD and still meets the constraints. The **CFD values** on this card are the numbers to keep.
- **Amber border, ⚠ Best design (NOT CFD-verified — estimate only)**: there is no usable CFD. The amber line says again that every number below is an engineering estimate, not CFD-verified. Do not put them in a report.

Three columns: **Estimator** (uncorrected), **Corrected estimate**, **CFD values**. The main objective (L/D, drag, efficiency) is in bold. Under that, the design’s parameters (span, chord, and so on).

Three buttons:

- **＋ Insert into model**. After it is on the timeline, edit and export as in section d.
- **⬇ Download STL**.
- **⬇ Download STEP**.

If the CFD line says **⚠ not converged**, discount that CFD number.

### When the CFD service is off, or the browser blocks it

The loop checks the service first.

- Online: a green banner, **CFD closed loop: every round is verified by OpenFOAM and the model corrected**.
- Not online: an amber banner, **Estimator only (no CFD verification)**, plus a reason.
  - **local CFD service unreachable**. Double-click `C:\ClaudeCode\aero-cfd-service\start-service.bat` and leave the console open. The same instruction is repeated under the banner. At the start of the next round, if the service is back, it switches to CFD mode. The log says the CFD service came online and it is switching to CFD mode.
  - **browser blocks local network access**. Same fix as in Common questions: lock or settings icon to the left of the address bar → Site settings → **Local network access** → **Allow** → reload. The steps are repeated under the banner.

In estimator-only mode the best card is always the amber, unverified one. The rest of the lab (run optimisation yourself, insert, wind tunnel) still works.

### A propeller does not use CFD unless you ask

Propeller and fan rotor CFD is **partly validated**. Against the UIUC measurement of an APC 10×4.7: static thrust **−12%** and power **−3%** (on target); in forward flight (advance ratio J **0.3–0.5**) thrust is **22–36%** low (misses the target; the trend is right). Auto-design still does **not** send it unless you opt in. The Chinese amber line is **轉子 CFD 只係部分驗證（前飛推力偏低 20–35%），預設唔用 — 如要照用請剔選下面**. The English amber reason is still the older sentence “rotor CFD is unvalidated and off by default — tick below to use it anyway”. Ignore the word unvalidated in that sentence: the checkbox and the job label are the current wording, and the loop stays estimator-only until you tick the box.

To use it, tick **⚠ Use rotor CFD anyway (partly validated: static OK, forward flight low)**. With the service online the loop becomes CFD. The banner, the table, and the card say **partly validated (static thrust −12% / forward flight 20–35% low)** — the label rounds 22–36% to 20–35%. The same line still appends the older note “Rotor MRF results are not validated against measured data — qualitative only” (Chinese: 「轉子 MRF 結果未經實測數據驗證 — 只供定性參考」). That note is out of date; use the APC comparison. A stationary fan (inflow 0) can take the CFD as a reference. With forward speed, CFD thrust reads low; use the ranking, not the thrust number.

### Close the tab and reopen: it picks up where it left off

The loop is stored in this browser. Close the tab or reload:

- **Still running**: when you open WebCAD again, the Aero Design Lab **opens by itself** and continues from the step it stopped on (it keeps watching queued and running CFD jobs). You do not press Start again.
- **Already finished**: the result is still there. Open the lab yourself and the best card is waiting. You do not recompute it.

If you also closed the black console, CFD itself stops. After you start `start-service.bat` again, finished results are still there. A job that was cut off mid-run may have to be done again.

---

## h) Ask the AI assistant to do it

Sections a–g are all buttons you press yourself. **With no AI key, the lab still works**: templates, the rule parser for one sentence, and the auto-design button do not need a key. Without a key you only lose the AI Assistant chat.

1. On the **top bar, at the right** (next to search 🔍 and help ?), click **AI Assistant**, or press **Ctrl+Shift+A**.
2. The panel title is **✦ AI Copilot**. If no key is set, the settings block opens by itself. The **⚙** button in the title bar opens it too. The tooltip is **Settings (Provider / API Key / Model)**.
3. Pick a **Provider** (OpenAI, Grok, Gemini, or a local model). Paste your own key in **API Key**. The note says the key stays in this browser and talks to the provider directly. It is not sent through a WebCAD server.
4. Type what you want in the box below and press Enter. For example:

   幫我設計一個 1.2 米翼展嘅滑翔機翼，用 CFD 驗證兩輪

   (Design me a glider wing with a 1.2 m span, and verify it with CFD for two rounds.)

It calls these four tools itself. You do not type the names:

- **aero_open_lab**. Opens the Aero Design Lab and sets the design space from your sentence (propeller / fan, wing, or streamlined shell).
- **aero_start_auto_design**. Starts auto-design, the same loop as the button in section g. The example above opens the lab, sets the span to about 1.2 m, aims at L/D, and runs. “兩輪” (two rounds) sets Rounds to 2. It replies at once that it has started. CFD runs in the background, minutes per job. It does not wait for every job before answering.
- **aero_auto_design_status**. Ask “how far along” or “what is the best”. It reports the round, estimate versus CFD, the correction factor, and whether the best design is CFD-verified.
- **aero_stop_auto_design**. Say stop. Queued and running CFD jobs are cancelled. Finished results stay.

Before you say “verify with CFD”, `start-service.bat` must be open and the browser must allow local network access. Otherwise it tells you plainly that the loop is estimator-only and the result is not CFD-verified. A propeller or fan still does not send rotor CFD unless you ask. If you ask it to use rotor CFD anyway, it will. Treat that result as partly validated: a stationary fan can be used as a reference; with forward speed the thrust reads low, so use the ranking.

Send a message with no key and the reply is: **⚠ Enter your API Key in Settings (gear icon) first.** Go back to the lab and press the buttons yourself. That does not need a key.

---

## Known limits (plain)

- **Propeller and fan CFD is partly validated.** Against the UIUC measurement of an APC 10×4.7: static thrust −12% and power −3% (on target); forward flight at advance ratio J 0.3–0.5 is 22–36% low on thrust (misses the target; the trend is right). The job label is **partly validated (static thrust −12% / forward flight 20–35% low)**. The auto-design checkbox is **Use rotor CFD anyway (partly validated: static OK, forward flight low)**. Rotor CFD is still off unless you tick it. A stationary fan (inflow 0) can use the CFD as a reference. With forward speed the thrust number reads low; use the ranking.
- **Browser-tunnel absolute Cd is biased.** It is a lattice trend solver. Compare two shapes at the same speed, fluid, and engine. Do not write that Cd into a report as a tunnel measurement.
- **Still calibrate the engineering estimate with CFD.** It is not a fixed “30% low”. On a streamlined shell the estimate is about 10% from the finest mesh: the same 555×73 mm shell in water at 2 m/s is estimate Cd 0.115 and finest mesh (2.69 million cells, 71 minutes) 0.1048; coarse is 0.1096 and medium is 0.1090, about 4–5% from the finest mesh. A 6:1 ellipsoid was checked too (about 2–4% off). Multiply the estimate by the **calibration factor** (CFD ÷ estimate) from layer ③ before you trust a ranking. Auto-design mode learns that multiplier from CFD results (see g). Until you have run CFD, the estimate is only a filter.
- **The model assumes fully turbulent flow.** Real flow can transition naturally and the drag can be another 30–50% lower. Only zero-angle bodies of revolution were checked.
- **GPU tunnel Cd is about 2× high.** On a sphere it measured 2.0–2.2 times the reference, at several resolutions, so it is not “the mesh was coarse”. The engine therefore defaults to CPU. GPU is for “which direction is less drag, in percent” and for dragging the part around. Absolute Cd and drag come from CPU or from OpenFOAM.
- Neither the estimate nor the browser tunnel is a certified solver. OpenFOAM’s sphere check is a few percent. Wing drag can still read high; read the job warnings (not converged, mesh warnings).
- The shell you insert is a solid outer shape. Wall thickness is not a hollow wall.
- The service runs one job at a time. Default coarse is about 1–5 minutes. The finest mesh is slow (2.69 million cells and 71 minutes on the 555×73 mm shell). Do not send eight fine-mesh jobs on the first try.

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
- OpenFOAM on the default coarse mesh is about 1–5 minutes (1.4 minutes on the shell), and jobs queue. Medium is about 8 minutes. The finest mesh can pass an hour (71 minutes). First time: N = 1, leave the mesh on coarse. If the bar and the elapsed time are moving, it is working. **Cancel** if you do not want to wait.

### Why the result does not match the estimate

The three layers are three different methods. The numbers are not supposed to match.

- The estimate is fast. On a streamlined shell it is about 10% from the finest-mesh CFD (0.115 versus 0.1048). After the fix, coarse and medium are about 4–5% from that finest mesh. It is not a fixed 30% low. Still calibrate with CFD. Auto-design learns the gap (see g). The model assumes fully turbulent flow; if the real boundary layer transitions naturally, drag can be another 30–50% lower.
- The tunnel is a trend. Absolute Cd is off, and the GPU path is about twice as high.
- OpenFOAM is the one that lands near the reference (sphere 0.490 versus 0.47). On a slender shell, leave the mesh on coarse. Use medium or fine for a final check.

Read **Ratio CFD/est.** For a wing or a shell, use that factor to calibrate and re-rank. A stationary fan can use rotor CFD as a reference. With forward speed, propeller thrust from CFD reads low; use the ranking. If the job says **not converged**, discount the CFD number too.
