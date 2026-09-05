import adsk.core
import adsk.fusion
import json
import os
import traceback


REPORT_PATH = r"C:\ClaudeCode\webcad\_fusion_captures\fusion-fixture-report.json"


def _point(x, y, z=0.0):
    return adsk.core.Point3D.create(x, y, z)


def _value(value):
    return adsk.core.ValueInput.createByReal(value)


def _new_body_operation():
    return adsk.fusion.FeatureOperations.NewBodyFeatureOperation


def _add_box(root, name, x0, y0, x1, y1, height):
    sketch = root.sketches.add(root.xYConstructionPlane)
    sketch.name = name + " Sketch"
    sketch.sketchCurves.sketchLines.addTwoPointRectangle(
        _point(x0, y0),
        _point(x1, y1),
    )
    if sketch.profiles.count != 1:
        raise RuntimeError(name + " did not create exactly one profile")
    feature = root.features.extrudeFeatures.addSimple(
        sketch.profiles.item(0),
        _value(height),
        _new_body_operation(),
    )
    feature.name = name + " Extrude"
    body = feature.bodies.item(0)
    body.name = name
    return body


def _add_cylinder(root, name, cx, cy, radius, height):
    sketch = root.sketches.add(root.xYConstructionPlane)
    sketch.name = name + " Sketch"
    sketch.sketchCurves.sketchCircles.addByCenterRadius(_point(cx, cy), radius)
    if sketch.profiles.count != 1:
        raise RuntimeError(name + " did not create exactly one profile")
    feature = root.features.extrudeFeatures.addSimple(
        sketch.profiles.item(0),
        _value(height),
        _new_body_operation(),
    )
    feature.name = name + " Extrude"
    body = feature.bodies.item(0)
    body.name = name
    return body


def _add_offset_plane(root, name, offset):
    plane_input = root.constructionPlanes.createInput()
    plane_input.setByOffset(root.xYConstructionPlane, _value(offset))
    plane = root.constructionPlanes.add(plane_input)
    plane.name = name
    return plane


def _add_loft_fixture(root):
    lower_plane = _add_offset_plane(root, "Loft Plane Lower 40mm", 4.0)
    upper_plane = _add_offset_plane(root, "Loft Plane Upper 70mm", 7.0)

    lower = root.sketches.add(lower_plane)
    lower.name = "Loft Lower Profile"
    lower.sketchCurves.sketchCircles.addByCenterRadius(_point(12.0, 5.0), 1.5)

    upper = root.sketches.add(upper_plane)
    upper.name = "Loft Upper Profile"
    upper.sketchCurves.sketchCircles.addByCenterRadius(_point(12.0, 5.0), 0.7)

    loft_input = root.features.loftFeatures.createInput(_new_body_operation())
    loft_input.loftSections.add(lower.profiles.item(0))
    loft_input.loftSections.add(upper.profiles.item(0))
    loft = root.features.loftFeatures.add(loft_input)
    loft.name = "Loft Cone Feature"
    body = loft.bodies.item(0)
    body.name = "Loft Cone Body"
    return body


def _add_path_sketches(root):
    open_sketch = root.sketches.add(root.xYConstructionPlane)
    open_sketch.name = "Open Path Sketch"
    lines = open_sketch.sketchCurves.sketchLines
    p0 = _point(9.0, -2.0)
    p1 = _point(11.0, -2.0)
    p2 = _point(12.5, -0.5)
    p3 = _point(14.0, -1.5)
    lines.addByTwoPoints(p0, p1)
    lines.addByTwoPoints(p1, p2)
    lines.addByTwoPoints(p2, p3)

    guide = root.sketches.add(root.xZConstructionPlane)
    guide.name = "Sweep Guide Sketch"
    guide_lines = guide.sketchCurves.sketchLines
    g0 = _point(9.0, 0.0)
    g1 = _point(11.0, 2.0)
    g2 = _point(13.0, 4.5)
    guide_lines.addByTwoPoints(g0, g1)
    guide_lines.addByTwoPoints(g1, g2)


def _attempt_component_fixture(root, report):
    try:
        occurrence = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
        component = occurrence.component
        component.name = "Fixture Component"
        _add_box(component, "Component Box", 0.0, 0.0, 2.0, 2.0, 2.0)
        transform = occurrence.transform2
        transform.translation = adsk.core.Vector3D.create(14.0, 0.0, 0.0)
        occurrence.transform2 = transform
        report["componentFixture"] = {
            "created": True,
            "component": component.name,
            "occurrence": occurrence.name,
        }
    except Exception:
        report["componentFixture"] = {
            "created": False,
            "error": traceback.format_exc(),
        }


def run_fixture():
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    if not design:
        raise RuntimeError("The active product is not a Fusion Design")

    root = design.rootComponent
    if root.bRepBodies.count or root.sketches.count or root.occurrences.count:
        raise RuntimeError("Fixture requires an empty active design")

    report = {
        "document": app.activeDocument.name,
        "saved": bool(app.activeDocument.dataFile),
        "units": "Fusion internal centimeters; names describe millimeters",
        "created": [],
    }

    main_box = _add_box(root, "Main Box 60x40x30mm", 0.0, 0.0, 6.0, 4.0, 3.0)
    report["created"].append(main_box.name)

    overlap = _add_cylinder(root, "Overlap Cylinder R12x50mm", 3.0, 2.0, 1.2, 5.0)
    report["created"].append(overlap.name)

    touching = _add_box(root, "Touching Box 20mm", 6.0, 0.0, 8.0, 2.0, 2.0)
    report["created"].append(touching.name)

    separate = _add_box(root, "Separate Box 20mm", 9.0, 0.0, 11.0, 2.0, 2.0)
    report["created"].append(separate.name)

    loft_body = _add_loft_fixture(root)
    report["created"].append(loft_body.name)

    _add_path_sketches(root)
    report["created"].extend(["Open Path Sketch", "Sweep Guide Sketch"])

    _attempt_component_fixture(root, report)

    report["counts"] = {
        "rootBodies": root.bRepBodies.count,
        "rootSketches": root.sketches.count,
        "constructionPlanes": root.constructionPlanes.count,
        "occurrences": root.occurrences.count,
        "timelineGroups": design.timeline.timelineGroups.count,
    }
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    app.activeViewport.fit()
    return report


print(json.dumps(run_fixture(), ensure_ascii=False))
