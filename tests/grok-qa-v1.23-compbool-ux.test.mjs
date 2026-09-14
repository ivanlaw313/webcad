/**
 * v1.23 P0: Component Boolean dead-end UX — Fillet/Shell guide to MeshFit / edit-in-place /
 * 实体布尔; post-boolean bake offer; APP_VERSION 1.23; shell alt-open stays solid-checked.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.23', () => {
  assert.match(version, /APP_VERSION = '1\.23'/)
})

test('partSolidRequiredStatus helper guides mesh / component-boolean dead-end', () => {
  assert.match(store, /function partSolidRequiredStatus/)
  assert.match(store, /MeshFit\/转 B-rep/)
  assert.match(store, /实体布尔/)
  assert.match(store, /✎编辑/)
  assert.match(store, /组件布尔\/网格件/)
  assert.match(store, /零件时间轴实体/)
})

test('Fillet / Chamfer / Shell / FaceFillet use guided status (not bare 先要有实体)', () => {
  assert.match(store, /partSolidRequiredStatus\('圆角'/)
  assert.match(store, /partSolidRequiredStatus\('倒角'/)
  assert.match(store, /partSolidRequiredStatus\('抽壳'/)
  assert.match(store, /partSolidRequiredStatus\('面圆角'/)
  // Ribbon entry cases must not keep the dead-end bare toast.
  const filletCase = store.match(/case 'fillet':[\s\S]{0,280}?return/)
  assert.ok(filletCase, 'fillet case')
  assert.match(filletCase[0], /partSolidRequiredStatus/)
  assert.doesNotMatch(filletCase[0], /圆角：先要有实体/)
  const shellCase = store.match(/case 'shell':[\s\S]{0,280}?return/)
  assert.ok(shellCase, 'shell case')
  assert.match(shellCase[0], /partSolidRequiredStatus/)
  assert.doesNotMatch(shellCase[0], /抽壳：先要有实体/)
})

test('componentBoolean offers bake into part solid after success', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /烘焙为零件实体/)
  assert.match(block, /convertMeshComponent\(aId\)/)
  assert.match(block, /editComponent\(aId\)/)
  assert.match(block, /已烘焙入零件时间轴，可圆角\/抽壳/)
  assert.match(block, /MeshFit\/转 B-rep/)
})

test('i18n covers v1.23 guidance phrases', () => {
  assert.match(i18n, /v1\.23 component-boolean dead-end guidance/)
  assert.match(i18n, /Bake into part solid/)
  assert.match(i18n, /MeshFit \/ Convert to B-rep/)
})

test('shell alternate planar path keeps solid guard (v1.23)', () => {
  assert.match(worker, /v1\.23: keep alternate-planar-open path solid/)
  assert.match(worker, /if \(r && validShellSolid\(r\)\) return r/)
  assert.match(worker, /alternate planar lids \(NOT G1 chain\) before cavity/)
  assert.match(worker, /_copyHealSolid/)
})
