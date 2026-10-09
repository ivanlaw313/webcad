// RETEST20 #3：CREATE ▾ 下拉嘅英文項（Derive / Automated Modeling / Boundary Fill / Create Base Feature / Create PCB）要有繁體標籤。
import test from 'node:test'
import assert from 'node:assert/strict'
const { ribbonCmdLabel, msg } = await import('../src/i18n.ts')

const HK = { derive: '衍生', automatedmodel: '自動建模', boundaryfill: '邊界填充', basefeature: '建立基礎特徵', createpcb: '建立 PCB' }
const CN = { derive: '衍生', automatedmodel: '自动建模', boundaryfill: '边界填充', basefeature: '创建基础特征', createpcb: '创建 PCB' }
const SRC = { derive: 'Derive', automatedmodel: 'Automated Modeling', boundaryfill: 'Boundary Fill', basefeature: 'Create Base Feature', createpcb: 'Create PCB' }

test('zh-HK CREATE ▾ labels are Traditional (dropdown uses ribbonCmdLabel(id, lang, ribbon label))', () => {
  for (const [id, want] of Object.entries(HK)) {
    assert.equal(ribbonCmdLabel(id, 'zh-HK', SRC[id]), want, id)
    assert.equal(msg(`cmd.${id}`, 'zh-HK'), want); assert.equal(msg(`tool.${id}`, 'zh-HK'), want)
  }
})
test('zh-CN gets the Simplified equivalents; English / Japanese unchanged', () => {
  for (const [id, want] of Object.entries(CN)) assert.equal(ribbonCmdLabel(id, 'zh-CN', SRC[id]), want, id)
  for (const [id, en] of Object.entries(SRC)) assert.equal(ribbonCmdLabel(id, 'en', en), en)
  assert.equal(ribbonCmdLabel('derive', 'ja', 'Derive'), '派生')
})
test('no zh-HK CREATE item label is English-only', () => {
  for (const id of Object.keys(HK)) {
    const lab = ribbonCmdLabel(id, 'zh-HK', SRC[id])
    assert.match(lab, /[\u4e00-\u9fff]/, `${id} → ${lab}`)
  }
})
