// T761（S40/③）：自编译 OCCT-WASM 内核（replicad yml 超集 + 11 个新符号组 — 见 _occt-build/custom_build_plus.yml）。
// 同 replicad-opencascadejs/src/replicad_single.js 完全同一 emscripten ESM factory 形状。
declare const init: (opts?: { locateFile?: (file: string) => string }) => Promise<any>
export default init
