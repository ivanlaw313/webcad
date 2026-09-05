import { register } from 'node:module'

// Node's supported registration entry point for the test-only TypeScript
// resolver.  Keeping it separate avoids the deprecated --experimental-loader
// warning in local runs and CI.
register('./ts-resolver.mjs', import.meta.url)
