import * as THREE from 'three';

/**
 * Shared dimensions of the procedural helmet. The shell is the upper half of
 * an ellipsoid centred at SHELL.center with radii SHELL.radii (x, y, z);
 * +Z is the front of the helmet.
 */
export const SHELL = {
  center: new THREE.Vector3(0, 0.12, 0),
  radii: new THREE.Vector3(1, 0.98, 1.18),
};

/** Builds the dome as a lathe so it is smooth and open at the bottom. */
export function createShellGeometry() {
  const points = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.sin(t) * SHELL.radii.x, Math.cos(t) * SHELL.radii.y));
  }
  const geometry = new THREE.LatheGeometry(points, 96);
  geometry.scale(1, 1, SHELL.radii.z / SHELL.radii.x);
  geometry.translate(0, SHELL.center.y, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** Flat brim with a longer peak at the front. */
export function createBrimGeometry() {
  const outer = new THREE.Shape();
  const segments = 96;
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    // rotateX(-90°) maps shape-space -y to model +z (the front), so the peak uses -sin.
    const front = Math.max(0, -Math.sin(a));
    const rx = 1.08 + 0.02 * front;
    const rz = 1.24 + 0.3 * front * front;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * rz;
    if (i === 0) outer.moveTo(x, y);
    else outer.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absellipse(0, 0, SHELL.radii.x * 0.985, SHELL.radii.z * 0.985, 0, Math.PI * 2, false, 0);
  outer.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outer, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 64 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, SHELL.center.y - 0.02, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** Central ridge running over the crown from front to back. */
export function createRidgeGeometry() {
  const curve = new THREE.EllipseCurve(0, 0, SHELL.radii.z * 1.01, SHELL.radii.y * 1.01, Math.PI * 0.12, Math.PI * 0.88, false, 0);
  const pts = curve.getPoints(48).map((p) => new THREE.Vector3(0, p.y + SHELL.center.y, p.x));
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.045, 10, false);
  geometry.scale(1.6, 1, 1);
  return geometry;
}

/** Outward surface normal of the shell ellipsoid at a point. */
export function shellNormal(point) {
  const { center, radii } = SHELL;
  return new THREE.Vector3(
    (point.x - center.x) / (radii.x * radii.x),
    (point.y - center.y) / (radii.y * radii.y),
    (point.z - center.z) / (radii.z * radii.z),
  ).normalize();
}

/**
 * Projects an approximate position onto the outside of the shell, keeping its
 * height and direction, so components sit on the surface.
 */
export function projectToShell([x, y, z], offset = 0.015) {
  const { center, radii } = SHELL;
  const dy = Math.min(0.98, Math.max(-0.98, (y - center.y) / radii.y));
  const k = Math.sqrt(1 - dy * dy);
  const dir = new THREE.Vector2(x / radii.x, z / radii.z);
  if (dir.lengthSq() < 1e-6) dir.set(0, 1);
  dir.normalize();
  const point = new THREE.Vector3(dir.x * radii.x * k, y, dir.y * radii.z * k);
  const normal = shellNormal(point);
  return { point: point.addScaledVector(normal, offset), normal };
}

/** Quaternion that turns a component's +Z axis to face `normal`. */
export function faceQuaternion(normal) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
}

/**
 * Resolves the placement of each component. Exterior parts are projected onto
 * the shell surface; interior parts (ESP32, LM35, MAX30102) use their data
 * position and face the given normal.
 */
export function placeComponent(component, interior) {
  if (interior) {
    const normal = new THREE.Vector3(...component.normal).normalize();
    return { point: new THREE.Vector3(...component.position), normal };
  }
  return projectToShell(component.position, 0.012);
}

/** Components mounted inside the helmet (best seen from below). */
export const INTERIOR = new Set(['esp32', 'lm35', 'max30102']);
