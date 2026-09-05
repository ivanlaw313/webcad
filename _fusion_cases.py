import adsk.core
import adsk.fusion
import json
import os
import traceback


CASE_ID = __CASE_ID__
RESULT_PATH = __RESULT_PATH__


app = adsk.core.Application.get()
ui = app.userInterface
design = adsk.fusion.Design.cast(app.activeProduct)
root = design.rootComponent if design else None


def body(name):
    for item in root.bRepBodies:
        if item.name == name:
            return item
    raise RuntimeError("body not found: " + name)


def sketch(name):
    for item in root.sketches:
        if item.name == name:
            return item
    raise RuntimeError("sketch not found: " + name)


def plane(name):
    for item in root.constructionPlanes:
        if item.name == name:
            return item
    raise RuntimeError("construction plane not found: " + name)


def occurrence(component_name):
    for item in root.occurrences:
        if item.component.name == component_name:
            return item
    raise RuntimeError("occurrence not found for component: " + component_name)


def occurrence_vertex(component_name, index=0):
    item = occurrence(component_name)
    native = item.component.bRepBodies.item(0).vertices.item(index)
    return native.createForAssemblyContext(item)


def center_of_bounds(entity):
    bounds = entity.boundingBox
    return (
        (bounds.minPoint.x + bounds.maxPoint.x) * 0.5,
        (bounds.minPoint.y + bounds.maxPoint.y) * 0.5,
        (bounds.minPoint.z + bounds.maxPoint.z) * 0.5,
    )


def top_face(target):
    return max(target.faces, key=lambda item: center_of_bounds(item)[2])


def side_face(target):
    return max(target.faces, key=lambda item: center_of_bounds(item)[0])


def longest_edge(target):
    return max(target.edges, key=lambda item: item.length)


def two_edges(target):
    ordered = sorted(list(target.edges), key=lambda item: item.length, reverse=True)
    return ordered[:2]


MAIN = "Main Box 60x40x30mm"
OVERLAP = "Overlap Cylinder R12x50mm"
TOUCHING = "Touching Box 20mm"
SEPARATE = "Separate Box 20mm"


def resolve_case(case_id):
    main = body(MAIN)
    overlap = body(OVERLAP)
    touching = body(TOUCHING)
    separate = body(SEPARATE)

    cases = {
        "EXTRUDE_PROFILE": ("Extrude", [sketch("Main Box 60x40x30mm Sketch").profiles.item(0)]),
        "LOFT_PROFILES": ("SolidLoft", [
            sketch("Loft Lower Profile").profiles.item(0),
            sketch("Loft Upper Profile").profiles.item(0),
        ]),
        "FILLET_EDGE": ("FusionFilletEdgesCommand", [longest_edge(separate)]),
        "CHAMFER_EDGE": ("FusionChamferCommand", [longest_edge(separate)]),
        "SHELL_FACE": ("FusionShellBodyCommand", [top_face(separate)]),
        "PRESS_PULL_FACE": ("FusionPressPullCommand", [top_face(separate)]),
        "DRAFT_FACE": ("FusionDraftCommand", [side_face(separate)]),
        "SCALE_BODY": ("ModifyScale", [separate]),
        "COMBINE_OVERLAP": ("FusionCombineCommand", [main, overlap]),
        "OFFSET_FACE": ("FusionOffsetFacesCommand", [top_face(separate)]),
        "REPLACE_FACE": ("FusionReplaceFaceCommand", [top_face(touching), top_face(separate)]),
        "MOVE_BODY": ("FusionMoveCommand", [separate]),
        "ALIGN_BODIES": ("AlignCmd", [separate, touching]),
        "RECTANGULAR_PATTERN_BODY": ("PatternRectangular", [separate]),
        "MIRROR_BODY_PLANE": ("MirrorCommand", [separate, root.yZConstructionPlane]),
        "OFFSET_PLANE_FACE": ("ConstructionPlaneOffsetFromPlaneCommand", [top_face(main)]),
        "MEASURE_TWO_EDGES": ("MeasureCommand", two_edges(main)),
        "INTERFERENCE_OVERLAP": ("InterferenceCheckCommand", [main, overlap]),
        "SECTION_OFFSET_PLANE": ("FusionHalfSectionViewCommand", [plane("Loft Plane Lower 40mm")]),
        "JOINT_ORIGIN_VERTEX": ("JointOrigin", [separate.vertices.item(0)]),
        "JOINT_TWO_COMPONENT_VERTICES": ("JointAssembleCmdNew", [
            occurrence_vertex("Fixture Component", 0),
            occurrence_vertex("Fixture Component B", 0),
        ]),
        "AS_BUILT_TWO_COMPONENTS": ("JointAsBuiltCmd", [
            occurrence("Fixture Component"),
            occurrence("Fixture Component B"),
        ]),
        "RIGID_GROUP_TWO_COMPONENTS": ("RigidGroupCmd", [
            occurrence("Fixture Component"),
            occurrence("Fixture Component B"),
        ]),
    }
    if case_id not in cases:
        raise RuntimeError("unknown case: " + case_id)
    return cases[case_id]


def entity_info(entity):
    return {
        "objectType": getattr(entity, "objectType", None),
        "name": getattr(entity, "name", None),
        "entityToken": getattr(entity, "entityToken", None),
    }


def write_report(data):
    os.makedirs(os.path.dirname(RESULT_PATH), exist_ok=True)
    with open(RESULT_PATH, "w", encoding="utf-8") as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)


record = {"caseId": CASE_ID, "prepared": False}
try:
    if not design or not root:
        raise RuntimeError("active product is not a Fusion Design")
    command_id, entities = resolve_case(CASE_ID)
    ui.activeSelections.clear()
    selected = []
    for entity in entities:
        added = ui.activeSelections.add(entity)
        selected.append({"added": bool(added), "entity": entity_info(entity)})
    record.update({
        "prepared": True,
        "commandId": command_id,
        "selectionCount": ui.activeSelections.count,
        "selections": selected,
    })
    write_report(record)
    definition = ui.commandDefinitions.itemById(command_id)
    if not definition:
        raise RuntimeError("command definition not found: " + command_id)
    record["executeReturned"] = bool(definition.execute())
    write_report(record)
except Exception:
    record["error"] = traceback.format_exc()
    write_report(record)
    raise
