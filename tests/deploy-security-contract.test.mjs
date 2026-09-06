import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

test('authentication chooses key, password, or refuses absent credentials without network access', () => {
  const result = execFileSync('python3', ['-c', `
from _deploy_auth import select_auth
assert select_auth({'WEBCAD_VPS_PASSWORD':'test-only'}, lambda _: True, lambda p:p) == {'key_filename':'~/.ssh/nfe_deploy_ed25519'}
assert select_auth({'WEBCAD_VPS_PASSWORD':'test-only'}, lambda _: False) == {'password':'test-only'}
for env in ({}, {'WEBCAD_VPS_PASSWORD':''}):
    try: select_auth(env, lambda _: False)
    except RuntimeError: pass
    else: raise AssertionError('missing credentials accepted')
print('PASS key priority, password fallback, absent and empty credentials')
`], {cwd:new URL('..', import.meta.url), encoding:'utf8'})
  assert.match(result, /PASS/)
})
test('both deployment entry points use the same runtime auth contract', () => {
  for (const script of ['_redeploy.py', '_redeploy_fast.py']) {
    const deploy = readFileSync(new URL(`../${script}`, import.meta.url), 'utf8')
    assert.match(deploy, /from _deploy_auth import select_auth/)
    assert.match(deploy, /AUTH = select_auth\(\)/)
    assert.match(deploy, /ssh\.connect\([^\n]*\*\*AUTH/)
    assert.doesNotMatch(deploy, /password\s*=\s*["'][^"']+["']/)
  }
})
