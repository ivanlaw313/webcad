/**
 * FISHING54: Formal TC store leftovers (demo names / FEA-mold / params) + regressions.
 * Skip MATERIALS/DENSITY_PREF storage keys; skip '质量' compat; skip JOINT_LABEL SC keep;
 * skip names.ts dual sc/tc; skip aeroI18n/brief keywords.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const st = read('src/store.ts')
const i18n = read('src/i18n.ts')
const css = read('src/index.css')
const sk = read('src/components/SketchLayer.tsx')
const tools = read('src/ai/tools.ts')
const analyses = read('src/cad/analysesModel.ts')

test('FISHING54 store demo assembly names Formal', () => {
  assert.match(st, /太陽輪 z\$\{zs\}/)
  assert.match(st, /內齒圈 z\$\{zr\}/)
  assert.match(st, /行星輪\$\{k/)
  assert.match(st, /name: '齒條'/)
  assert.match(st, /name: '內圈'/)
  assert.match(st, /滾珠 ×\$\{N\}/)
  assert.match(st, /name: '連桿'/)
  assert.match(st, /name: '搖桿'/)
  assert.match(st, /大齒輪 z\$\{z1\}/)
  assert.match(st, /小齒輪 z\$\{z2\}/)
  assert.doesNotMatch(st, /太阳轮 z\$\{zs\}/)
  assert.doesNotMatch(st, /内齿圈 z\$\{zr\}/)
  assert.doesNotMatch(st, /name: '齿条'/)
  assert.doesNotMatch(st, /name: '摇杆'/)
  assert.doesNotMatch(st, /大齿轮 z\$\{z1\}/)
  // MATERIALS keys stay SC
  assert.match(st, /material: '钢'/)
  assert.match(st, /DENSITY_PREF = \['钢'/)
})

test('FISHING54 store FEA/mold/status Formal', () => {
  assert.match(st, /manifold 精確布爾/)
  assert.match(st, /整體翻外/)
  assert.match(st, /快捷鍵 /)
  assert.match(st, /個特徵/)
  assert.match(st, /展開圖/)
  assert.match(st, /收縮×/)
  assert.match(st, /自定義/)
  assert.match(st, /取消選/)
  assert.match(st, /加選/)
  assert.match(st, /geoSnap \? '開' : '關'/)
  assert.match(st, /DXF草圖/)
  assert.match(st, /'靜力'/)
  assert.match(st, /'模態'/)
  assert.match(st, /'熱'/)
  assert.match(st, /'體素化'/)
  assert.match(st, /'溫度場'/)
  assert.match(st, /'算應力'/)
  assert.match(st, /── 澆口 ──/)
  assert.match(st, /── 結果 ──/)
  assert.match(st, /── 假設 ──/)
  assert.match(st, /遲充填/)
  assert.match(st, /剛\(≥L\/360\)/)
  assert.match(st, /軟\(<L\/180\)/)
  assert.doesNotMatch(st, /精确布尔/)
  assert.doesNotMatch(st, /整体翻外/)
  assert.doesNotMatch(st, /（展开图）/)
  assert.doesNotMatch(st, /'── 浇口 ──'/)
  assert.doesNotMatch(st, /fillText\('迟充填'/)
  // 质量 compat keep
  assert.match(st, /r\.label === '質量' \|\| r\.label === '质量'/)
})

test('FISHING54 store sample params Formal + bindParam sync', () => {
  assert.match(st, /addParam\('長L'/)
  assert.match(st, /addParam\('寬W'/)
  assert.match(st, /addParam\('模數m'/)
  assert.match(st, /addParam\('齒數z'/)
  assert.match(st, /addParam\('折彎R'/)
  assert.match(st, /addParam\('寬D'/)
  assert.match(st, /addParam\('桿半徑r'/)
  assert.match(st, /addParam\('主半徑R'/)
  assert.match(st, /bindParam\(gid, 'module', '模數m'\)/)
  assert.match(st, /bindParam\(gid, 'teeth', '齒數z'\)/)
  assert.match(st, /bindParam\(sid, 'radius', '折彎R'\)/)
  assert.doesNotMatch(st, /addParam\('模数m'/)
  assert.doesNotMatch(st, /bindParam\(gid, 'module', '模数m'\)/)
  assert.doesNotMatch(st, /bindParam\(gid, 'teeth', '齿数z'\)/)
})

test('FISHING54 i18n + CSS freebie', () => {
  assert.match(i18n, /FISHING54 Formal TC store leftovers/)
  assert.match(i18n, /'太陽輪': 'Sun gear'/)
  assert.match(i18n, /'精確布爾': 'Exact boolean'/)
  assert.match(i18n, /'遲充填': 'Late fill'/)
  assert.match(css, /FISHING54: Fusion-like assembly-template/)
  assert.match(css, /\.asm-template-name/)
  assert.match(css, /\.fea-phase-chip/)
  assert.match(sk, /數字\/分數\/帶單位/)
  assert.doesNotMatch(sk, /数字\/分数\/带单位/)
})

test('FISHING54 regressions: F53 Formal + F52 zebra keep', () => {
  assert.match(tools, /建立長方體/)
  assert.match(tools, /倒圓角/)
  assert.doesNotMatch(tools, /建立长方体/)
  assert.match(analyses, /斑馬紋/)
  assert.match(analyses, /脫模可達性/)
  assert.doesNotMatch(analyses, /斑马纹/)
})
