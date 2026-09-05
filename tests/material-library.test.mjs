// material-library.test.mjs — S187 外观材质库 纯 CRUD + 钳制 + 持久守护
import { addPreset, removePreset, sanitizePreset, loadLibrary, saveLibrary } from '../src/render/materialLibrary.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

const P = (o) => ({ color: '#ff8800', metalness: 0.3, roughness: 0.6, opacity: 1, ...o });

// addPreset：加入 + 不可变（原 lib 不变）
let lib = {};
const lib1 = addPreset(lib, '黄铜', P({ metalness: 0.9 }));
ok(lib1['黄铜'] && lib1['黄铜'].metalness === 0.9, 'addPreset 加入 黄铜');
ok(Object.keys(lib).length === 0, 'addPreset 不可变（原 lib 不变）');
const lib2 = addPreset(lib1, '塑料', P({ metalness: 0.05, roughness: 0.8 }));
ok(Object.keys(lib2).length === 2, '两个预设并存');

// 空名 = no-op（返回原对象）
ok(addPreset(lib2, '  ', P({})) === lib2, '空白名 → no-op 返回原对象');

// removePreset
const lib3 = removePreset(lib2, '黄铜');
ok(!('黄铜' in lib3) && '塑料' in lib3, 'removePreset 删 黄铜 留 塑料');
ok('黄铜' in lib2, 'removePreset 不可变（原 lib2 仍有 黄铜）');
ok(removePreset(lib2, '唔存在') === lib2, '删不存在 → 返回原对象');

// sanitizePreset：钳制 [0,1] + 坏色退默认 + texScale 守护
const s = sanitizePreset({ color: 'bad', metalness: 5, roughness: -2, opacity: 9, tex: 'wood', texScale: -3 });
ok(s.metalness === 1 && s.roughness === 0 && s.opacity === 1, `钳制 metalness=1 roughness=0 opacity=1 (实际 ${s.metalness}/${s.roughness}/${s.opacity})`);
ok(s.color === '#4a7296', `坏色退高对比默认 (实际 ${s.color})`);
ok(s.tex === 'wood' && !('texScale' in s), 'tex 保留、负 texScale 丢弃');
const s2 = sanitizePreset({ color: '#aabbcc', metalness: 0.4, roughness: 0.4, opacity: 0.5, texScale: 20 });
ok(s2.color === '#aabbcc' && s2.texScale === 20 && !('tex' in s2), '正常值原样 + 正 texScale 保留 + 无 tex 不带 tex');

// addPreset 经 sanitize：越界值入库被钳
const lib4 = addPreset({}, 'x', P({ metalness: 9, opacity: -1 }));
ok(lib4['x'].metalness === 1 && lib4['x'].opacity === 0, 'addPreset 经 sanitize 钳制入库值');

// loadLibrary：Node 无 localStorage → 守护返回 {}（唔炸）
ok(JSON.stringify(loadLibrary()) === '{}', 'loadLibrary 无 localStorage → {} (守护)');
// saveLibrary：无 localStorage 唔炸
let threw = false; try { saveLibrary(lib2); } catch { threw = true; }
ok(!threw, 'saveLibrary 无 localStorage 唔抛错 (守护)');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
