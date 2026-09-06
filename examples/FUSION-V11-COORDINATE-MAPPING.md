# Fusion v11 coordinate mapping — preparation only

Windows review confirms: front −X, rear +X, Z up, width Y, left/right mirror XZ. This is the Windows report's evidence; Fusion itself was not operated on this Mac.

The existing wheel coupon is preserved: stations run along X, its wheel axle is Z and mirror is XY. Do not relabel those native coordinates as the vehicle coordinates.

For the future vehicle model, the proper rigid coordinate mapping is:

```
Fusion X = coupon X − Wheelbase/2
Fusion Y = coupon Z
Fusion Z = −coupon Y + WheelDiameter/2
```

This is a −90° rotation about X plus translation. It preserves handedness and lengths. It maps the coupon axle Z to Fusion Y, the mirror plane XY to XZ, the stations 0/Wheelbase to −Wheelbase/2 / +Wheelbase/2, and puts the wheel contact plane at Z=0. It must be applied to native sketch frames, feature axes, transforms and stable references together, not merely to the display mesh.

Planned named vehicle views: Front (camera −X), Rear (+X), Left (−Y), Right (+Y), Top (+Z), all using Z up where applicable. Left/right signs use the driver's convention facing −X and still need Windows review. These are specifications, not delivered applied native vehicle bookmarks.

Windows Fusion v11 has five spokes; this preserved coupon has six. Full-car work must first reconcile the native pattern count and coordinate frame. The complete native vehicle, applied named views, body relations and 1:1 reconstruction remain unfinished. No reference GLB or STEP import is used as evidence of reconstruction.

## Stage 1 implementation (2026-09-06)

The preceding plan is now implemented in the separate `native-car-stage1.mjs` seed and native JSON examples. See `NATIVE-CAR-STAGE1.md` for actual native axes, persistent views, parameter tests and remaining limitations. The original six-spoke coupon is still unchanged.
