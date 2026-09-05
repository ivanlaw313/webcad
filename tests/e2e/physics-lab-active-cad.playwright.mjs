/* Browser acceptance for the primary data chain:
 * create a SOLID in WebCAD -> open Physics Lab -> use that active CAD body as
 * a real convex-hull rigid body.  This deliberately does not freeze the body
 * into an assembly component first. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseURL = (process.argv[2] ?? 'https://cad.neuralworkshk.com').replace(/\/$/, '')
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'networkidle', timeout: 60000 })

  // Use the same CREATE dialog an operator uses to make a non-empty active body.
  await page.keyboard.press('/')
  const query = page.locator('input:focus')
  await query.fill('box')
  await page.locator('[data-i="0"]').click()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor({ state: 'visible', timeout: 30000 })
  const dimensions = dialog.locator('input[inputmode="decimal"]')
  await dimensions.nth(0).fill('40')
  await dimensions.nth(1).fill('30')
  await dimensions.nth(2).fill('20')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden', timeout: 30000 })
  await page.locator('.browser .tree-row', { hasText: '●' }).waitFor({ state: 'visible', timeout: 60000 })

  // Physics Lab is invoked through its actual ribbon command, not injected state.
  await page.keyboard.press('/')
  await page.locator('input:focus').fill('physicslab')
  await page.locator('[data-i="0"]').click()
  const lab = page.locator('.physics-lab')
  await lab.waitFor({ state: 'visible', timeout: 30000 })
  const environment = lab.locator('[data-testid="physics-environment-preset"]')
  await environment.selectOption('moon')
  assert.equal(await lab.locator('[data-testid="physics-gravity"]').inputValue(), '1.62')
  assert.equal(await lab.locator('[data-testid="physics-air-density"]').inputValue(), '0')
  await environment.selectOption('earth')
  assert.equal(await lab.locator('[data-testid="physics-gravity"]').inputValue(), '9.81')
  await lab.getByText('現有 CAD 實體＋凸包碰撞體').waitFor({ state: 'visible', timeout: 30000 })
  await lab.locator('[data-testid="physics-cad-transient-enabled"]').check()
  await lab.locator('[data-testid="physics-cad-transient-material"]').selectOption('abs')
  await lab.locator('[data-testid="physics-cad-fracture-enabled"]').check()
  const setRange = async (testId, value) => {
    const input = lab.locator(`[data-testid="${testId}"]`)
    await input.evaluate((node, next) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(node, String(next)); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })) }, value)
    assert.equal(await input.inputValue(), String(value))
  }
  await setRange('physics-cad-fracture-threshold', '0')
  // The CAD body has independent placement and velocity, not only the orange test ball.
  await setRange('physics-cad-start-x', '2.4')
  await setRange('physics-cad-start-height', '3.1')
  await setRange('physics-cad-start-z', '-1.2')
  await setRange('physics-cad-start-vx', '1.5')
  await setRange('physics-cad-start-vz', '-2')
  await lab.getByRole('button', { name: '儲存目前設定' }).click()
  assert.deepEqual(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('webcad.physics-lab.scenario/v1') ?? 'null'); return [s?.cadStartX, s?.cadStartHeight, s?.cadStartZ, s?.cadStartVx, s?.cadStartVz] }), [2.4, 3.1, -1.2, 1.5, -2])

  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForTimeout(2500)
  assert.equal(
    await lab.locator('[data-testid="physics-active-cad-readings"] dd').count(),
    4,
    'the lab must show live active-CAD position, velocity, speed and trace readings',
  )
  const events = await lab.locator('.physics-lab-events').last().innerText()
  assert.match(events, /CAD (?:實體|碎片)/, 'the active CAD body or its post-failure fragments must participate in the rigid-body world')
  assert.match(events, /↔/, 'collision history must come from a real Rapier collider pair, not only a height heuristic')
  assert.equal(
    await lab.locator('[data-testid="physics-cad-impact-readings"] dd').count(),
    3,
    'a CAD collision must expose its Rapier peak-contact time, counterpart and force for FEA transfer',
  )
  const autoImpactTransfer = lab.locator('[data-testid="physics-transfer-impact-load-auto-cantilever"]')
  assert.equal(await autoImpactTransfer.isVisible(), true)
  await autoImpactTransfer.click()
  await lab.getByText('Rapier 單點衝擊峰值', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 })
  const runPeakFea = lab.locator('[data-testid="physics-run-peak-fea"]')
  assert.equal(await runPeakFea.isDisabled(), false, 'the automatic support/load hand-off must make the peak FEA runnable inside Physics Lab')
  await runPeakFea.click()
  await lab.locator('[data-testid="physics-peak-fea-verdict"]').waitFor({ state: 'visible', timeout: 60000 })
  assert.equal(
    await lab.locator('[data-testid="physics-peak-fea-verdict"] dd').count(),
    7,
    'peak-load FEA must publish material, stress, yield, safety factor, displacement, verdict and convergence',
  )
  const transientDownloadPromise = page.waitForEvent('download')
  await lab.getByRole('button', { name: '報告' }).click()
  const transientReport = JSON.parse(await readFile(await (await transientDownloadPromise).path(), 'utf8'))
  assert.equal(transientReport.settings?.activeCadFlight?.transientMaterial?.enabled, true)
  assert.equal(transientReport.settings?.activeCadFlight?.transientMaterial?.materialId, 'abs')
  assert.equal(
    transientReport.settings?.activeCadFlight?.transientMaterial?.model,
    'cad-local-signed-kelvin-voigt-bilinear-elastoplastic-cumulative-damage-reduced-order',
  )
  assert.ok(transientReport.activeCadTransientMaterialState?.maxStressPa > 0, 'a measured Rapier impact must drive non-zero transient stress')
  assert.ok(Number.isFinite(transientReport.activeCadTransientMaterialState?.damage))
  assert.ok(Number.isFinite(transientReport.activeCadTransientMaterialState?.cumulativePlasticStrain))
  assert.ok(Number.isFinite(transientReport.activeCadTransientMaterialState?.plasticWorkJ))
  assert.ok(Number.isInteger(transientReport.activeCadTransientMaterialState?.loadReversals))
  assert.match(transientReport.activeCadTransientMaterialState?.loadAxis, /^[xyz]$/)
  assert.ok(Math.abs(Math.hypot(...transientReport.activeCadTransientMaterialState.loadDirectionLocal) - 1) < 1e-6)
  assert.equal(transientReport.settings?.activeCadFlight?.transientMaterial?.fracture?.enabled, true)
  assert.equal(transientReport.settings?.activeCadFlight?.transientMaterial?.fracture?.fragments, 4)
  assert.equal(transientReport.activeCadFractureEvents?.length, 1, 'crossing the configured utilization threshold must fracture exactly once')
  assert.equal(transientReport.activeCadFractureEvents?.[0]?.fragmentCount, 4)
  assert.ok(transientReport.activeCadFractureEvents?.[0]?.strengthUtilization > 0)

  // First prove the normal gravity/contact chain. Then enable the flight model
  // on the same imported CAD body and check its live telemetry/report path.
  await lab.locator('.physics-lab-header-actions .primary').click()
  await lab.locator('[data-testid="physics-cad-flight-enabled"]').check()
  await setRange('physics-cad-thrust-n', '200')
  await setRange('physics-cad-battery-capacity', '600')
  await setRange('physics-cad-max-rotor-thrust', '900')
  await setRange('physics-cad-motor-time-constant', '0.12')
  await setRange('physics-cad-electrical-efficiency', '0.88')
  await setRange('physics-cad-rotor-disk-area', '0.08')
  await setRange('physics-cad-avionics-power', '20')
  await lab.getByRole('button', { name: '儲存目前設定' }).click()
  await setRange('physics-cad-battery-capacity', '700')
  await lab.getByRole('button', { name: '回復儲存設定' }).click()
  assert.equal(await lab.locator('[data-testid="physics-cad-battery-capacity"]').inputValue(), '600')
  assert.equal(await lab.locator('[data-testid="physics-cad-max-rotor-thrust"]').inputValue(), '900')
  await setRange('physics-cad-lift-coefficient', '1.1')
  await setRange('physics-cad-drag-coefficient', '0.12')
  await setRange('physics-cad-reference-area', '0.5')
  await setRange('physics-obstacle-count', '3')
  await setRange('physics-cad-start-x', '0.5')
  await setRange('physics-cad-start-height', '0.8')
  await setRange('physics-cad-start-z', '2.3')
  await setRange('physics-cad-start-vx', '0')
  await setRange('physics-cad-start-vz', '0')
  await lab.locator('[data-testid="physics-cad-altitude-hold-enabled"]').check()
  await setRange('physics-cad-target-altitude', '0.8')
  await lab.locator('[data-testid="physics-cad-waypoint-enabled"]').check()
  await setRange('physics-cad-waypoint-x', '-3')
  await setRange('physics-cad-waypoint-z', '2.3')
  await lab.locator('[data-testid="physics-cad-waypoint-add"]').click()
  await setRange('physics-cad-waypoint-x', '-1')
  await setRange('physics-cad-waypoint-z', '1')
  await lab.locator('[data-testid="physics-cad-waypoint-add"]').click()
  await lab.locator('[data-testid="physics-cad-waypoint-loop"]').check()
  await lab.locator('[data-testid="physics-cad-obstacle-avoidance-enabled"]').check()
  await lab.locator('[data-testid="physics-cad-raycast-avoidance-enabled"]').check()
  await lab.locator('[data-testid="physics-cad-dynamic-replan-enabled"]').check()
  await lab.locator('[data-testid="physics-cad-train-navigation-policy"]').click()
  assert.doesNotMatch(
    await lab.locator('[data-testid="physics-cad-navigation-policy-status"]').innerText(),
    /尚未訓練/,
    'browser-side evolutionary policy search must produce an applied policy before simulation starts',
  )
  await page.waitForTimeout(500)
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForTimeout(2500)
  assert.equal(
    await lab.locator('[data-testid="physics-cad-flight-readings"] dd').count(),
    15,
    'enabled CAD flight must publish aero, navigation, four-motor and battery state',
  )
  const autoFeaTransfer = lab.locator('[data-testid="physics-transfer-flight-load-auto-cantilever"]')
  assert.equal(await autoFeaTransfer.isDisabled(), false, 'a measured peak flight load must be transferable to explicit automatic FEA support assumptions')
  await autoFeaTransfer.click()
  await lab.getByText('已用「自動懸臂」建立假設支撐／受力面', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 })
  const downloadPromise = page.waitForEvent('download')
  await lab.getByRole('button', { name: '報告' }).click()
  const download = await downloadPromise
  const report = JSON.parse(await readFile(await download.path(), 'utf8'))
  assert.deepEqual(report.activeCadBody?.source, 'cad', 'report must prove that the active WebCAD solid, not the fallback fixture, was loaded')
  assert.equal(report.activeCadBody?.collider, 'convex-hull')
  assert.equal(report.activeCadBody?.bodyMode, 'dynamic')
  assert.ok(report.activeCadBody?.meshVertexCount > 0)
  assert.deepEqual(report.activeCadBody?.finalStateM?.positionM?.length, 3)
  assert.deepEqual(report.activeCadBody?.finalStateM?.velocityMps?.length, 3)
  assert.ok(report.activeCadTraceM?.length > 1, 'the active CAD body must export its own motion trace')
  assert.ok(report.activeCadTelemetryTrace?.length > 1, 'the active CAD report must retain time-stamped position, velocity and control samples')
  assert.ok(Number.isFinite(report.activeCadTelemetryTrace?.[0]?.atS))
  assert.deepEqual(report.activeCadTelemetryTrace?.[0]?.positionM?.length, 3)
  assert.deepEqual(report.activeCadTelemetryTrace?.[0]?.velocityMps?.length, 3)
  assert.ok(
    report.collisionEvents?.some((event) => Number.isFinite(event.forceN) && event.forceN > 0),
    'the exported report must include at least one Rapier contact-force measurement in newtons',
  )
  assert.deepEqual(report.settings?.activeCadStartPositionM, [0.5, 0.8, 2.3])
  assert.deepEqual(report.settings?.activeCadStartVelocityMps, [0, 0, 0])
  assert.equal(report.settings?.activeCadFlight?.enabled, true)
  assert.equal(report.settings?.activeCadFlight?.thrustN, 200)
  assert.equal(report.settings?.activeCadFlight?.referenceAreaM2, 0.5)
  assert.deepEqual(report.settings?.activeCadFlight?.altitudeHold, { enabled: true, targetAltitudeM: 0.8 })
  assert.deepEqual(report.settings?.activeCadFlight?.waypoint, {
    enabled: true,
    targetX: -1,
    targetZ: 1,
    route: [{ x: -3, z: 2.3 }, { x: -1, z: 1 }],
    loop: true,
    activeIndex: report.activeCadFlightTelemetry?.waypointIndex,
    completed: report.activeCadFlightTelemetry?.waypointCompleted,
  })
  assert.deepEqual(report.settings?.activeCadFlight?.obstacleAvoidance, { enabled: true, scope: 'procedural-fixed-cubes-only' })
  assert.deepEqual(report.settings?.activeCadFlight?.raycastAvoidance, {
    enabled: true,
    scope: 'all-collision-enabled-bodies-except-active-and-room',
  })
  assert.deepEqual(report.settings?.activeCadFlight?.dynamicReplanning, {
    enabled: true,
    strategy: 'three-ray-clearer-side-temporary-detour',
    triggerDistanceM: 1.8,
    cooldownS: 0.75,
  })
  const learnedPolicy = report.settings?.activeCadFlight?.learnedNavigationPolicy
  assert.equal(learnedPolicy?.method, 'deterministic-evolutionary-search-on-2d-surrogate')
  assert.equal(learnedPolicy?.appliedTo, 'rapier-3d-flight-waypoint-and-avoidance-controller')
  assert.ok(learnedPolicy?.training?.trainedScore >= learnedPolicy?.training?.baselineScore)
  assert.ok(Number.isFinite(learnedPolicy?.policy?.navigationGain))
  assert.ok(Number.isFinite(learnedPolicy?.policy?.avoidanceGain))
  assert.ok(Number.isFinite(learnedPolicy?.policy?.dampingGain))
  assert.equal(report.activeCadFlightTelemetry?.thrustN, 200)
  assert.equal(report.settings?.activeCadFlight?.propulsionModel, 'four-rotor-bounded-wrench-allocation-body-plus-y-thrust')
  assert.equal(report.settings?.activeCadFlight?.maxRotorThrustN, 900)
  assert.equal(report.settings?.activeCadFlight?.batteryCapacityWh, 600)
  assert.equal(report.settings?.activeCadFlight?.motorTimeConstantS, 0.12)
  assert.equal(report.settings?.activeCadFlight?.electricalEfficiency, 0.88)
  assert.equal(report.settings?.activeCadFlight?.rotorDiskAreaM2, 0.08)
  assert.equal(report.settings?.activeCadFlight?.avionicsPowerW, 20)
  assert.equal(report.activeCadFlightTelemetry?.rotorThrustN?.length, 4)
  assert.ok(report.activeCadFlightTelemetry?.rotorThrustN?.every((value) => Number.isFinite(value) && value >= 0 && value <= 900))
  assert.ok(report.activeCadFlightTelemetry?.bodyTorqueNm?.every(Number.isFinite))
  assert.equal(typeof report.activeCadFlightTelemetry?.motorSaturated, 'boolean')
  assert.equal(report.settings?.activeCadFlight?.energyModel, 'first-order-motor-plus-momentum-theory-induced-power')
  assert.ok(report.activeCadFlightTelemetry?.electricalPowerW > 0)
  assert.ok(report.activeCadFlightTelemetry?.batteryRemainingWh < 600)
  assert.ok(report.activeCadFlightTelemetry?.batteryStateOfCharge > 0 && report.activeCadFlightTelemetry?.batteryStateOfCharge < 1)
  assert.ok(report.activeCadFlightTelemetry?.estimatedEnduranceS > 0)
  assert.equal(report.activeCadFlightTelemetry?.batteryDepleted, false)
  assert.ok(Number.isFinite(report.activeCadFlightTelemetry?.airspeedMps))
  assert.equal(report.activeCadFlightTelemetry?.altitudeHoldEnabled, true)
  assert.ok(Number.isFinite(report.activeCadFlightTelemetry?.commandedThrustN))
  assert.equal(report.activeCadFlightTelemetry?.waypointEnabled, true)
  assert.ok(Number.isFinite(report.activeCadFlightTelemetry?.waypointDistanceM))
  assert.equal(report.activeCadFlightTelemetry?.waypointCount, 2)
  assert.ok([0, 1].includes(report.activeCadFlightTelemetry?.waypointIndex))
  assert.equal(typeof report.activeCadFlightTelemetry?.waypointCompleted, 'boolean')
  assert.equal(report.activeCadFlightTelemetry?.obstacleAvoidanceEnabled, true)
  assert.ok(Number.isFinite(report.activeCadFlightTelemetry?.nearestObstacleDistanceM))
  assert.equal(report.activeCadFlightTelemetry?.raycastAvoidanceEnabled, true)
  assert.ok(report.activeCadFlightTelemetry?.replanCount > 0, 'an obstacle directly on the route must trigger a recorded detour')
  assert.ok(report.activeCadReplanDecisions?.length > 0, 'the report must retain dynamic replanning decisions')
  assert.equal(report.activeCadReplanDecisions?.[0]?.waypointIndex, 0)
  assert.ok(Number.isFinite(report.activeCadReplanDecisions?.[0]?.obstacleDistanceM))
  assert.ok(
    report.activeCadFlightTelemetry?.nearestColliderDistanceM == null ||
      Number.isFinite(report.activeCadFlightTelemetry.nearestColliderDistanceM),
    'raycast avoidance distance must be null when clear or a finite measured hit distance',
  )
  assert.equal(report.linkedStaticPeakLoadFea?.analysis, 'static-equivalent-peak-load-linear-elastic-fea')
  assert.ok(Number.isFinite(report.linkedStaticPeakLoadFea?.maxVonMisesMPa))
  assert.ok(Number.isFinite(report.linkedStaticPeakLoadFea?.maxDisplacementMm))

  // The same WebCAD body can become a fixed collision fixture (for a floor,
  // obstacle or jig) without changing the underlying CAD-to-collider path.
  await lab.locator('[data-testid="physics-cad-body-mode"]').selectOption('fixed')
  await page.waitForTimeout(150)
  const reportButton = lab.locator('.physics-lab-header-actions button').nth(2)
  assert.equal(await reportButton.isDisabled(), false, 'report remains available after rebuilding the fixed fixture')
  const fixedReportDownload = page.waitForEvent('download')
  await reportButton.click()
  const fixedReport = JSON.parse(await readFile(await (await fixedReportDownload).path(), 'utf8'))
  assert.equal(fixedReport.activeCadBody?.bodyMode, 'fixed')
  assert.equal(fixedReport.settings?.activeCadBodyMode, 'fixed')

  // A long-duration engineering scenario must be able to advance deterministic
  // 120 Hz physics much faster than wall-clock time and stop at an exact target.
  // Pause the preceding live run before rebuilding the same CAD solid as dynamic.
  await lab.locator('.physics-lab-header-actions .primary').click()
  await lab.locator('[data-testid="physics-cad-body-mode"]').selectOption('dynamic')
  await lab.locator('[data-testid="physics-cad-flight-enabled"]').uncheck()
  await lab.locator('[data-testid="physics-cad-fracture-enabled"]').uncheck()
  await lab.locator('[data-testid="physics-cad-transient-enabled"]').uncheck()
  await lab.locator('[data-testid="physics-fast-forward-enabled"]').check()
  await setRange('physics-fast-forward-steps', '240')
  await setRange('physics-stop-at-seconds', '2')
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? ''
    return Number.parseFloat(value) >= 2
  }, undefined, { timeout: 30000 })
  await page.waitForTimeout(100)
  const batchReportDownload = page.waitForEvent('download')
  await reportButton.click()
  const batchReport = JSON.parse(await readFile(await (await batchReportDownload).path(), 'utf8'))
  assert.deepEqual(batchReport.settings?.acceleratedBatch, {
    enabled: true,
    fixedStepsPerFrame: 240,
    targetSimulationSeconds: 2,
    physicsTimestepHz: 120,
  })
  assert.ok(batchReport.elapsedSimulationS >= 2 && batchReport.elapsedSimulationS < 2.02)
  assert.equal(batchReport.activeCadBody?.bodyMode, 'dynamic')
  assert.equal(errors.length, 0, `page errors: ${errors.join('\n')}`)
  console.log(JSON.stringify({ ok: true, target: baseURL, physicsLabActiveCad: 'solid-created-and-loaded-as-convex-rigid-body' }))
} finally {
  await browser.close()
}
