/* Production acceptance for a WebCAD-created SOLID used as a driven ground
 * vehicle/robot in the Physics Lab. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium, firefox } from 'playwright'

const baseURL = (process.argv[2] ?? 'https://cad.neuralworkshk.com').replace(/\/$/, '')
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browserName = process.env.E2E_BROWSER ?? 'chromium'
const browser = browserName === 'firefox'
  ? await firefox.launch({ headless: true })
  : await chromium.launch({ headless: true, executablePath })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('[data-ribbon-group="CREATE"]').waitFor({ state: 'visible', timeout: 60000 })

  await page.locator('[data-ribbon-group="CREATE"]').click()
  await page.locator('.panel-menu-item[data-cmd="box"]').click()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor({ state: 'visible', timeout: 30000 })
  const dimensions = dialog.locator('input[inputmode="decimal"]')
  await dimensions.nth(0).fill('400')
  await dimensions.nth(1).fill('300')
  await dimensions.nth(2).fill('200')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden', timeout: 30000 })

  // Kernel meshing is asynchronous. Wait for the active-solid bullet, which
  // appears only after bodyMesh has reached the shared store, before opening
  // Physics Lab and taking its simulation snapshot.
  await page.locator('.browser .tree-row', { hasText: '●' }).waitFor({
    state: 'visible',
    timeout: 60000,
  })

  await page.locator('.ribbon-tab', { hasText: '實驗室' }).click()
  await page.locator('[data-cmd="physicslab"]').click()
  const lab = page.locator('.physics-lab')
  await lab.waitFor({ state: 'visible', timeout: 30000 })
  const setRange = async (testId, value) => {
    const input = lab.locator(`[data-testid="${testId}"]`)
    await input.fill(String(value))
    assert.equal(await input.inputValue(), String(value))
  }

  await setRange('physics-cad-start-height', '0.3')
  await setRange('physics-cad-start-x', '0')
  await lab.locator('[data-testid="physics-cad-ground-enabled"]').check()
  await setRange('physics-cad-ground-target-speed', '2')
  await setRange('physics-cad-ground-drive-force', '500')
  await setRange('physics-cad-ground-brake-force', '800')
  await setRange('physics-cad-ground-steering', '0')
  await setRange('physics-cad-ground-steering-torque', '250')
  await lab.locator('[data-testid="physics-fast-forward-enabled"]').check()
  await setRange('physics-fast-forward-steps', '240')
  // Keep the drive acceptance inside the room's clear run. Wall-impact and
  // post-impact airborne states belong to the separate collision acceptance.
  await setRange('physics-stop-at-seconds', '2')
  await page.waitForTimeout(750)
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? ''
    return Number.parseFloat(value) >= 2
  }, undefined, { timeout: 30000 })
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="physics-cad-ground-readings"] dd')?.textContent === '是',
    undefined,
    { timeout: 10000 },
  )

  const readings = lab.locator('[data-testid="physics-cad-ground-readings"] dd')
  assert.equal(await readings.count(), 10)
  const readingValues = await readings.allInnerTexts()
  assert.equal(readingValues[0], '是', `tyre force must be backed by actual ground contact: ${readingValues.join(' | ')}`)
  if (!(Number.parseFloat(readingValues[1]) > 0.1)) {
    const diagnosticDownloadPromise = page.waitForEvent('download')
    await lab.locator('.physics-lab-header-actions button').nth(2).click()
    const diagnosticDownload = await diagnosticDownloadPromise
    const diagnosticReport = JSON.parse(await readFile(await diagnosticDownload.path(), 'utf8'))
    assert.fail(`CAD body did not gain forward speed: ${JSON.stringify({
      readings: readingValues,
      elapsedSimulationS: diagnosticReport.elapsedSimulationS,
      activeCadBody: diagnosticReport.activeCadBody,
      activeCadGroundTelemetry: diagnosticReport.activeCadGroundTelemetry,
      traceHead: diagnosticReport.activeCadTelemetryTrace?.slice(0, 5),
      traceTail: diagnosticReport.activeCadTelemetryTrace?.slice(-5),
    })}`)
  }
  assert.ok(Number.parseFloat(readingValues[1]) > 0.1, `the CAD body must gain forward speed: ${readingValues.join(' | ')}`)
  assert.ok(Number.isFinite(Number.parseFloat(await readings.nth(4).innerText())))
  assert.ok(Number.isFinite(Number.parseFloat(await readings.nth(6).innerText())))

  const reportButton = lab.locator('.physics-lab-header-actions button').nth(2)
  await page.waitForFunction(() => {
    const button = document.querySelector('.physics-lab-header-actions button:nth-child(3)')
    return button instanceof HTMLButtonElement && !button.disabled
  })
  const downloadPromise = page.waitForEvent('download')
  await reportButton.click()
  const reportDownload = await downloadPromise
  const report = JSON.parse(await readFile(await reportDownload.path(), 'utf8'))
  assert.equal(report.activeCadBody?.source, 'cad')
  assert.equal(report.settings?.activeCadGroundVehicle?.enabled, true)
  assert.equal(report.settings?.activeCadGroundVehicle?.targetSpeedMps, 2)
  assert.equal(report.settings?.activeCadGroundVehicle?.tyreForceRequiresGroundContact, true)
  assert.equal(report.activeCadGroundTelemetry?.grounded, true)
  assert.ok(report.activeCadGroundTelemetry?.forwardSpeedMps > 0.1)
  assert.ok(Number.isFinite(report.activeCadGroundTelemetry?.mechanicalPowerW))
  assert.ok(report.activeCadTelemetryTrace?.some((sample) =>
    sample.ground?.grounded && sample.ground?.driveForceN > 0
  ), 'the recorded run must contain contact-backed drive force')
  assert.equal(report.settings?.acceleratedBatch?.physicsTimestepHz, 120)

  // Reuse the same WebCAD SOLID as a ground robot. Its path crosses a real
  // Rapier obstacle, so the fan ray must create and record an XZ-plane detour.
  await lab.locator('.physics-lab-header-actions button').nth(1).click()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? ''
    return Number.parseFloat(value) === 0
  })
  await setRange('physics-cad-start-x', '-5')
  await setRange('physics-cad-start-z', '2.3')
  await setRange('physics-cad-ground-target-speed', '1')
  await setRange('physics-obstacle-count', '1')
  await lab.locator('[data-testid="physics-cad-waypoint-enabled"]').check()
  await setRange('physics-cad-waypoint-x', '0')
  await setRange('physics-cad-waypoint-z', '2.3')
  await lab.locator('[data-testid="physics-cad-obstacle-avoidance-enabled"]').check()
  await lab.locator('[data-testid="physics-cad-raycast-avoidance-enabled"]').check()
  await lab.locator('[data-testid="physics-cad-dynamic-replan-enabled"]').check()
  const trainPolicy = lab.locator('[data-testid="physics-cad-train-navigation-policy"]')
  assert.equal(await trainPolicy.isDisabled(), false, 'ground robots must be able to train the shared XZ navigation policy')
  await trainPolicy.click()
  assert.doesNotMatch(
    await lab.locator('[data-testid="physics-cad-navigation-policy-status"]').innerText(),
    /尚未訓練/,
  )
  const trainRl = lab.locator('[data-testid="physics-cad-train-rl-navigation"]')
  assert.equal(await trainRl.isDisabled(), false)
  await trainRl.click()
  assert.match(
    await lab.locator('[data-testid="physics-cad-rl-navigation-status"]').innerText(),
    /真 Q-learning：1200 episodes.*正在控制真 Rapier CAD 地面車/,
  )
  await page.waitForTimeout(750)
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? ''
    return Number.parseFloat(value) >= 2
  }, undefined, { timeout: 30000 })
  await page.waitForFunction(() =>
    /累計重規劃 [1-9]\d* 次/.test(
      document.querySelector('[data-testid="physics-cad-replan-status"]')?.textContent ?? '',
    ), undefined, { timeout: 10000 })
  const replanStatus = await lab.locator('[data-testid="physics-cad-replan-status"]').innerText()
  await page.waitForFunction(() => {
    const button = document.querySelector('.physics-lab-header-actions button:nth-child(3)')
    return button instanceof HTMLButtonElement && !button.disabled
  })
  const avoidanceDownloadPromise = page.waitForEvent('download')
  await reportButton.click()
  const avoidanceDownload = await avoidanceDownloadPromise
  const avoidanceReport = JSON.parse(await readFile(await avoidanceDownload.path(), 'utf8'))
  assert.match(
    replanStatus,
    /累計重規劃 [1-9]\d* 次/,
    `ground robot must publish a real raycast-triggered detour: ${JSON.stringify({
      telemetry: avoidanceReport.activeCadGroundTelemetry,
      decisions: avoidanceReport.activeCadReplanDecisions,
      state: avoidanceReport.activeCadState,
    })}`,
  )
  assert.ok(avoidanceReport.activeCadReplanDecisions?.length > 0)
  assert.equal(avoidanceReport.activeCadGroundTelemetry?.raycastAvoidanceEnabled, true)
  assert.ok(Number.isFinite(avoidanceReport.activeCadReplanDecisions?.[0]?.obstacleDistanceM))
  assert.equal(
    avoidanceReport.settings?.activeCadFlight?.learnedNavigationPolicy?.appliedTo,
    'rapier-ground-vehicle-xz-waypoint-and-avoidance-controller',
  )
  assert.ok(avoidanceReport.settings?.activeCadFlight?.learnedNavigationPolicy?.training)
  const rl = avoidanceReport.settings?.activeCadGroundVehicle?.reinforcementLearning
  assert.equal(rl?.enabled, true)
  assert.equal(rl?.appliedTo, 'rapier-ground-vehicle-runtime-steering-and-speed')
  assert.equal(rl?.policy?.algorithm, 'tabular-q-learning')
  assert.equal(rl?.policy?.q?.length, 96)
  assert.ok(rl?.policy?.evaluationSuccessRate >= 0.45)

  // The same WebCAD-created solid must be able to run on visible, real Rapier
  // terrain colliders while the lab measures passability and falls.
  await lab.locator('.physics-lab-header-actions button').nth(1).click()
  await page.waitForFunction(() => Number.parseFloat(
    document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? '',
  ) === 0)
  await setRange('physics-cad-start-x', '0')
  await setRange('physics-cad-start-z', '0')
  await setRange('physics-cad-ground-target-speed', '0.7')
  await setRange('physics-obstacle-count', '0')
  await lab.locator('[data-testid="physics-cad-waypoint-enabled"]').uncheck()
  await lab.locator('[data-testid="physics-uneven-terrain-enabled"]').check()
  await setRange('physics-terrain-roughness', '0.08')
  await setRange('physics-robot-fall-tilt', '60')
  await setRange('physics-stop-at-seconds', '3')
  await page.waitForTimeout(750)
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForFunction(() => Number.parseFloat(
    document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? '',
  ) >= 3, undefined, { timeout: 30000 })
  const terrainReadings = lab.locator('[data-testid="physics-robot-terrain-readings"] dd')
  assert.equal(await terrainReadings.count(), 8)
  const terrainValues = await terrainReadings.allInnerTexts()
  assert.match(terrainValues[0], /啟用 · 81 塊 · 粗糙度 0\.08 m/)
  for (const index of [1, 2, 3, 4, 5]) {
    assert.ok(Number.isFinite(Number.parseFloat(terrainValues[index])), `terrain telemetry ${index} must be finite`)
  }
  const terrainDownloadPromise = page.waitForEvent('download')
  await reportButton.click()
  const terrainDownload = await terrainDownloadPromise
  const terrainReport = JSON.parse(await readFile(await terrainDownload.path(), 'utf8'))
  assert.equal(terrainReport.settings?.activeCadGroundVehicle?.terrainTest?.enabled, true)
  assert.equal(terrainReport.settings?.activeCadGroundVehicle?.terrainTest?.deterministicTiles, 81)
  assert.equal(terrainReport.settings?.activeCadGroundVehicle?.terrainTest?.roughnessM, 0.08)
  assert.equal(terrainReport.activeCadRobotTerrainTelemetry?.terrainEnabled, true)
  assert.ok(Number.isFinite(terrainReport.activeCadRobotTerrainTelemetry?.tiltDeg))
  assert.ok(Number.isFinite(terrainReport.activeCadRobotTerrainTelemetry?.distanceFromStartM))

  // Accelerated endurance acceptance: the same imported solid must stay
  // finite for a full simulated minute and telemetry storage must stay bounded.
  await lab.locator('.physics-lab-header-actions button').nth(1).click()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? ''
    return Number.parseFloat(value) === 0
  })
  await lab.locator('[data-testid="physics-cad-waypoint-enabled"]').uncheck()
  await lab.locator('[data-testid="physics-uneven-terrain-enabled"]').uncheck()
  await setRange('physics-cad-ground-target-speed', '0')
  await setRange('physics-stop-at-seconds', '60')
  await page.waitForTimeout(750)
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? ''
    return Number.parseFloat(value) >= 60
  }, undefined, { timeout: 30000 })
  await page.waitForFunction(() => {
    const button = document.querySelector('.physics-lab-header-actions button:nth-child(3)')
    return button instanceof HTMLButtonElement && !button.disabled
  })
  const enduranceDownloadPromise = page.waitForEvent('download')
  await reportButton.click()
  const enduranceDownload = await enduranceDownloadPromise
  const enduranceReport = JSON.parse(await readFile(await enduranceDownload.path(), 'utf8'))
  assert.ok(Math.abs(enduranceReport.elapsedSimulationS - 60) <= 1 / 120 + 1e-6)
  assert.ok(enduranceReport.activeCadTelemetryTrace?.length > 0)
  assert.ok(enduranceReport.activeCadTelemetryTrace?.length <= 1200)
  for (const sample of enduranceReport.activeCadTelemetryTrace ?? []) {
    for (const value of [
      ...(sample.positionM ?? []),
      ...(sample.velocityMps ?? []),
      ...(sample.ground?.forceWorldN ?? []),
      ...(sample.ground?.torqueWorldNm ?? []),
    ]) assert.ok(Number.isFinite(value), '60-second CAD telemetry must remain finite')
  }
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('\n')}`)
  console.log(JSON.stringify({ ok: true, target: baseURL, physicsLabGroundVehicle: 'cad-solid-driven-on-contact-at-120hz' }))
} finally {
  await browser.close()
}
