/*
 * GPU LBM 球體 Cd ——「堵塞率掃描」探針
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 要答嘅問題：lbm.validate 嗰條球體 fixture 量到 Cd / Clift-Gauvin ≈ 2.0–2.2×，
 * 到底係【碼有 2× bug】定係【壁面約束 confinement 嘅真實物理】？
 *
 * ★ 2026-10-01 發現：原先嘅推論有個洞 ★
 * ───────────────────────────────────────
 * 7 月嘅結論係「三個 tier（dLb 20 / 28 / 37）比值都係 ~2.1，同解析度無關 →
 * 唔係網格不足 → 所以係碼錯」。但嗰三個 tier 嘅【堵塞率亦然冇變】：
 * 14.4% / 15.4% / 16.6%。即係「不變量」唔止解析度，堵塞率都係。
 * 所以解析度無關性【完全唔能夠】分辨「碼錯」同「約束物理」。
 *
 * λ = d/D = 20.09 / 47 = 0.427 —— 呢個係一個【重度受限】嘅球。
 * Stokes 區 Haberman-Sayre 管壁修正：K = 1/(1 − 2.104λ + 2.089λ³ − 0.948λ⁵)
 *   λ=0.427 → K ≈ 3.98×。Re≈600 之下弱啲，但仍然係一階效應。
 * 換言之 2.12× 完全落喺約束物理嘅合理範圍，唔一定係 bug。
 *
 * 呢個探針做【唯一能夠分辨兩者】嘅對照實驗：
 *   固定球體解析度（dLb 不變）、固定 Re，【只掃側向留白】。
 *   · Cd 隨堵塞率下降而趨向 Clift-Gauvin  → 約束物理，碼係啱嘅
 *   · Cd 喺極低堵塞率仍然高 2×            → 真係有 2× bug
 *
 * 順手驗埋：GPU 報嘅 links 對比 CPU 數嘅真實 D3Q19 fluid→solid link 數。
 * 比值 ≠ 1 就即刻證實重複計數（7 月只記錄過 links 嘅絕對值，從來冇對過真值）。
 *
 * ── 點用 ─────────────────────────────────────────────────────────────
 * ⚠ 一定要喺一個【顯示緊、有 compositing】嘅瀏覽器視窗跑。
 *   隱藏／唔 composite 嘅 context 之下 fenceSync 永遠唔 signal（已隔離出最小重現），
 *   所以呢個探針【唔用】solver 嘅 async readback，改用同步 readPixels + CPU fp64 加總。
 *
 *   1. npm run dev，開 http://localhost:5174（或你嘅 port）
 *   2. F12 → Console → 貼成個檔
 *   3. await probe()            // 全掃，約 2–5 分鐘
 *      await probe([0, 24])     // 只跑兩個
 */
(() => {
  const PADS = [0, 8, 16, 24, 36];     // 側向每邊留白格數 → 堵塞率由 ~14% 掃到 ~2%
  const SPHERE_MM = 100, SPEED = 10;

  /*
   * ★★ 點解要用高黏度（= 低 Re）★★
   *
   * 原 fixture 跑 Re_lb ≈ 597。球體喺 Re ≳ 210 會【渦脫落】，尾流本質非穩態。
   * Strouhal St ≈ 0.2 → 脫落週期 T = dLb / (St · U_LB) = 20.09 / (0.2 × 0.05) ≈ 2009 步。
   * 而 fixture 嘅平均窗口（minSteps 1.8 → maxSteps 4.5 個流過時間）只有約 3456 步
   * ≈ 1.7 個脫落週期 —— 根本唔夠做時均。所以佢永遠 converged:false，而個「Cd」
   * 係一個隨機時刻嘅快照。我實測五個配置 Cd 由 0.509 跳到 1.393，非單調亂跳，證實咗。
   *
   * 修法唔係跑長啲（要 6+ 個週期 ≈ 12000 步，太貴），而係【降 Re 入穩態帶】：
   * Re ≲ 210 嘅球體尾流係穩態軸對稱，真係收斂得到，而 Clift-Gauvin 喺嗰度一樣有效。
   * 高黏度 → Re_real 低 → deriveFlow 出嘅 Re_lb 低。MU_STEADY = 20× 空氣。
   */
  const MU_AIR = 1.81e-5;
  const MU_STEADY = MU_AIR * 20;      // → Re_lb 落到 ~30，穩態尾流，收斂得到

  async function probe(pads, mu) {
    pads = pads || PADS;
    mu = mu || MU_STEADY;
    const src = await (await fetch('/src/analysis/lbm/lbmGpu.ts')).text();
    const threeUrl = src.match(/from\s+["']([^"']*three[^"']*)["']/)[1];
    const THREE = await import(threeUrl);
    const GPU = await import('/src/analysis/lbm/lbmGpu.ts');
    const SDF = await import('/src/analysis/lbm/sdfBake.ts');
    const LAT = await import('/src/analysis/lbm/lattice.ts');
    const MRT = await import('/src/analysis/lbm/probeMRT.ts');

    // Clift & Gauvin (1971)，同 lbm.validate.test.ts 同一條式
    const sphereCd = (Re) =>
      (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687)) + 0.42 / (1 + 4.25e4 * Math.pow(Re, -1.16));

    // 球 grid + 側向留白。★ 球本身一個格都唔改 → dLb 同解析度完全不變 ★
    function grid(res, pad) {
      const n = res, ny = n + 2 * pad, nz = n + 2 * pad;
      const solid = new Uint8Array(n * ny * nz);
      const c = (n - 1) / 2, r = n / 2;
      for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const dx = i - c, dy = j - c, dz = k - c;
        if (dx * dx + dy * dy + dz * dz <= (r - 0.5) * (r - 0.5)) {
          solid[i + n * ((j + pad) + ny * (k + pad))] = 1;
        }
      }
      return { h: SPHERE_MM / n, nx: n, ny: ny, nz: nz, ox: 0, oy: 0, oz: 0, solid: solid };
    }

    // CPU 數真實 D3Q19 fluid to solid link（pull scheme：上游鄰居係固體就算一條）
    function trueLinks(phi, DX, DY, DZ) {
      const cs = [];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        const s = Math.abs(x) + Math.abs(y) + Math.abs(z);
        if (s === 1 || s === 2) cs.push([x, y, z]);        // 6 面 + 12 棱 = D3Q19 嘅 18 條
      }
      const sol = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= DX || j >= DY || k >= DZ)
        ? false : phi.data[i + DX * (j + DY * k)] < 0;
      let n = 0;
      for (let k = 0; k < DZ; k++) for (let j = 0; j < DY; j++) for (let i = 0; i < DX; i++) {
        if (sol(i, j, k)) continue;
        for (let t = 0; t < cs.length; t++) {
          if (sol(i - cs[t][0], j - cs[t][1], k - cs[t][2])) n++;
        }
      }
      return n;
    }

    // 同步讀 oForce（attachment = N_TARGETS）+ frontal，CPU fp64 加總。
    // 唔綁 PIXEL_PACK_BUFFER = 即時返，完全唔經 fenceSync。
    function sample(s, gl) {
      const A = s.report().atlas;
      const px = new Float32Array(A.width * A.height * 4);
      const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s._fboOf(s.rtA));
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + LAT.N_TARGETS);
      gl.readPixels(0, 0, A.width, A.height, gl.RGBA, gl.FLOAT, px);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      let fx = 0, links = 0;
      for (let i = 0; i < px.length; i += 4) { fx += px[i]; links += px[i + 3]; }
      const ap = new Float32Array(s.ny * s.nz * 4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s._fboOf(s.frontalRT));
      gl.readPixels(0, 0, s.ny, s.nz, gl.RGBA, gl.FLOAT, ap);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
      let area = 0; for (let i = 0; i < ap.length; i += 4) area += ap[i];
      return { fx: fx, links: links, area: area };
    }

    const rows = [];
    for (let pi = 0; pi < pads.length; pi++) {
      const pad = pads[pi];
      const cv = document.createElement('canvas'); cv.width = cv.height = 32;
      const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
      const gl = renderer.getContext();
      let s = null;
      try {
        const caps = MRT.probeMRT(gl);
        if (!caps.ok || !caps.force7) throw new Error('GPU 唔夠：' + caps.reason);
        const tier = GPU.QUALITY_TIERS[0];
        const plan = SDF.planResolution([SPHERE_MM, SPHERE_MM, SPHERE_MM], tier);
        // ★★ 一定要明確傳 axis ★★ 唔傳嘅話 buildDomain 會【自己揀最長軸】做來流方向。
        //    側向加咗留白之後 Y/Z 就變成最長軸 → 流向軸靜靜鷄轉咗 → 成個掃描報廢。
        //    （2026-10-01 我第一版就係咁死：DY 冇變、只有 DZ 變大。）
        const dom = SDF.buildDomain(grid(plan.res, pad), { axis: 0, sign: 1 });
        const phi = SDF.bakePhi(dom);
        s = new GPU.LbmGpu(renderer, dom, phi, {
          measure: true, needVolume: false, substeps: 8,
          flow: { speed: SPEED, rho: 1.204, mu: mu }, caps: caps, tier: tier.name,
        });
        await s.ready();
        const f = s.report().flow;
        const minSteps = f.rampSteps + Math.round(1.8 * dom.DX / LAT.U_LB);
        const maxSteps = f.rampSteps + Math.round(4.5 * dom.DX / LAT.U_LB);
        const hist = [];
        let guard = 0, done = false;
        while (s.stepCount < maxSteps && guard++ < 40000 && !done) {
          s.advance();
          if (s.stepCount < minSteps || guard % 8 !== 0) continue;
          const q = sample(s, gl);
          hist.push({ cd: 2 * q.fx / (LAT.U_LB * LAT.U_LB * Math.max(1, q.area)), links: q.links, area: q.area });
          if (hist.length >= 14) {
            const w = hist.slice(-10).map((h) => h.cd);
            const mn = Math.min.apply(null, w), mx = Math.max.apply(null, w);
            const me = w.reduce((a, b) => a + b, 0) / w.length;
            if ((mx - mn) / (Math.abs(me) + 1e-12) < 0.012) done = true;
          }
          if (guard % 400 === 0) await new Promise((r) => setTimeout(r, 0));   // 畀個 pane 喘啖氣
        }
        const tail = hist.slice(-Math.max(6, Math.round(hist.length * 0.25)));
        const cd = tail.reduce((a, b) => a + b.cd, 0) / tail.length;
        const cg = sphereCd(f.reLbEffective);
        const last = hist[hist.length - 1] || {};
        const tl = trueLinks(phi, dom.DX, dom.DY, dom.DZ);
        rows.push({
          pad: pad, DX: dom.DX, DYxDZ: dom.DY + 'x' + dom.DZ, dLb: +dom.dLb.toFixed(2),
          lambda: +(dom.dLb / Math.min(dom.DY, dom.DZ)).toFixed(3),   // 由【側向短邊】算，唔係 DY
          blockagePct: +(100 * dom.frontalCells / (dom.DY * dom.DZ)).toFixed(2),
          Re_lb: +f.reLbEffective.toFixed(0),
          Cd: +cd.toFixed(4), CliftGauvin: +cg.toFixed(4), ratio: +(cd / cg).toFixed(3),
          gpuLinks: Math.round(last.links || 0), cpuLinks: tl,
          linkRatio: +((last.links || 0) / tl).toFixed(4),
          gpuArea: Math.round(last.area || 0), frontalCells: dom.frontalCells,
          samples: hist.length, converged: done,
          oscPct: (function () {            // 末段波動幅度 —— 唔收斂嗰陣睇呢個就知差幾遠
            const w = tail.map((h) => h.cd);
            const mn = Math.min.apply(null, w), mx = Math.max.apply(null, w);
            return +(100 * (mx - mn) / (Math.abs(cd) + 1e-12)).toFixed(2);
          })(),
        });
        console.table(rows);
      } catch (e) {
        rows.push({ pad: pad, error: String((e && e.message) || e) });
        console.table(rows);
      } finally {
        if (s) s.dispose();
        renderer.dispose(); renderer.forceContextLoss();
      }
    }
    console.log('%c判讀', 'font-weight:bold');
    console.log('· linkRatio 唔等於 1.000      -> 動量交換重複計數，即刻係 bug');
    console.log('· ratio 隨 blockage 下降而趨近 1 -> 約束物理，碼係啱嘅（要改 fixture 幾何，唔係改求解器）');
    console.log('· ratio 喺 2% blockage 仍然 ~2x  -> 真係有 2x bug，落一層查 reduce / 取樣');
    return rows;
  }
  window.probe = probe;
  console.log('已載入。跑：await probe()   或   await probe([0, 24])');
})();
