// Ambient types so TS accepts the OCCT wasm glue import.
declare module 'replicad-opencascadejs/src/replicad_single.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const init: (opts?: { locateFile?: (file: string) => string }) => Promise<any>
  export default init
}
