// PURNAMA BAY - the city itself: a tropical coastal grid of roads, blocks,
// beach and pier, built from boxes and canvas textures. Also owns the list
// of named places the missions and the shop point at.
import * as THREE from 'three';
import { S, CFG } from './config.js';
import { facadeTexture, groundTexture, roadTexture, signTexture, frondTexture } from './textures.js';
import { mergeColored, coloredLambert } from './merge.js';

// Coloured static parts from every builder below (pier deck, safehouse
// roof, umbrella poles and tops) collect here and become ONE mesh.
const worldColoredParts = [];

// Scene census for probes and the report: markings, park furniture,
// lamps - filled in while the world is built.
export const WORLD_COUNTS = { edgeLines: 0, zebras: 0, lamps: 0, parkBenches: 0, parkTrees: 0 };

export const PLACES = {
  cafe: { name: 'Kopi Ombak Cafe', x: -34, z: 26 },
  garage: { name: 'Bengkel Samudra', x: -52, z: 44 },
  warehouse: { name: 'Gudang Pelita No. 9', x: 84, z: -64 },
  hotel: { name: 'Hotel Bulan', x: -84, z: -30 },
  arms: { name: 'PURNAMA ARMS', x: CFG.shopDoor.x, z: CFG.shopDoor.z },
  safehouse: { name: "Raka's House", x: CFG.safehouse.x, z: CFG.safehouse.z },
  pier: { name: 'Purnama Pier', x: -18, z: 104 },
};

export const ROAD_LINES = [-120, -80, -40, 0, 40, 80, 120];
export function isRoad(x, z) {
  for (const r of ROAD_LINES) {
    if (Math.abs(x - r) < 6.5 || Math.abs(z - r) < 6.5) return true;
  }
  return false;
}

// The pedestrian network: raised pavement strips (top at y = 0.12) run at
// +-7.35 m from every road centre line, so a point is ON a sidewalk when
// its distance to some road line sits in the strip band on either axis.
export const SIDEWALK_OFFSET = 7.35;
export function isSidewalk(x, z) {
  for (const r of ROAD_LINES) {
    const dx = Math.abs(Math.abs(x - r) - SIDEWALK_OFFSET);
    const dz = Math.abs(Math.abs(z - r) - SIDEWALK_OFFSET);
    if (dx <= 0.95 || dz <= 0.95) return true;
  }
  return false;
}
export function groundYAt(x, z) { return isSidewalk(x, z) ? 0.12 : 0; }

// Purnama Green: the city's one real park, fitted exactly inside the
// block between the -120/-80 avenues and the 80/120 avenues.
export const PARK = { x: -100, z: 100, halfW: 13, halfD: 13, name: 'Purnama Green' };
export function inPark(x, z) {
  return Math.abs(x - PARK.x) <= PARK.halfW && Math.abs(z - PARK.z) <= PARK.halfD;
}

// A pedestrian-safe point: anywhere that is not carriageway (sidewalks,
// park, plaza blocks, the dock band all qualify by not being road).
export function pedSafe(x, z) { return !isRoad(x, z); }

// Beach umbrellas: small colour pops along the sand band, fed into the
// shared coloured-static merge instead of two meshes apiece.
function buildUmbrellas(scene) {
  const cols = [0xe86a2a, 0x1fa8b8, 0xd94f70, 0xd9a441];
  for (let i = 0; i < 9; i++) {
    const x = -120 + i * 29;
    const z = 138 + (i % 3) * 3;
    worldColoredParts.push({ geo: new THREE.BoxGeometry(0.09, 2.2, 0.09), color: 0xe8e3d5, x, y: 1.1, z });
    worldColoredParts.push({ geo: new THREE.ConeGeometry(1.9, 0.7, 8), color: cols[i % cols.length], x, y: 2.4, z });
  }
  void scene;
}

// One colour language for the whole bay: warm plaster walls, neon
// dusk trims (pink, cyan, sunset orange, violet, amber, teal).
const PALETTES = [
  ['#eeddc0', '#ff5e8a'], ['#f3e9d6', '#19c2d8'], ['#ecd9bd', '#ff7847'],
  ['#e9e2d2', '#8a6cff'], ['#f0dfc4', '#ffb347'], ['#e6ddcb', '#2ec4a6'],
];

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// A vertical dusk gradient painted on a canvas: indigo zenith melting
// through violet and neon pink into a tangerine horizon.
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2c285e');
  grad.addColorStop(0.38, '#6a4390');
  grad.addColorStop(0.62, '#c65a8a');
  grad.addColorStop(0.82, '#f0834c');
  grad.addColorStop(1.0, '#ffb347');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------
// Day / night cycle. One full turn of CFG.dayCycle game-seconds runs
// day -> dusk -> night -> dawn. `darkness` 0 is full day, 1 is full
// night; building window glow planes, street-lamp heads and a small
// pool of real point lights all follow it. PB.setPhase forces a phase
// by shifting the cycle offset (used by probes and the night shot).
export const DN = {
  darkness: 0, cycleT: 0, phase: 'day', offset: 0,
  sun: null, hemi: null, domeMat: null, fog: null, bg: null,
  lampHeadMat: null, glowMesh: null, glowTotal: 0, lights: [],
};
const DN_MOON = new THREE.Color(0x8fb0e8);
const DN_DAY = { sun: 2.6, hemi: 0.95, fog: new THREE.Color(0xbcd6de), bg: new THREE.Color(0x87b5d9) };
const DN_DUSK = { fog: new THREE.Color(0xcf8a5e) };
const DN_NIGHT = { sun: 0.22, hemi: 0.22, fog: new THREE.Color(0x0e1626), bg: new THREE.Color(0x0a1224) };
function smooth01(v) { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); }

export function setPhase(name) {
  const target = name === 'night' ? 0.70 : name === 'dusk' ? 0.46 : 0.20;
  DN.offset = target * CFG.dayCycle - S.time;
}
export function phaseInfo() {
  return {
    phase: DN.phase, darkness: Math.round(DN.darkness * 100) / 100,
    cycleT: Math.round(DN.cycleT * 1000) / 1000,
    litWindows: DN.glowMesh && DN.glowMesh.visible ? DN.glowMesh.count : 0,
    glowTotal: DN.glowTotal,
    lampsOn: DN.darkness > 0.45,
  };
}
export function updateDayNight() {
  const cyc = CFG.dayCycle;
  const t = (((S.time + DN.offset) % cyc) + cyc) % cyc / cyc;
  DN.cycleT = t;
  // darkness curve: day plateau, dusk ramp, night plateau, dawn ramp
  let k = 0;
  if (t < 0.40) k = 0;
  else if (t < 0.52) k = smooth01((t - 0.40) / 0.12);
  else if (t < 0.88) k = 1;
  else k = 1 - smooth01((t - 0.88) / 0.12);
  DN.darkness = k;
  DN.phase = k <= 0.02 ? 'day' : k >= 0.98 ? 'night' : (t < 0.6 ? 'dusk' : 'dawn');
  if (!DN.sun) return;
  DN.sun.intensity = DN_DAY.sun + (DN_NIGHT.sun - DN_DAY.sun) * k;
  DN.sun.color.setHex(0xffb37a).lerp(DN_MOON, k);
  DN.hemi.intensity = DN_DAY.hemi + (DN_NIGHT.hemi - DN_DAY.hemi) * k;
  // fog: day blue-grey -> dusk amber at mid-transition -> night navy
  const duskMix = Math.sin(Math.min(1, Math.max(0, k)) * Math.PI);
  DN.fog.color.copy(DN_DAY.fog).lerp(DN_NIGHT.fog, k).lerp(DN_DUSK.fog, duskMix * 0.45);
  DN.bg.copy(DN_DAY.bg).lerp(DN_NIGHT.bg, k);
  if (DN.domeMat) DN.domeMat.color.setRGB(1 - k * 0.82, 1 - k * 0.80, 1 - k * 0.62);
  if (DN.lampHeadMat) DN.lampHeadMat.color.setHex(k > 0.45 ? 0xffd9a0 : 0x9aa0a4);
  for (const L of DN.lights) L.intensity = k * 30;
  if (DN.glowMesh) {
    const on = k > 0.45;
    DN.glowMesh.visible = on;
    if (on) DN.glowMesh.count = Math.floor(DN.glowTotal * Math.min(1, (k - 0.45) / 0.3));
  }
}

export function buildWorld(scene) {
  const H = CFG.worldHalf;
  // sky, light and mood: a gradient dome (fog-free) whose tint, the sun
  // and the fog all follow the day/night cycle in updateDayNight()
  scene.background = new THREE.Color(0x87b5d9);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 20, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  scene.add(dome);
  scene.fog = new THREE.Fog(0xbcd6de, 190, 430);
  const sun = new THREE.DirectionalLight(0xffb37a, 2.6);
  sun.position.set(-110, 95, -70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd4e8, 0x5c4632, 0.95);
  scene.add(hemi);
  DN.sun = sun; DN.hemi = hemi; DN.domeMat = dome.material; DN.fog = scene.fog; DN.bg = scene.background;

  // ground: city slab, beach band to the north, sea beyond
  const plazaTex = groundTexture('plaza'); plazaTex.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshLambertMaterial({ map: plazaTex }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const sandTex = groundTexture('sand'); sandTex.repeat.set(40, 4);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, 26), new THREE.MeshLambertMaterial({ map: sandTex }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.02, H - 4);
  beach.receiveShadow = true;
  scene.add(beach);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), new THREE.MeshPhongMaterial({ color: 0x14607e, shininess: 130, specular: 0xff9a5c }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.25, H + 130);
  scene.add(sea);
  // pier deck reaching into the water (joins the coloured static merge)
  worldColoredParts.push({ geo: new THREE.BoxGeometry(10, 0.6, 44), color: 0x8a6844, x: PLACES.pier.x, y: 0.3, z: H + 12 });
  buildUmbrellas(scene);

  // road strips with dashed centre lines (dashes instanced)
  const roadTex = roadTexture(); roadTex.repeat.set(1, 24);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const dashGeo = new THREE.BoxGeometry(0.35, 0.04, 3.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9b8 });
  const dashCount = ROAD_LINES.length * 2 * 34;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const dummy = new THREE.Object3D();
  let di = 0;
  for (const r of ROAD_LINES) {
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(13, H * 2), roadMat);
    vRoad.rotation.x = -Math.PI / 2; vRoad.position.set(r, 0.03, 0); vRoad.receiveShadow = true;
    scene.add(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, 13), roadMat);
    hRoad.rotation.x = -Math.PI / 2; hRoad.rotation.z = Math.PI / 2; hRoad.position.set(0, 0.03, r); hRoad.receiveShadow = true;
    scene.add(hRoad);
    for (let i = 0; i < 34; i++) {
      const t = -H + 9 + i * 8.6;
      dummy.position.set(r, 0.06, t); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
      dummy.position.set(t, 0.06, r); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
    }
  }
  dashes.count = di;
  scene.add(dashes);

  // continuous edge lines on both sides of every road, merged into one
  // vertex-coloured mesh (28 strips)
  const edgeParts = [];
  for (const r of ROAD_LINES) {
    for (const s of [-1, 1]) {
      edgeParts.push({ geo: new THREE.BoxGeometry(0.16, 0.02, H * 2), color: 0xd8d8cc, x: r + s * 6.15, y: 0.045, z: 0 });
      edgeParts.push({ geo: new THREE.BoxGeometry(H * 2, 0.02, 0.16), color: 0xd8d8cc, x: 0, y: 0.045, z: r + s * 6.15 });
    }
  }
  const edgeMesh = new THREE.Mesh(mergeColored(edgeParts), new THREE.MeshBasicMaterial({ vertexColors: true }));
  edgeMesh.name = 'edge-lines';
  scene.add(edgeMesh);

  // zebra crossings at every intersection: six bars across each road on
  // the north/east approach, exactly where the sidewalk network turns -
  // the spots pedestrians actually cross at. One instanced mesh.
  const zebraGeo = new THREE.BoxGeometry(0.55, 0.025, 3.0);
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xf2f0e4 });
  const zebraCount = ROAD_LINES.length * ROAD_LINES.length * 2 * 6;
  const zebras = new THREE.InstancedMesh(zebraGeo, zebraMat, zebraCount);
  zebras.name = 'zebra-crossings';
  let zi = 0;
  for (const rx of ROAD_LINES) {
    for (const rz of ROAD_LINES) {
      for (let b = 0; b < 6; b++) {
        // across the vertical road (bars parallel to its traffic flow)
        dummy.position.set(rx - 4.6 + b * 1.85, 0.05, rz + 9.6);
        dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
        zebras.setMatrixAt(zi++, dummy.matrix);
        // across the horizontal road
        dummy.position.set(rx + 9.6, 0.05, rz - 4.6 + b * 1.85);
        dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix();
        zebras.setMatrixAt(zi++, dummy.matrix);
      }
    }
  }
  zebras.count = zi;
  scene.add(zebras);
  WORLD_COUNTS.edgeLines = edgeParts.length;
  WORLD_COUNTS.zebras = zi;

  // sidewalks: REAL raised pavements - a 0.12 m slab with a darker kerb
  // lip on the road side, paving material distinct from the asphalt.
  // Pedestrians walk on top of these (groundYAt returns 0.12 there).
  // All strips merge into a single vertex-coloured mesh.
  const walkParts = [];
  for (const r of ROAD_LINES) {
    for (const s of [-1, 1]) {
      walkParts.push({ geo: new THREE.BoxGeometry(1.7, 0.12, H * 2), color: 0xa89f8c, x: r + s * SIDEWALK_OFFSET, y: 0.06, z: 0 });
      walkParts.push({ geo: new THREE.BoxGeometry(H * 2, 0.12, 1.7), color: 0xa89f8c, x: 0, y: 0.06, z: r + s * SIDEWALK_OFFSET });
      walkParts.push({ geo: new THREE.BoxGeometry(0.2, 0.13, H * 2), color: 0x655f52, x: r + s * 6.55, y: 0.065, z: 0 });
      walkParts.push({ geo: new THREE.BoxGeometry(H * 2, 0.13, 0.2), color: 0x655f52, x: 0, y: 0.065, z: r + s * 6.55 });
    }
  }
  const walks = new THREE.Mesh(mergeColored(walkParts), coloredLambert);
  walks.receiveShadow = true;
  scene.add(walks);

  // city blocks: one building per block cell, kept off the road bands.
  // No plain stacked boxes: every tower gets a neon roof trim, taller
  // ones step back into a narrower crown, and the street face carries a
  // sloped awning plus balcony slabs - silhouettes vary block to block.
  const facadeMats = PALETTES.map(([b, t], i) => new THREE.MeshLambertMaterial({ map: facadeTexture(b, t, 3 + (i % 3)) }));
  // Buildings are baked into a handful of merged meshes: one per facade
  // texture (main block + setback crown), plus one vertex-coloured mesh
  // for every neon lip, awning and balcony in the city.
  const facadeParts = PALETTES.map(() => []);
  const trimParts = [];
  // Block centres already owned by a named place or the park: the grid
  // never builds there, so no two buildings can ever overlap.
  const NAMED_CENTERS = [[20, 20], [-20, 20], [-60, 60], [-100, -20], [100, -60],
    [CFG.safehouse.x, CFG.safehouse.z], [PARK.x, PARK.z]];
  let bi = 0;
  for (let gx = -160; gx <= 120; gx += 40) {
    for (let gz = -160; gz <= 80; gz += 40) {
      const cx = gx + 20; const cz = gz + 20;
      if (Math.abs(cx) < 14 && Math.abs(cz - 30) < 16) continue;      // spawn plaza stays open
      if (distTo(cx, cz, CFG.shopDoor.x, CFG.shopDoor.z) < 17) continue; // arms block handled below
      if (distTo(cx, cz, PLACES.pier.x, PLACES.pier.z) < 27) continue;
      if (distTo(cx, cz, -2, 74) < 18) continue;                      // mission pickup corner stays open
      if (NAMED_CENTERS.some(([nx, nz]) => distTo(cx, cz, nx, nz) < 15)) continue;
      // Footprints are capped at 21 m: a block centre sits 20 m from
      // every road line, so the widest building still ends 9.5 m clear
      // of the centre line - past the kerb (8.2 m) with room to spare.
      // No building can touch a carriageway or a sidewalk, ever.
      const w = 17 + ((bi * 7) % 5); const d = 17 + ((bi * 5) % 5);
      const h = 11 + ((bi * 11) % 22);
      const pi = bi % PALETTES.length;
      const trim = PALETTES[pi][1];
      facadeParts[pi].push({ geo: new THREE.BoxGeometry(w, h, d), x: cx, y: h / 2, z: cz });
      // roof trim: a neon lip overhanging the top edge
      trimParts.push({ geo: new THREE.BoxGeometry(w + 0.7, 0.42, d + 0.7), color: trim, x: cx, y: h - 0.1, z: cz });
      // setback crown on taller towers
      if (h > 16) {
        const crownH = 3 + (bi % 3);
        facadeParts[pi].push({ geo: new THREE.BoxGeometry(w * 0.68, crownH, d * 0.68), x: cx, y: h + crownH / 2, z: cz });
        trimParts.push({ geo: new THREE.BoxGeometry(w * 0.68 + 0.5, 0.34, d * 0.68 + 0.5), color: trim, x: cx, y: h + crownH - 0.08, z: cz });
      }
      // sloped shop awning over the street face (above head height)
      trimParts.push({ geo: new THREE.BoxGeometry(w * 0.62, 0.1, 1.7), color: trim, x: cx, y: 2.75, z: cz + d / 2 + 0.72, rx: 0.42 });
      // one balcony slab with a rail line on the same face
      if (h > 19) {
        const by = 6.6 + (bi % 2) * 5.6;
        trimParts.push({ geo: new THREE.BoxGeometry(w * 0.42, 0.14, 0.95), color: 0x2c343a, x: cx - w * 0.18, y: by, z: cz + d / 2 + 0.42 });
        trimParts.push({ geo: new THREE.BoxGeometry(w * 0.42, 0.5, 0.07), color: 0x2c343a, x: cx - w * 0.18, y: by + 0.32, z: cz + d / 2 + 0.86 });
      }
      S.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
      bi++;
    }
  }
  facadeParts.forEach((parts, i) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(mergeColored(parts), facadeMats[i]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  });
  const trimMesh = new THREE.Mesh(mergeColored(trimParts), coloredLambert);
  trimMesh.receiveShadow = true;
  scene.add(trimMesh);

  // Named places sit ON block centres (20 m from every road line), so
  // their footprints obey the same clearance law as the grid towers.
  buildNamedPlace(scene, PLACES.arms, '#31435c', '#ffd34d', 'PURNAMA ARMS', 20, 20, 15, 10, 9);
  buildNamedPlace(scene, PLACES.cafe, '#f7f1e1', '#ff7847', 'KOPI OMBAK', -20, 20, 14, 9, 8);
  buildNamedPlace(scene, PLACES.garage, '#d8d3c3', '#19c2d8', 'BENGKEL SAMUDRA', -60, 60, 16, 11, 8);
  buildNamedPlace(scene, PLACES.hotel, '#f4d8a8', '#ff5e8a', 'HOTEL BULAN', -100, -20, 18, 12, 20);
  buildNamedPlace(scene, PLACES.warehouse, '#9aa3a8', '#5c6a76', 'GUDANG PELITA 9', 100, -60, 22, 14, 10);
  // safehouse: small house with a porch, no collider on the porch side
  const house = box(10, 5, 8, new THREE.MeshLambertMaterial({ map: facadeTexture('#f2e3c2', '#b8452e', 1) }), CFG.safehouse.x, 2.5, CFG.safehouse.z - 5);
  scene.add(house);
  S.colliders.push({ minX: CFG.safehouse.x - 5, maxX: CFG.safehouse.x + 5, minZ: CFG.safehouse.z - 9, maxZ: CFG.safehouse.z - 1 });
  worldColoredParts.push({ geo: new THREE.BoxGeometry(11.5, 0.7, 9.5), color: 0xa03d2a, x: CFG.safehouse.x, y: 5.4, z: CFG.safehouse.z - 5 });

  // ---- Purnama Green, the city park: textured grass, a crossing pair
  // of walking paths, benches and real trees, all inside one block.
  const grassTex = groundTexture('grass'); grassTex.repeat.set(6, 6);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(PARK.halfW * 2, PARK.halfD * 2),
    new THREE.MeshLambertMaterial({ map: grassTex }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(PARK.x, 0.045, PARK.z);
  grass.receiveShadow = true; grass.name = 'park-grass';
  scene.add(grass);
  const pathTex = groundTexture('plaza'); pathTex.repeat.set(8, 1);
  for (const rot of [0, Math.PI / 2]) {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(PARK.halfW * 2, 2.2),
      new THREE.MeshLambertMaterial({ map: pathTex }));
    path.rotation.x = -Math.PI / 2; path.rotation.z = rot;
    path.position.set(PARK.x, 0.06, PARK.z); path.name = 'park-path';
    scene.add(path);
  }
  const parkParts = [];
  const benchSpots = [[-6, -4.5], [6, -4.5], [-6, 4.5], [6, 4.5]];
  for (const [bx, bz] of benchSpots) {
    parkParts.push({ geo: new THREE.BoxGeometry(1.9, 0.09, 0.45), color: 0x8a6844, x: PARK.x + bx, y: 0.48, z: PARK.z + bz });
    parkParts.push({ geo: new THREE.BoxGeometry(1.9, 0.09, 0.4), color: 0x8a6844, x: PARK.x + bx, y: 0.78, z: PARK.z + bz - 0.24, rx: -0.3 });
    parkParts.push({ geo: new THREE.BoxGeometry(0.09, 0.48, 0.4), color: 0x2c343a, x: PARK.x + bx - 0.8, y: 0.24, z: PARK.z + bz });
    parkParts.push({ geo: new THREE.BoxGeometry(0.09, 0.48, 0.4), color: 0x2c343a, x: PARK.x + bx + 0.8, y: 0.24, z: PARK.z + bz });
  }
  const parkTreeSpots = [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, -10], [-10, 0]];
  for (const [tx, tz] of parkTreeSpots) {
    parkParts.push({ geo: new THREE.CylinderGeometry(0.14, 0.22, 2.6, 6), color: 0x6e5136, x: PARK.x + tx, y: 1.3, z: PARK.z + tz });
    parkParts.push({ geo: new THREE.SphereGeometry(1.7, 8, 6), color: 0x2e7d32, x: PARK.x + tx, y: 3.6, z: PARK.z + tz, sy: 0.85 });
    parkParts.push({ geo: new THREE.SphereGeometry(1.15, 8, 6), color: 0x43a047, x: PARK.x + tx + 0.9, y: 2.9, z: PARK.z + tz + 0.4 });
  }
  const parkMesh = new THREE.Mesh(mergeColored(parkParts), coloredLambert);
  parkMesh.name = 'park-furniture';
  parkMesh.castShadow = true;
  scene.add(parkMesh);
  WORLD_COUNTS.parkBenches = benchSpots.length;
  WORLD_COUNTS.parkTrees = parkTreeSpots.length;

  // ---- night window glow: warm emissive planes pinned to the south
  // face of the taller buildings, instanced, counted by the day/night
  // rig (invisible by day, lit at night).
  const glowSpots = [];
  {
    let gi = 0;
    for (const b of S.colliders) {
      const w = b.maxX - b.minX; const h = b.h || 9;
      if (w < 12 || h < 10) continue;
      const cols = Math.floor(w / 4.2); const rows = Math.floor(h / 4.6);
      for (let cxI = 0; cxI < cols; cxI++) {
        for (let ryI = 0; ryI < rows; ryI++) {
          gi++;
          if (gi % 3 === 0) continue; // a believable random-ish subset
          glowSpots.push([b.minX + 2.2 + cxI * 4.2, 2.4 + ryI * 4.6, b.maxZ + 0.07]);
          if (glowSpots.length >= 170) break;
        }
        if (glowSpots.length >= 170) break;
      }
      if (glowSpots.length >= 170) break;
    }
  }
  const glowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 1.5),
    new THREE.MeshBasicMaterial({ color: 0xffca7a }), Math.max(1, glowSpots.length));
  glowMesh.name = 'window-glow';
  glowSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    glowMesh.setMatrixAt(i, dummy.matrix);
  });
  glowMesh.count = glowSpots.length;
  glowMesh.visible = false;
  scene.add(glowMesh);
  DN.glowMesh = glowMesh; DN.glowTotal = glowSpots.length;

  // palms: instanced CURVED trunks (the cylinder geometry itself is
  // bent, so every trunk leans) + a crown of three crossed frond planes
  // per tree, so the canopy reads as drooping fronds, not a green disc
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.30, 6.8, 6, 5);
  trunkGeo.translate(0, 3.4, 0);
  {
    const pos = trunkGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const bend = (y / 6.8) * (y / 6.8) * 1.15;
      pos.setX(i, pos.getX(i) + bend);
    }
    trunkGeo.computeVertexNormals();
  }
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  const frondMat = new THREE.MeshLambertMaterial({ map: frondTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
  const frondGeo = new THREE.PlaneGeometry(5.6, 5.6);
  const palmSpots = [];
  for (let x = -140; x <= 140; x += 14) palmSpots.push([x, 132 + ((x * 3) % 5)]);
  for (let i = 0; i < 26; i++) {
    const x = -135 + ((i * 53) % 270); const z = -135 + ((i * 91) % 250);
    if (!isRoad(x, z) && !pointNearBuilding(x, z)) palmSpots.push([x, z]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 3);
  palmSpots.forEach(([x, z], i) => {
    const th = i * 1.7;
    dummy.position.set(x, 0, z); dummy.rotation.set(0, th, 0); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    // crown centre = the bent trunk's tip in world space
    const tx = x + Math.cos(th) * 1.15; const tz = z - Math.sin(th) * 1.15;
    for (let k = 0; k < 3; k++) {
      dummy.position.set(tx, 6.75, tz);
      dummy.rotation.set(-1.32 + k * 0.24, 0, th + k * 2.1);
      dummy.updateMatrix();
      crowns.setMatrixAt(i * 3 + k, dummy.matrix);
    }
  });
  trunks.castShadow = true;
  scene.add(trunks); scene.add(crowns);

  // street lamps: instanced poles with glowing dusk heads
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.2, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c343a });
  const lampSpots = [];
  for (const r of ROAD_LINES) for (let t = -130; t <= 130; t += 32) lampSpots.push([r + 7.4, t]);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a4 });
  const lampHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6),
    lampHeadMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 2.6, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.28, z); dummy.updateMatrix();
    lampHeads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(lamps); scene.add(lampHeads);
  DN.lampHeadMat = lampHeadMat;
  WORLD_COUNTS.lamps = lampSpots.length;
  // a small pool of REAL point lights at spread-out lamps: three lights
  // carry the city's night pools (every extra point light taxes every
  // fragment on software rasterisers, so the pool stays tiny on purpose)
  for (let i = 0; i < lampSpots.length; i += 21) {
    const pl = new THREE.PointLight(0xffb45e, 0, 24, 1.8);
    pl.position.set(lampSpots[i][0], 5.1, lampSpots[i][1]);
    scene.add(pl);
    DN.lights.push(pl);
    if (DN.lights.length >= 3) break;
  }

  // the shared coloured-static merge: pier deck, umbrellas, safehouse roof
  const coloredStatics = new THREE.Mesh(mergeColored(worldColoredParts), coloredLambert);
  coloredStatics.castShadow = true; coloredStatics.receiveShadow = true;
  scene.add(coloredStatics);
  worldColoredParts.length = 0;

  return { sea };
}

function distTo(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

function pointNearBuilding(x, z) {
  for (const c of S.colliders) {
    if (x > c.minX - 3 && x < c.maxX + 3 && z > c.minZ - 3 && z < c.maxZ + 3) return true;
  }
  return false;
}

// A named storefront: block + neon sign + a merged coloured assembly
// (roof lip, door slab, sloped awning) facing the street.
function buildNamedPlace(scene, place, wall, trim, label, bx, bz, w, d, h) {
  const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(wall, trim, 2) });
  const b = box(w, h, d, mat, bx, h / 2, bz);
  scene.add(b);
  S.colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2, h });
  const colored = new THREE.Mesh(mergeColored([
    { geo: new THREE.BoxGeometry(w + 0.6, 0.36, d + 0.6), color: trim, x: bx, y: h - 0.08, z: bz },
    { geo: new THREE.BoxGeometry(2.2, 3.4, 0.24), color: 0x4a3220, x: bx, y: 1.7, z: bz - d / 2 - 0.05 },
    { geo: new THREE.BoxGeometry(w * 0.66, 0.1, 1.8), color: trim, x: bx, y: 3.95, z: bz - d / 2 - 0.8, rx: -0.42 },
  ]), coloredLambert);
  scene.add(colored);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(13, w - 1), 2.6),
    new THREE.MeshBasicMaterial({ map: signTexture(label, '#1d2733', trim) }));
  sign.position.set(bx, h - 1.2, bz - d / 2 - 0.06);
  sign.rotation.y = Math.PI;
  scene.add(sign);
  void place;
}
