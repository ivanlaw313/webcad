import fs from 'fs';
import { Buffer } from 'buffer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// VECTOR MATH
// ============================================================================

function vec3(x, y, z) {
  return { x, y, z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v) {
  const len = length(v);
  if (len < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function computeNormal(v0, v1, v2) {
  const e1 = subtract(v1, v0);
  const e2 = subtract(v2, v0);
  return normalize(cross(e1, e2));
}

function triangleArea(v0, v1, v2) {
  const e1 = subtract(v1, v0);
  const e2 = subtract(v2, v0);
  return length(cross(e1, e2)) / 2;
}

// ============================================================================
// STL I/O
// ============================================================================

function writeSTL(filename, triangles, partName) {
  const triCount = triangles.length;
  const buffer = Buffer.alloc(80 + 4 + triCount * 50);

  // 80-byte header
  const headerStr = partName.substring(0, 80).padEnd(80, '\0');
  buffer.write(headerStr, 0, 80, 'utf8');

  // Triangle count (uint32 LE)
  buffer.writeUInt32LE(triCount, 80);

  // Triangles
  let offset = 84;
  for (const tri of triangles) {
    // Normal (3×float32 LE)
    buffer.writeFloatLE(tri.normal.x, offset);
    buffer.writeFloatLE(tri.normal.y, offset + 4);
    buffer.writeFloatLE(tri.normal.z, offset + 8);
    offset += 12;

    // Vertices (3×3×float32 LE)
    for (const v of tri.vertices) {
      buffer.writeFloatLE(v.x, offset);
      buffer.writeFloatLE(v.y, offset + 4);
      buffer.writeFloatLE(v.z, offset + 8);
      offset += 12;
    }

    // Attribute (uint16 LE)
    buffer.writeUInt16LE(0, offset);
    offset += 2;
  }

  fs.writeFileSync(filename, buffer);
}

function readSTL(filename) {
  const buffer = fs.readFileSync(filename);
  const triCount = buffer.readUInt32LE(80);

  const triangles = [];
  let offset = 84;

  for (let i = 0; i < triCount; i++) {
    const normal = {
      x: buffer.readFloatLE(offset),
      y: buffer.readFloatLE(offset + 4),
      z: buffer.readFloatLE(offset + 8)
    };
    offset += 12;

    const vertices = [];
    for (let j = 0; j < 3; j++) {
      vertices.push({
        x: buffer.readFloatLE(offset),
        y: buffer.readFloatLE(offset + 4),
        z: buffer.readFloatLE(offset + 8)
      });
      offset += 12;
    }
    offset += 2;

    triangles.push({ normal, vertices });
  }

  return triangles;
}

// ============================================================================
// VOLUME COMPUTATION (Divergence Theorem)
// ============================================================================

function computeSignedVolume(triangles) {
  let volume = 0.0;

  // Use divergence theorem: V = (1/6) * sum_triangles (p0 · (p1 × p2))
  // This assumes outward-pointing normals; the sum of signed volumes should equal total volume
  for (const tri of triangles) {
    const p0 = tri.vertices[0];
    const p1 = tri.vertices[1];
    const p2 = tri.vertices[2];

    // Scalar triple product: p0 · (p1 × p2)
    const cross_p1_p2 = cross(p1, p2);
    const scalar_triple = dot(p0, cross_p1_p2);

    volume += scalar_triple / 6.0;
  }

  // For closed mesh with consistent outward normals, this should be positive
  return Math.abs(volume);
}

// ============================================================================
// PART GENERATORS
// ============================================================================

function generateBox(w, h, d) {
  const triangles = [];

  // Center the box at origin for numerical stability of volume calculation
  const minX = -w / 2, maxX = w / 2;
  const minY = -h / 2, maxY = h / 2;
  const minZ = -d / 2, maxZ = d / 2;

  function addTriangle(v0, v1, v2) {
    const normal = computeNormal(v0, v1, v2);
    triangles.push({ vertices: [v0, v1, v2], normal });
  }

  // Front face (z=minZ, outward normal -Z)
  addTriangle(vec3(minX, minY, minZ), vec3(minX, maxY, minZ), vec3(maxX, maxY, minZ));
  addTriangle(vec3(minX, minY, minZ), vec3(maxX, maxY, minZ), vec3(maxX, minY, minZ));

  // Back face (z=maxZ, outward normal +Z)
  addTriangle(vec3(minX, minY, maxZ), vec3(maxX, maxY, maxZ), vec3(minX, maxY, maxZ));
  addTriangle(vec3(minX, minY, maxZ), vec3(maxX, minY, maxZ), vec3(maxX, maxY, maxZ));

  // Left face (x=minX, outward normal -X)
  addTriangle(vec3(minX, minY, minZ), vec3(minX, maxY, maxZ), vec3(minX, maxY, minZ));
  addTriangle(vec3(minX, minY, minZ), vec3(minX, minY, maxZ), vec3(minX, maxY, maxZ));

  // Right face (x=maxX, outward normal +X)
  addTriangle(vec3(maxX, minY, minZ), vec3(maxX, maxY, minZ), vec3(maxX, maxY, maxZ));
  addTriangle(vec3(maxX, minY, minZ), vec3(maxX, maxY, maxZ), vec3(maxX, minY, maxZ));

  // Bottom face (y=minY, outward normal -Y)
  addTriangle(vec3(minX, minY, minZ), vec3(maxX, minY, minZ), vec3(maxX, minY, maxZ));
  addTriangle(vec3(minX, minY, minZ), vec3(maxX, minY, maxZ), vec3(minX, minY, maxZ));

  // Top face (y=maxY, outward normal +Y)
  addTriangle(vec3(minX, maxY, minZ), vec3(maxX, maxY, maxZ), vec3(maxX, maxY, minZ));
  addTriangle(vec3(minX, maxY, minZ), vec3(minX, maxY, maxZ), vec3(maxX, maxY, maxZ));

  return triangles;
}

function generateCylinder(radius, height, segments) {
  const triangles = [];
  const dtheta = (2 * Math.PI) / segments;

  // Side wall
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;

    const x0 = radius * Math.cos(theta0);
    const y0 = radius * Math.sin(theta0);
    const x1 = radius * Math.cos(theta1);
    const y1 = radius * Math.sin(theta1);

    // Triangle 1: bottom edge
    triangles.push({
      vertices: [
        vec3(x0, y0, 0),
        vec3(x1, y1, 0),
        vec3(x1, y1, height)
      ],
      normal: normalize(vec3(x1, y1, 0))
    });

    // Triangle 2: top edge
    triangles.push({
      vertices: [
        vec3(x0, y0, 0),
        vec3(x1, y1, height),
        vec3(x0, y0, height)
      ],
      normal: normalize(vec3(x0, y0, 0))
    });
  }

  // Bottom cap (fan at z=0, normal -Z)
  const centerBot = vec3(0, 0, 0);
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;

    const x0 = radius * Math.cos(theta0);
    const y0 = radius * Math.sin(theta0);
    const x1 = radius * Math.cos(theta1);
    const y1 = radius * Math.sin(theta1);

    triangles.push({
      vertices: [
        centerBot,
        vec3(x1, y1, 0),
        vec3(x0, y0, 0)
      ],
      normal: vec3(0, 0, -1)
    });
  }

  // Top cap (fan at z=height, normal +Z)
  const centerTop = vec3(0, 0, height);
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;

    const x0 = radius * Math.cos(theta0);
    const y0 = radius * Math.sin(theta0);
    const x1 = radius * Math.cos(theta1);
    const y1 = radius * Math.sin(theta1);

    triangles.push({
      vertices: [
        centerTop,
        vec3(x0, y0, height),
        vec3(x1, y1, height)
      ],
      normal: vec3(0, 0, 1)
    });
  }

  return triangles;
}

function generateSphere(radius, latSegments, lonSegments) {
  const triangles = [];

  function addTriangle(v0, v1, v2) {
    const normal = computeNormal(v0, v1, v2);
    triangles.push({ vertices: [v0, v1, v2], normal });
  }

  // Generate UV sphere with proper pole handling
  // South pole at lat=0, North pole at lat=π

  // South pole (lat=0): triangle fan connecting all longitude segments to south pole
  const south_pole = vec3(0, 0, -radius);
  for (let lon = 0; lon < lonSegments; lon++) {
    const lon1 = (lon / lonSegments) * 2 * Math.PI;
    const lon2 = ((lon + 1) / lonSegments) * 2 * Math.PI;

    const lat2 = (1 / latSegments) * Math.PI;
    const sin_lat2 = Math.sin(lat2);
    const cos_lat2 = Math.cos(lat2);

    const p1 = vec3(radius * sin_lat2 * Math.cos(lon1), radius * sin_lat2 * Math.sin(lon1), radius * cos_lat2);
    const p2 = vec3(radius * sin_lat2 * Math.cos(lon2), radius * sin_lat2 * Math.sin(lon2), radius * cos_lat2);

    addTriangle(south_pole, p2, p1);
  }

  // Middle bands
  for (let lat = 1; lat < latSegments - 1; lat++) {
    for (let lon = 0; lon < lonSegments; lon++) {
      const lat1 = (lat / latSegments) * Math.PI;
      const lat2 = ((lat + 1) / latSegments) * Math.PI;
      const lon1 = (lon / lonSegments) * 2 * Math.PI;
      const lon2 = ((lon + 1) / lonSegments) * 2 * Math.PI;

      const sin_lat1 = Math.sin(lat1);
      const sin_lat2 = Math.sin(lat2);
      const cos_lat1 = Math.cos(lat1);
      const cos_lat2 = Math.cos(lat2);

      const p00 = vec3(radius * sin_lat1 * Math.cos(lon1), radius * sin_lat1 * Math.sin(lon1), radius * cos_lat1);
      const p01 = vec3(radius * sin_lat1 * Math.cos(lon2), radius * sin_lat1 * Math.sin(lon2), radius * cos_lat1);
      const p10 = vec3(radius * sin_lat2 * Math.cos(lon1), radius * sin_lat2 * Math.sin(lon1), radius * cos_lat2);
      const p11 = vec3(radius * sin_lat2 * Math.cos(lon2), radius * sin_lat2 * Math.sin(lon2), radius * cos_lat2);

      addTriangle(p00, p01, p11);
      addTriangle(p00, p11, p10);
    }
  }

  // North pole (lat=π): triangle fan connecting to north pole
  const north_pole = vec3(0, 0, radius);
  for (let lon = 0; lon < lonSegments; lon++) {
    const lon1 = (lon / lonSegments) * 2 * Math.PI;
    const lon2 = ((lon + 1) / lonSegments) * 2 * Math.PI;

    const lat1 = ((latSegments - 1) / latSegments) * Math.PI;
    const sin_lat1 = Math.sin(lat1);
    const cos_lat1 = Math.cos(lat1);

    const p1 = vec3(radius * sin_lat1 * Math.cos(lon1), radius * sin_lat1 * Math.sin(lon1), radius * cos_lat1);
    const p2 = vec3(radius * sin_lat1 * Math.cos(lon2), radius * sin_lat1 * Math.sin(lon2), radius * cos_lat1);

    addTriangle(p1, p2, north_pole);
  }

  return triangles;
}

function generateCone(baseRadius, height, segments) {
  const triangles = [];
  const dtheta = (2 * Math.PI) / segments;
  const apex = vec3(0, 0, height);

  // Side wall (triangle fan from apex)
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;

    const x0 = baseRadius * Math.cos(theta0);
    const y0 = baseRadius * Math.sin(theta0);
    const x1 = baseRadius * Math.cos(theta1);
    const y1 = baseRadius * Math.sin(theta1);

    const p0 = vec3(x0, y0, 0);
    const p1 = vec3(x1, y1, 0);

    // Compute outward normal for cone side
    const mid = vec3((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const radialDir = normalize(mid);
    const sideDir = normalize(subtract(apex, mid));
    const n = normalize(cross(sideDir, radialDir));

    triangles.push({
      vertices: [p0, p1, apex],
      normal: n
    });
  }

  // Base cap (fan at z=0, normal -Z)
  const center = vec3(0, 0, 0);
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;

    const x0 = baseRadius * Math.cos(theta0);
    const y0 = baseRadius * Math.sin(theta0);
    const x1 = baseRadius * Math.cos(theta1);
    const y1 = baseRadius * Math.sin(theta1);

    triangles.push({
      vertices: [
        center,
        vec3(x1, y1, 0),
        vec3(x0, y0, 0)
      ],
      normal: vec3(0, 0, -1)
    });
  }

  return triangles;
}

function generateBoxWithHole(boxW, boxH, boxD, holeRadius, holeCenterX, holeCenterY) {
  const triangles = [];
  const segments = 96;
  const dtheta = (2 * Math.PI) / segments;

  function addTriangle(v0, v1, v2) {
    const normal = computeNormal(v0, v1, v2);
    triangles.push({ vertices: [v0, v1, v2], normal });
  }

  // Circle points at hole center (for z=0)
  const circlePoints = [];
  for (let i = 0; i < segments; i++) {
    const theta = i * dtheta;
    circlePoints.push(vec3(
      holeCenterX + holeRadius * Math.cos(theta),
      holeCenterY + holeRadius * Math.sin(theta),
      0
    ));
  }

  // Rectangle perimeter sampling
  const rectPerimeter = 2 * (boxW + boxH);
  const rectPoints = [];
  for (let i = 0; i < segments; i++) {
    const dist = (i / segments) * rectPerimeter;
    let p;

    if (dist < boxW) {
      p = vec3(dist, 0, 0);
    } else if (dist < boxW + boxH) {
      p = vec3(boxW, dist - boxW, 0);
    } else if (dist < 2 * boxW + boxH) {
      p = vec3(boxW - (dist - boxW - boxH), boxH, 0);
    } else {
      p = vec3(0, boxH - (dist - 2 * boxW - boxH), 0);
    }

    rectPoints.push(p);
  }

  // Bottom face (z=0): ring from rectangle to circle
  for (let i = 0; i < segments; i++) {
    const r0 = rectPoints[i];
    const r1 = rectPoints[(i + 1) % segments];
    const c0 = circlePoints[i];
    const c1 = circlePoints[(i + 1) % segments];

    addTriangle(r0, r1, c1);
    addTriangle(r0, c1, c0);
  }

  // Top face (z=boxD): same ring but at top, normal flipped
  const circlePointsTop = circlePoints.map(p => vec3(p.x, p.y, boxD));
  const rectPointsTop = rectPoints.map(p => vec3(p.x, p.y, boxD));

  for (let i = 0; i < segments; i++) {
    const r0 = rectPointsTop[i];
    const r1 = rectPointsTop[(i + 1) % segments];
    const c0 = circlePointsTop[i];
    const c1 = circlePointsTop[(i + 1) % segments];

    addTriangle(r0, c0, c1);
    addTriangle(r1, r0, c1);
  }

  // Four side walls (outside box surfaces)
  // Front wall (y=0)
  addTriangle(vec3(0, 0, 0), vec3(0, 0, boxD), vec3(boxW, 0, boxD));
  addTriangle(vec3(0, 0, 0), vec3(boxW, 0, boxD), vec3(boxW, 0, 0));

  // Back wall (y=boxH)
  addTriangle(vec3(boxW, boxH, 0), vec3(boxW, boxH, boxD), vec3(0, boxH, boxD));
  addTriangle(vec3(boxW, boxH, 0), vec3(0, boxH, boxD), vec3(0, boxH, 0));

  // Left wall (x=0)
  addTriangle(vec3(0, 0, 0), vec3(0, boxH, 0), vec3(0, boxH, boxD));
  addTriangle(vec3(0, 0, 0), vec3(0, boxH, boxD), vec3(0, 0, boxD));

  // Right wall (x=boxW)
  addTriangle(vec3(boxW, boxH, 0), vec3(boxW, 0, 0), vec3(boxW, 0, boxD));
  addTriangle(vec3(boxW, boxH, 0), vec3(boxW, 0, boxD), vec3(boxW, boxH, boxD));

  // Inner cylinder wall - reverse winding so normals point inward (out of solid, into hole)
  const circlePointsBot = circlePoints;
  for (let i = 0; i < segments; i++) {
    const c0 = circlePointsBot[i];
    const c1 = circlePointsBot[(i + 1) % segments];
    const c0_top = circlePointsTop[i];
    const c1_top = circlePointsTop[(i + 1) % segments];

    // Reverse order so computed normal points inward
    addTriangle(c0, c1, c1_top);
    addTriangle(c0, c1_top, c0_top);
  }

  return triangles;
}

function generateLBracket() {
  // L-bracket: 60×40×8 base plate + 60×8×35 vertical wall
  // Shared edge: the 60-long edge
  // Model as extrusion (60mm in X) of L-shaped 2D cross-section

  const triangles = [];

  // L cross-section (in YZ plane at different X):
  // (0, 0) -> (40, 0) -> (40, 8) -> (8, 8) -> (8, 35) -> (0, 35) -> back to (0, 0)
  // Extrude in X direction (0 to 60)

  const profile = [
    vec3(0, 0, 0),      // bottom-left
    vec3(0, 40, 0),     // bottom-right
    vec3(0, 40, 8),     // top-right of base
    vec3(0, 8, 8),      // transition point
    vec3(0, 8, 35),     // top of vertical
    vec3(0, 0, 35)      // top-left of vertical
  ];

  const profileX = profile.map(p => vec3(60, p.y, p.z));

  // Triangulate the faces
  // Front face (X=0): triangulate the L polygon
  const frontPoly = profile;
  for (let i = 1; i < frontPoly.length - 1; i++) {
    triangles.push({
      vertices: [frontPoly[0], frontPoly[i], frontPoly[i + 1]],
      normal: vec3(-1, 0, 0)
    });
  }

  // Back face (X=60): same polygon but reversed
  for (let i = 1; i < profileX.length - 1; i++) {
    triangles.push({
      vertices: [profileX[0], profileX[i + 1], profileX[i]],
      normal: vec3(1, 0, 0)
    });
  }

  // Side walls: connect profile[i] to profileX[i] to profileX[i+1] and profile[i+1]
  for (let i = 0; i < profile.length; i++) {
    const p0 = profile[i];
    const p1 = profile[(i + 1) % profile.length];
    const px0 = profileX[i];
    const px1 = profileX[(i + 1) % profile.length];

    triangles.push({
      vertices: [p0, px1, p1],
      normal: normalize(cross(subtract(px1, p0), subtract(p1, p0)))
    });
    triangles.push({
      vertices: [p0, px0, px1],
      normal: normalize(cross(subtract(px0, p0), subtract(px1, p0)))
    });
  }

  return triangles;
}

function generateSteppedShaft() {
  const triangles = [];
  const segments = 96;
  const dtheta = (2 * Math.PI) / segments;

  function addTriangle(v0, v1, v2) {
    const normal = computeNormal(v0, v1, v2);
    triangles.push({ vertices: [v0, v1, v2], normal });
  }

  // Coaxial cylinders stacked: r=12 h=15, r=8 h=20, r=5 h=10

  // === Cylinder 1: r=12, h=15, z: [0, 15] ===
  // Side wall
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;
    const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);

    addTriangle(
      vec3(12 * cos0, 12 * sin0, 0),
      vec3(12 * cos1, 12 * sin1, 0),
      vec3(12 * cos1, 12 * sin1, 15)
    );
    addTriangle(
      vec3(12 * cos0, 12 * sin0, 0),
      vec3(12 * cos1, 12 * sin1, 15),
      vec3(12 * cos0, 12 * sin0, 15)
    );
  }

  // Bottom cap at z=0
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;
    const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);

    addTriangle(
      vec3(0, 0, 0),
      vec3(12 * cos1, 12 * sin1, 0),
      vec3(12 * cos0, 12 * sin0, 0)
    );
  }

  // === Annular ring at z=15: r=12→r=8 ===
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;
    const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);

    addTriangle(
      vec3(12 * cos0, 12 * sin0, 15),
      vec3(12 * cos1, 12 * sin1, 15),
      vec3(8 * cos1, 8 * sin1, 15)
    );
    addTriangle(
      vec3(12 * cos0, 12 * sin0, 15),
      vec3(8 * cos1, 8 * sin1, 15),
      vec3(8 * cos0, 8 * sin0, 15)
    );
  }

  // === Cylinder 2: r=8, h=20, z: [15, 35] ===
  // Side wall
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;
    const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);

    addTriangle(
      vec3(8 * cos0, 8 * sin0, 15),
      vec3(8 * cos1, 8 * sin1, 15),
      vec3(8 * cos1, 8 * sin1, 35)
    );
    addTriangle(
      vec3(8 * cos0, 8 * sin0, 15),
      vec3(8 * cos1, 8 * sin1, 35),
      vec3(8 * cos0, 8 * sin0, 35)
    );
  }

  // === Annular ring at z=35: r=8→r=5 ===
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;
    const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);

    addTriangle(
      vec3(8 * cos0, 8 * sin0, 35),
      vec3(8 * cos1, 8 * sin1, 35),
      vec3(5 * cos1, 5 * sin1, 35)
    );
    addTriangle(
      vec3(8 * cos0, 8 * sin0, 35),
      vec3(5 * cos1, 5 * sin1, 35),
      vec3(5 * cos0, 5 * sin0, 35)
    );
  }

  // === Cylinder 3: r=5, h=10, z: [35, 45] ===
  // Side wall
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;
    const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);

    addTriangle(
      vec3(5 * cos0, 5 * sin0, 35),
      vec3(5 * cos1, 5 * sin1, 35),
      vec3(5 * cos1, 5 * sin1, 45)
    );
    addTriangle(
      vec3(5 * cos0, 5 * sin0, 35),
      vec3(5 * cos1, 5 * sin1, 45),
      vec3(5 * cos0, 5 * sin0, 45)
    );
  }

  // Top cap at z=45
  for (let i = 0; i < segments; i++) {
    const theta0 = i * dtheta;
    const theta1 = (i + 1) * dtheta;
    const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1), sin1 = Math.sin(theta1);

    addTriangle(
      vec3(0, 0, 45),
      vec3(5 * cos0, 5 * sin0, 45),
      vec3(5 * cos1, 5 * sin1, 45)
    );
  }

  return triangles;
}

// ============================================================================
// VERIFICATION
// ============================================================================

function verifySTL(filename) {
  const triangles = readSTL(filename);

  // Check for degenerate triangles
  for (let i = 0; i < triangles.length; i++) {
    const area = triangleArea(
      triangles[i].vertices[0],
      triangles[i].vertices[1],
      triangles[i].vertices[2]
    );

    if (area < 1e-12) {
      console.error(`Degenerate triangle ${i} in ${filename}: area ${area}`);
      process.exit(1);
    }
  }

  const volume = computeSignedVolume(triangles);
  return { triCount: triangles.length, volume };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const parts = [
    {
      name: 'box_40x30x20',
      generator: () => generateBox(40, 30, 20),
      analyticVolume: 40 * 30 * 20,
      surfaces: [
        { kind: 'plane', count: 6 }
      ]
    },
    {
      name: 'cylinder_r10_h40',
      generator: () => generateCylinder(10, 40, 96),
      analyticVolume: Math.PI * 10 * 10 * 40,
      surfaces: [
        { kind: 'cylinder', axis: 'Z', radius: 10, height: 40, count: 1 },
        { kind: 'plane', count: 2 }
      ]
    },
    {
      name: 'sphere_r15',
      generator: () => generateSphere(15, 56, 112),
      analyticVolume: (4 / 3) * Math.PI * 15 * 15 * 15,
      surfaces: [
        { kind: 'sphere', radius: 15, count: 1 }
      ]
    },
    {
      name: 'cone_r12_h30',
      generator: () => generateCone(12, 30, 96),
      analyticVolume: (1 / 3) * Math.PI * 12 * 12 * 30,
      surfaces: [
        { kind: 'cone', baseRadius: 12, height: 30, count: 1 },
        { kind: 'plane', count: 1 }
      ]
    },
    {
      name: 'box_with_hole',
      generator: () => generateBoxWithHole(50, 40, 20, 8, 25, 20),
      analyticVolume: 50 * 40 * 20 - Math.PI * 8 * 8 * 20,
      surfaces: [
        { kind: 'plane', count: 7 },
        { kind: 'cylinder', axis: 'Z', radius: 8, height: 20, count: 1 }
      ]
    },
    {
      name: 'lbracket',
      generator: () => generateLBracket(),
      analyticVolume: (40 * 8 + 8 * 27) * 60,  // base area + vertical area, extruded 60mm
      surfaces: [
        { kind: 'plane', count: 8 }
      ]
    },
    {
      name: 'stepped_shaft',
      generator: () => generateSteppedShaft(),
      analyticVolume: Math.PI * 12 * 12 * 15 + Math.PI * 8 * 8 * 20 + Math.PI * 5 * 5 * 10,
      surfaces: [
        { kind: 'cylinder', count: 3 },
        { kind: 'plane', count: 4 }
      ]
    }
  ];

  const results = [];
  const groundTruth = {};

  console.log('Generating golden test assets...\n');

  for (const part of parts) {
    console.log(`Generating ${part.name}...`);

    const triangles = part.generator();
    const filename = `${__dirname}/${part.name}.stl`;

    writeSTL(filename, triangles, part.name);

    const verified = verifySTL(filename);

    const volumeError = Math.abs(verified.volume - part.analyticVolume) / part.analyticVolume;

    // Curved parts allow 0.5% error; planar allow 1e-6 relative
    const isCurved = part.surfaces.some(s => ['cylinder', 'sphere', 'cone'].includes(s.kind));
    const tolerance = isCurved ? 0.005 : 1e-6;

    if (volumeError > tolerance) {
      console.error(
        `Volume mismatch for ${part.name}: ` +
        `computed ${verified.volume}, analytic ${part.analyticVolume}, ` +
        `error ${(volumeError * 100).toFixed(4)}% (tolerance ${(tolerance * 100).toFixed(4)}%)`
      );
      process.exit(1);
    }

    groundTruth[part.name] = {
      file: `${part.name}.stl`,
      volumeMm3: part.analyticVolume,
      surfaces: part.surfaces,
      triCount: verified.triCount
    };

    results.push({
      file: part.name,
      triangles: verified.triCount,
      meshVolume: verified.volume,
      analyticVolume: part.analyticVolume,
      errorPercent: (volumeError * 100).toFixed(6)
    });
  }

  // Write ground truth JSON
  const truthFilename = `${__dirname}/ground_truth.json`;
  fs.writeFileSync(truthFilename, JSON.stringify(groundTruth, null, 2));
  console.log(`\nWrote ground truth: ${truthFilename}`);

  // Print summary table
  console.log('\n' + '='.repeat(90));
  console.log('SUMMARY TABLE');
  console.log('='.repeat(90));
  console.log(
    'File'.padEnd(25) +
    'Triangles'.padEnd(15) +
    'Mesh Volume'.padEnd(20) +
    'Analytic Volume'.padEnd(20) +
    'Error %'.padEnd(15)
  );
  console.log('-'.repeat(90));

  for (const r of results) {
    console.log(
      r.file.padEnd(25) +
      r.triangles.toString().padEnd(15) +
      r.meshVolume.toFixed(2).padEnd(20) +
      r.analyticVolume.toFixed(2).padEnd(20) +
      r.errorPercent.padEnd(15)
    );
  }

  console.log('-'.repeat(90));

  // Total size
  const files = [
    `${__dirname}/box_40x30x20.stl`,
    `${__dirname}/cylinder_r10_h40.stl`,
    `${__dirname}/sphere_r15.stl`,
    `${__dirname}/cone_r12_h30.stl`,
    `${__dirname}/box_with_hole.stl`,
    `${__dirname}/lbracket.stl`,
    `${__dirname}/stepped_shaft.stl`,
    truthFilename
  ];

  let totalSize = 0;
  for (const f of files) {
    const stat = fs.statSync(f);
    totalSize += stat.size;
  }

  console.log(`\nTotal asset size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log('All assets generated successfully.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
