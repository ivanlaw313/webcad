import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Vite resolves extensionless local TypeScript imports.  Node's ESM test
// runner deliberately does not, so use this loader only for test commands.
// It keeps source imports browser-compatible while making the full suite run
// under the same command on Windows and CI.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (!context.parentURL || !/^\.\.?\//.test(specifier) || /[?#]/.test(specifier)) throw error
    const candidate = new URL(specifier, context.parentURL)
    if (path.extname(candidate.pathname)) throw error
    const tsPath = `${fileURLToPath(candidate)}.ts`
    if (!existsSync(tsPath)) throw error
    return { url: pathToFileURL(tsPath).href, shortCircuit: true }
  }
}
