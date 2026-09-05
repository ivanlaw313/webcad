import assert from 'node:assert/strict'
import { cloneDef, migrateComponentDefs, transformBodyMeshByMatrix, visibleDefinitionBodies, writeDefFromEdit, writeDefBodyMesh } from '../src/assembly/occurrence.ts'
import fs from 'node:fs'

const mesh = (tag) => ({
  vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], tag,
})

// v4 payloads must retain every definition body, not silently reduce to body[0].
const a = mesh('base'), b = mesh('second')
const def = {
  id: 'D1', name: 'Two solids', mesh: a, rev: 0,
  bodies: [
    { id: 'D1_B1', name: 'Base', mesh: a },
    { id: 'D1_B2', name: 'Cap', mesh: b, hidden: true, color: '#00aaff' },
  ],
}
const occurrence = { id: 'C1', name: 'Two solids', mesh: a, pos: [0, 0, 0], defId: 'D1', _rev: 0 }
const wire = JSON.parse(JSON.stringify({ componentDefs: [def], components: [occurrence] }))
const hydrated = migrateComponentDefs(wire.componentDefs, wire.components)
assert.equal(hydrated.componentDefs[0].bodies.length, 2)
assert.equal(hydrated.componentDefs[0].bodies[1].name, 'Cap')
assert.equal(hydrated.componentDefs[0].bodies[1].hidden, true)
assert.equal(hydrated.componentDefs[0].bodies[1].color, '#00aaff')
assert.equal(hydrated.components[0].mesh, hydrated.componentDefs[0].mesh)

const copied = cloneDef([def], def)
assert.equal(copied.bodies.length, 2)
assert.notEqual(copied.bodies, def.bodies)
assert.equal(copied.bodies[1].hidden, true)

// Editing a selected secondary body must not overwrite Body 1, which remains the
// backward-compatible occurrence.mesh mirror.
const editedSecond = writeDefFromEdit(def, mesh('second-edited'), undefined, 'D1_B2')
assert.equal(editedSecond.bodies.length, 2)
assert.equal(editedSecond.bodies[0].mesh, a)
assert.equal(editedSecond.bodies[1].mesh.tag, 'second-edited')
assert.equal(editedSecond.mesh, a)
assert.equal(editedSecond.rev, 1)
assert.equal(writeDefFromEdit(def, mesh('must-not-write'), undefined, 'unknown-body'), def)

// A converted secondary body keeps its own B-rep source and never replaces
// Body 1's legacy definition source.
const sourced = { ...def, src: { features: ['body-1'] } }
const convertedSecond = writeDefFromEdit(sourced, mesh('second-brep'), { features: ['body-2-brep'] }, 'D1_B2')
assert.deepEqual(convertedSecond.src, { features: ['body-1'] })
assert.deepEqual(convertedSecond.bodies[1].src, { features: ['body-2-brep'] })
assert.equal(convertedSecond.bodies[0].mesh, a)

const meshOnlyEdit = writeDefBodyMesh(def, 'D1_B2', mesh('second-repaired'))
assert.equal(meshOnlyEdit.bodies[0].mesh, a)
assert.equal(meshOnlyEdit.bodies[1].mesh.tag, 'second-repaired')
assert.equal(meshOnlyEdit.mesh, a)
assert.equal(meshOnlyEdit.rev, 1)
assert.equal(writeDefBodyMesh(def, 'missing', mesh('ignored')), def)

// Plane Cut evaluates the selected body in CAD/world coordinates but stores the
// result in the component definition's local CAD coordinates.  A round trip
// must preserve both vertices and normals (translation must not affect normals).
const localMesh = { vertices: [1, 2, 3], triangles: [0, 0, 0], normals: [0, 1, 0] }
const worldFromLocal = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 30, 40, 50, 1]
const localFromWorld = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -40, 30, -50, 1]
const roundTrip = transformBodyMeshByMatrix(transformBodyMeshByMatrix(localMesh, worldFromLocal), localFromWorld)
assert.deepEqual(roundTrip.vertices.map((x) => Number(x.toFixed(9))), localMesh.vertices)
assert.deepEqual(roundTrip.normals.map((x) => Number(x.toFixed(9))), localMesh.normals)

assert.deepEqual(visibleDefinitionBodies(occurrence, hydrated.componentDefs).map((x) => x.id), ['D1_B1'])
hydrated.componentDefs[0].bodies[1].hidden = false
assert.deepEqual(visibleDefinitionBodies(occurrence, hydrated.componentDefs).map((x) => x.id), ['D1_B1', 'D1_B2'])

const store = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
assert.match(store, /version: 4/)
assert.match(store, /bodies: d\.bodies/)
assert.match(store, /visibleDefinitionBodies\(c, state\.componentDefs\)/)
assert.match(store, /for \(const body of visibleDefinitionBodies\(c, state0\.componentDefs\)\)/)
assert.match(store, /visibleDefinitionBodies\(c, s\.componentDefs\)\.map\(\(b\) => b\.mesh\)/)
assert.match(store, /const meshOf = \(c: typeof comps\[number\]\): MeshData => \{[\s\S]*visibleDefinitionBodies\(c, s\.componentDefs\)/)
assert.match(store, /const mx = meshOf\(cx\), my = meshOf\(cy\)/)
assert.match(store, /const volCm3 = meshes\.reduce/)
assert.match(store, /const watertight = meshes\.every/)
assert.match(store, /batchExportCheckedZip:[\s\S]*visibleDefinitionBodies\(c, s\.componentDefs\)\.some/)
assert.match(store, /batchExportCheckedZip:[\s\S]*meshesToBinarySTL\(bodies\.map/)
assert.match(store, /exportAssemblyStl:[\s\S]*for \(const body of visibleDefinitionBodies\(c, s\.componentDefs\)\)/)
assert.match(store, /exportAssemblyObj:[\s\S]*for \(const body of visibleDefinitionBodies\(c, s\.componentDefs\)\)/)
assert.match(store, /exportAssemblyThreeMF:[\s\S]*for \(const body of visibleDefinitionBodies\(c, s\.componentDefs\)\)/)
// Shell and Offset are destructive mesh operations: when a definition has
// multiple bodies they must target the Browser-selected body, reconcile every
// linked occurrence, and never silently flatten the definition to Body 1.
const shellStart = store.indexOf('shellMeshComponent: async')
const offsetStart = store.indexOf('offsetMeshComponent: async')
const hullStart = store.indexOf('convexHullComponent: async')
assert.ok(shellStart >= 0 && offsetStart > shellStart && hullStart > offsetStart)
for (const source of [store.slice(shellStart, offsetStart), store.slice(offsetStart, hullStart)]) {
  assert.match(source, /selectedComponentBody/)
  assert.match(source, /writeDefBodyMesh/)
  assert.match(source, /reconcileComponents/)
  assert.match(source, /picked\.id === d\.bodies\[0\]\?\.id/)
}
const separateStart = store.indexOf('separateMeshComponent: (id)')
const scaleStart = store.indexOf('scaleComponent: (id, factor)')
const planeCutStart = store.indexOf('planeCutComponent: async')
const convertStart = store.indexOf('convertMeshComponent: async')
const boolStart = store.indexOf('startComponentBoolean: async')
const executeBoolStart = store.indexOf('componentBoolean: async')
assert.ok(hullStart >= 0 && separateStart > hullStart && scaleStart > separateStart)
assert.ok(planeCutStart >= 0 && convertStart > planeCutStart)
assert.ok(boolStart >= 0 && executeBoolStart > boolStart && planeCutStart > executeBoolStart)
const hullSource = store.slice(hullStart, separateStart)
assert.match(hullSource, /selectedComponentBody/)
assert.match(hullSource, /const source = picked\?\.mesh \?\? c\.mesh/)
assert.match(hullSource, /convexHull3D\(source\.vertices/)
const separateSource = store.slice(separateStart, scaleStart)
assert.match(separateSource, /selectedComponentBody/)
assert.match(separateSource, /const source = picked\?\.mesh \?\? c\.mesh/)
assert.match(separateSource, /bodies: d\.bodies\.flatMap/)
assert.match(separateSource, /components: reconcileComponents\(s\.components, defs\)/)
const planeCutSource = store.slice(planeCutStart, convertStart)
assert.match(planeCutSource, /selectedComponentBody/)
assert.match(planeCutSource, /Select a Body in Browser before Plane Cut/)
assert.match(planeCutSource, /transformBodyMeshByMatrix\(source, cadWorldFromLocal\.elements\)/)
assert.match(planeCutSource, /transformBodyMeshByMatrix\(res, cadWorldFromLocal\.clone\(\)\.invert\(\)\.elements\)/)
assert.match(planeCutSource, /const cloned = cloneDef\(s2\.componentDefs, def\)/)
assert.match(planeCutSource, /writeDefBodyMesh\(cloned, bodyId, local\)/)
assert.match(planeCutSource, /defId: updated\.id/)
assert.match(planeCutSource, /reconcileComponents/)
const convertEnd = store.indexOf('buildGearTrain: async')
assert.ok(convertEnd > convertStart)
const convertSource = store.slice(convertStart, convertEnd)
assert.match(convertSource, /selectedBodyId/)
assert.match(convertSource, /Select a Body in Browser before Mesh to B-Rep/)
assert.match(convertSource, /const sourceMesh = targetBody\?\.mesh \?\? c\?\.mesh/)
assert.match(convertSource, /const local = Array\.from\(mv\)/)
assert.doesNotMatch(convertSource, /compWorldMatrix\(c, fk\.get\(c\.id\)\)/)
assert.match(convertSource, /writeDefFromEdit\(liveDef, rebuilt, srcSnap, liveBody\.id\)/)
assert.match(convertSource, /components: reconcileComponents\(s2\.components, defs\)/)
const boolStartSource = store.slice(boolStart, executeBoolStart)
const boolExecuteSource = store.slice(executeBoolStart, planeCutStart)
// Component Boolean must no longer reject multi-body definitions.  It remembers the
// selected A Body, asks for B when needed, executes in world coordinates, then writes
// the result back into a forked local definition without moving A or dropping A joints.
assert.match(boolStartSource, /fromBodyId: picked\?\.id/)
assert.match(boolStartSource, /Browser.*Body/)
assert.match(boolExecuteSource, /if \(!pickedBId && bBodies\.length > 1\)/)
assert.match(boolExecuteSource, /const res = transform\(A, resWorld as MeshData, true\)/)
assert.match(boolExecuteSource, /const aFork = cloneDef\(s2\.componentDefs, liveADef\)/)
assert.match(boolExecuteSource, /writeDefBodyMesh\(aFork, aBody\.id, res\)/)
assert.match(boolExecuteSource, /const bFork = cloneDef\(defs, liveBDef\)/)
assert.match(boolExecuteSource, /components = reconcileComponents\(components, defs\)/)
assert.match(boolExecuteSource, /selectedComponentBody: \{ componentId: aId, bodyId: aBody\.id \}/)
const repairStart = store.indexOf('repairActiveMesh: async')
const simplifyRatioStart = store.indexOf('simplifyComponentMeshRatio: async')
const remeshStart = store.indexOf('remeshComponentMesh: async')
assert.ok(repairStart >= 0 && simplifyRatioStart > repairStart && remeshStart > simplifyRatioStart)
const repairSource = store.slice(repairStart, simplifyRatioStart)
assert.match(repairSource, /selectedComponentBody/)
assert.match(repairSource, /Select a Body in Browser before Mesh Repair/)
assert.match(repairSource, /writeDefBodyMesh/)
assert.match(repairSource, /reconcileComponents/)
const qemSource = store.slice(simplifyRatioStart, remeshStart)
assert.match(qemSource, /selectedComponentBody/)
assert.match(qemSource, /Select a Body in Browser before QEM Simplify/)
assert.match(qemSource, /writeDefBodyMesh/)
assert.match(qemSource, /reconcileComponents/)
const remeshSource = store.slice(remeshStart)
assert.match(remeshSource, /selectedComponentBody/)
assert.match(remeshSource, /Select a Body in Browser before Remesh/)
assert.match(remeshSource, /writeDefBodyMesh/)
assert.match(remeshSource, /reconcileComponents/)
const viewport = fs.readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
assert.match(viewport, /def\?\.bodies\?\.length \? def\.bodies/)
console.log('PASS multi-body definition persists, clones, and reaches viewport renderer')
