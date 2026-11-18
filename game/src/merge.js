// PURNAMA BAY - tiny geometry merger. Bakes many small part geometries
// (each with its own transform and flat colour) into ONE BufferGeometry
// with a vertex-colour attribute, so a whole assembly - a person, a car,
// a city block - renders in a single draw call with a vertexColours
// material. Software rasterisers (and phone GPUs) charge per draw call,
// so this is what keeps the bay's frame rate alive with ~50 people,
// 17 cars and a full city on screen.
// Part: { geo, color, x, y, z, rx, ry, rz, sx, sy, sz } - all optional
// except geo. The source geometries are only read, never mutated.
import * as THREE from 'three';

export function mergeColored(parts) {
  const pos = []; const nor = []; const col = []; const uv = [];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    e.set(p.rx || 0, p.ry || 0, p.rz || 0);
    m.makeRotationFromEuler(e);
    if (p.sx !== undefined || p.sy !== undefined || p.sz !== undefined) {
      sc.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
      m.scale(sc);
    }
    m.setPosition(p.x || 0, p.y || 0, p.z || 0);
    nm.getNormalMatrix(m);
    const pa = g.attributes.position;
    const na = g.attributes.normal;
    const ua = g.attributes.uv;
    const c = new THREE.Color(p.color !== undefined ? p.color : 0xffffff);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      col.push(c.r, c.g, c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// One shared material for every merged vertex-coloured PBR assembly.
export const coloredStandard = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02, envMapIntensity: 0.35 });
