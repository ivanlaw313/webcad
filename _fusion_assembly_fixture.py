import adsk.core
import adsk.fusion
import json
import os


REPORT_PATH = r"C:\ClaudeCode\webcad\_fusion_captures\fusion-assembly-fixture-report.json"


def point(x, y, z=0.0):
    return adsk.core.Point3D.create(x, y, z)


def add_component_box(component, name, size_cm=2.0):
    sketch = component.sketches.add(component.xYConstructionPlane)
    sketch.name = name + " Sketch"
    sketch.sketchCurves.sketchLines.addTwoPointRectangle(
        point(0.0, 0.0),
        point(size_cm, size_cm),
    )
    if sketch.profiles.count != 1:
        raise RuntimeError(name + " did not create exactly one profile")
    feature = component.features.extrudeFeatures.addSimple(
        sketch.profiles.item(0),
        adsk.core.ValueInput.createByReal(size_cm),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation,
    )
    feature.name = name + " Extrude"
    body = feature.bodies.item(0)
    body.name = name
    return body


def occurrence_data(occurrence):
    transform = occurrence.transform2
    translation = transform.translation
    component = occurrence.component
    return {
        "name": occurrence.name,
        "component": component.name,
        "bodies": [body.name for body in component.bRepBodies],
        "translationCm": {
            "x": translation.x,
            "y": translation.y,
            "z": translation.z,
        },
        "isGrounded": bool(occurrence.isGrounded),
    }


def run():
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    if not design:
        raise RuntimeError("The active product is not a Fusion Design")
    root = design.rootComponent
    if root.occurrences.count < 1:
        raise RuntimeError("Assembly fixture requires the first Fixture Component occurrence")

    existing_names = [root.occurrences.item(i).component.name for i in range(root.occurrences.count)]
    if "Fixture Component B" not in existing_names:
        occurrence = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
        component = occurrence.component
        component.name = "Fixture Component B"
        add_component_box(component, "Component B Box")
        transform = occurrence.transform2
        transform.translation = adsk.core.Vector3D.create(17.0, 0.0, 0.0)
        occurrence.transform2 = transform

    result = {
        "document": app.activeDocument.name if app.activeDocument else None,
        "saved": bool(app.activeDocument.dataFile) if app.activeDocument else None,
        "designType": str(design.designType),
        "rootOccurrenceCount": root.occurrences.count,
        "occurrences": [occurrence_data(root.occurrences.item(i)) for i in range(root.occurrences.count)],
    }
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    app.activeViewport.fit()
    return result


print(json.dumps(run(), ensure_ascii=False))

