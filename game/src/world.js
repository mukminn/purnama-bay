// PURNAMA BAY - the city itself: a tropical coastal grid of roads, blocks,
// beach and pier, built from boxes and canvas textures. Also owns the list
// of named places the missions and the shop point at.
import * as THREE from 'three';
import { S, CFG } from './config.js';
import { facadeTexture, groundTexture, roadTexture, signTexture, frondTexture } from './textures.js';

export const PLACES = {
  cafe: { name: 'Kopi Ombak Cafe', x: -34, z: 26 },
  garage: { name: 'Bengkel Samudra', x: -52, z: 44 },
  warehouse: { name: 'Gudang Pelita No. 9', x: 84, z: -64 },
  hotel: { name: 'Hotel Bulan', x: -84, z: -30 },
  arms: { name: 'PURNAMA ARMS', x: CFG.shopDoor.x, z: CFG.shopDoor.z },
  safehouse: { name: "Raka's House", x: CFG.safehouse.x, z: CFG.safehouse.z },
  pier: { name: 'Purnama Pier', x: -18, z: 104 },
};

const ROAD_LINES = [-120, -80, -40, 0, 40, 80, 120];
export function isRoad(x, z) {
  for (const r of ROAD_LINES) {
    if (Math.abs(x - r) < 6.5 || Math.abs(z - r) < 6.5) return true;
  }
  return false;
}

// Beach umbrellas: small colour pops along the sand band.
function buildUmbrellas(scene) {
  const cols = [0xd96f32, 0x0f7d8c, 0xc22e2e, 0xc9973f];
  for (let i = 0; i < 9; i++) {
    const x = -120 + i * 29;
    const pole = box(0.09, 2.2, 0.09, new THREE.MeshLambertMaterial({ color: 0xe8e3d5 }), x, 1.1, 138 + (i % 3) * 3);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), new THREE.MeshLambertMaterial({ color: cols[i % cols.length] }));
    top.position.set(x, 2.4, 138 + (i % 3) * 3);
    scene.add(pole); scene.add(top);
  }
}

const PALETTES = [
  ['#f2e3c2', '#d96f32'], ['#f7f1e1', '#0f7d8c'], ['#f4d8a8', '#b8452e'],
  ['#eef0e6', '#3f7d4e'], ['#f6e7ce', '#7a4a8c'], ['#f1ead8', '#c9973f'],
];

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildWorld(scene) {
  const H = CFG.worldHalf;
  // sky, light and golden-hour mood
  scene.background = new THREE.Color(0x8fd3e8);
  scene.fog = new THREE.Fog(0xf6cf9a, 190, 420);
  const sun = new THREE.DirectionalLight(0xffdfae, 2.6);
  sun.position.set(-90, 130, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x8a6f4d, 0.9));

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
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), new THREE.MeshPhongMaterial({ color: 0x1d7fa8, shininess: 90 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.25, H + 130);
  scene.add(sea);
  // pier deck reaching into the water
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  const pier = box(10, 0.6, 44, deckMat, PLACES.pier.x, 0.3, H + 12);
  scene.add(pier);
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

  // city blocks: one building per block cell, kept off the road bands
  const facadeMats = PALETTES.map(([b, t], i) => new THREE.MeshLambertMaterial({ map: facadeTexture(b, t, 3 + (i % 3)) }));
  let bi = 0;
  for (let gx = -160; gx <= 120; gx += 40) {
    for (let gz = -160; gz <= 80; gz += 40) {
      const cx = gx + 20; const cz = gz + 20;
      if (Math.abs(cx) < 14 && Math.abs(cz - 30) < 16) continue;      // spawn plaza stays open
      if (distTo(cx, cz, CFG.shopDoor.x, CFG.shopDoor.z) < 17) continue; // arms block handled below
      if (distTo(cx, cz, PLACES.pier.x, PLACES.pier.z) < 27) continue;
      if (distTo(cx, cz, -2, 74) < 18) continue;                      // mission pickup corner stays open
      if (distTo(cx, cz, CFG.safehouse.x, CFG.safehouse.z) < 16) continue;
      const w = 17 + ((bi * 7) % 8); const d = 17 + ((bi * 5) % 8);
      const h = 11 + ((bi * 11) % 22);
      const b = box(w, h, d, facadeMats[bi % facadeMats.length], cx, h / 2, cz);
      scene.add(b);
      S.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      bi++;
    }
  }

  buildNamedPlace(scene, PLACES.arms, '#31435c', '#ffd34d', 'PURNAMA ARMS', CFG.shopDoor.x, CFG.shopDoor.z + 5.5, 15, 10, 9);
  buildNamedPlace(scene, PLACES.cafe, '#f7f1e1', '#8a4b21', 'KOPI OMBAK', PLACES.cafe.x, PLACES.cafe.z + 5, 14, 9, 8);
  buildNamedPlace(scene, PLACES.garage, '#d8d3c3', '#2e5f8a', 'BENGKEL SAMUDRA', PLACES.garage.x, PLACES.garage.z + 5, 16, 11, 8);
  buildNamedPlace(scene, PLACES.hotel, '#f4d8a8', '#b8452e', 'HOTEL BULAN', PLACES.hotel.x, PLACES.hotel.z + 5, 18, 12, 20);
  buildNamedPlace(scene, PLACES.warehouse, '#9aa3a8', '#333c44', 'GUDANG PELITA 9', PLACES.warehouse.x, PLACES.warehouse.z, 22, 14, 10);
  // safehouse: small house with a porch, no collider on the porch side
  const house = box(10, 5, 8, new THREE.MeshLambertMaterial({ map: facadeTexture('#f2e3c2', '#b8452e', 1) }), CFG.safehouse.x, 2.5, CFG.safehouse.z - 5);
  scene.add(house);
  S.colliders.push({ minX: CFG.safehouse.x - 5, maxX: CFG.safehouse.x + 5, minZ: CFG.safehouse.z - 9, maxZ: CFG.safehouse.z - 1 });
  const roof = box(11.5, 0.7, 9.5, new THREE.MeshLambertMaterial({ color: 0xa03d2a }), CFG.safehouse.x, 5.4, CFG.safehouse.z - 5);
  scene.add(roof);

  // palms: instanced trunks + frond crowns along beach and avenues
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  const frondMat = new THREE.MeshLambertMaterial({ map: frondTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
  const frondGeo = new THREE.PlaneGeometry(5.4, 5.4);
  const palmSpots = [];
  for (let x = -140; x <= 140; x += 14) palmSpots.push([x, 132 + ((x * 3) % 5)]);
  for (let i = 0; i < 26; i++) {
    const x = -135 + ((i * 53) % 270); const z = -135 + ((i * 91) % 250);
    if (!isRoad(x, z) && !pointNearBuilding(x, z)) palmSpots.push([x, z]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 3.2, z); dummy.rotation.set(0.04 * (i % 3), i, 0); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 6.6, z); dummy.rotation.set(-Math.PI / 2.4, 0, i * 0.7); dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true;
  scene.add(trunks); scene.add(crowns);

  // street lamps: instanced poles with emissive heads
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.2, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c343a });
  const lampSpots = [];
  for (const r of ROAD_LINES) for (let t = -130; t <= 130; t += 32) lampSpots.push([r + 7.4, t]);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 2.6, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  });
  scene.add(lamps);

  return { sea };
}

function distTo(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

function pointNearBuilding(x, z) {
  for (const c of S.colliders) {
    if (x > c.minX - 3 && x < c.maxX + 3 && z > c.minZ - 3 && z < c.maxZ + 3) return true;
  }
  return false;
}

// A named storefront: block + painted sign + door slab facing the street.
function buildNamedPlace(scene, place, wall, trim, label, bx, bz, w, d, h) {
  const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(wall, trim, 2) });
  const b = box(w, h, d, mat, bx, h / 2, bz);
  scene.add(b);
  S.colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(13, w - 1), 2.6),
    new THREE.MeshBasicMaterial({ map: signTexture(label, '#1d2733', trim) }));
  sign.position.set(bx, h - 1.2, bz - d / 2 - 0.06);
  sign.rotation.y = Math.PI;
  scene.add(sign);
  const door = box(2.2, 3.4, 0.24, new THREE.MeshLambertMaterial({ color: 0x4a3220 }), bx, 1.7, bz - d / 2 - 0.05);
  scene.add(door);
  void place;
}
