import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('deployment credentials are injected at runtime and never embedded in either deploy script', () => {
  for (const script of ['_redeploy.py', '_redeploy_fast.py']) {
    const deploy = readFileSync(new URL(`../${script}`, import.meta.url), 'utf8')
    assert.match(deploy, /os\.environ\.get\("WEBCAD_VPS_PASSWORD"\)/, script)
    assert.match(deploy, /if not PASSWORD:/, script)
    assert.match(deploy, /password=PASSWORD/, script)
    assert.doesNotMatch(deploy, /password\s*=\s*["'][^"']+["']/, script)
  }
})
