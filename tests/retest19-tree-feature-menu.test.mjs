// RETEST19 #7：瀏覽樹特徵行右鍵有 刪除／重新命名（同時間軸一樣：requestRemoveFeature 依賴警告、renameFeature）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { treeMenuKeys } from '../src/ui/contextMenus.ts'
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')

test('feature row menu keys: edit (when editable) / rename / suppress|unsuppress / delete', () => {
  assert.deepEqual(treeMenuKeys('feature', { canEdit: true }), ['editFeature', 'rename', 'suppress', 'sep', 'delete'])
  assert.deepEqual(treeMenuKeys('feature', { suppressed: true }), ['rename', 'unsuppress', 'sep', 'delete'])
})

test('FeatRow wires the menu to the timeline handlers', () => {
  const row = tree.slice(tree.indexOf('function FeatRow'), tree.indexOf('function GroupRow'))
  assert.match(row, /<div ref=\{rowRef\} onContextMenu=\{onFeatMenu\}/)
  assert.match(row, /openMenu\(e, 'feature'/)
  assert.match(row, /delete: \(\) => \{ if \(skDelGuard\(\)\) return; void useApp\.getState\(\)\.requestRemoveFeature\(f\.id\) \}/)
  assert.match(row, /rename: \(\) => \{ setName\(custom \|\| ''\); setEditing\(true\) \}/)
  assert.match(row, /useApp\.getState\(\)\.renameFeature\(f\.id, name\)/)
  assert.match(row, /selectFeature\(f\.id\)\n\s+openMenu/)
  for (const [k, zh] of [['editFeature', '編輯特徵'], ['suppress', '抑制'], ['unsuppress', '恢復'], ['rename', '重新命名'], ['delete', '刪除']]) assert.ok(tree.includes(`case '${k}': return L2('${zh}'`), k)
})
