// Purnama Bay world: a tropical coastal district built from boxes and canvas
// textures — road grid, signed shops, a working dock with cranes and containers,
// palm-lined shore road, billboards, lamps and golden-hour light.
import * as THREE from '../vendor/three.module.min.js';
import { CFG, ROADS, PLACES } from './config.js';
import { facadeTexture, asphaltTexture, sidewalkTexture, woodTexture, waterTexture, sandTexture } from './textures.js';

const SIGNS = [
  ['KOPI OMBAK', '#ffd98a'], ['BENGKEL SAMUDRA', '#9ad1ff'], ['WARUNG SARI', '#ffb3a0'],
  ['HOTEL BULAN', '#d8b4ff'], ['TOKO RINA', '#a8ffc9'], ['LAUNDRY KILAT', '#ffe28a'],
  ['APOTEK SEHAT', '#a0e8ff'], ['ROTI PANAS', '#ffc98a'], ['BARBER BAY', '#f2f2f2'],
  ['MINIMARKET 24', '#ff9db0'],
];
const FACADE_BASES = ['#b08968', '#8d99ae', '#a26769', '#669bbc', '#bc6c25', '#7f8c8d', '#dda15e', '#6d6875'];

export function buildWorld(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const addCollider = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  // --- light: low warm sun, golden hour ---
  scene.fog = new THREE.Fog(0xf2a56b, 90, 300);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf7b267, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-70, 55, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0004;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x35506b, 0.85));
  const bounce = new THREE.DirectionalLight(0x7fb2d9, 0.35);
  bounce.position.set(60, 30, 80);
  scene.add(bounce);

  // --- ground: sand base, city slab, beach, water ---
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), new THREE.MeshLambertMaterial({ map: sandTexture() }));
  sand.rotation.x = -Math.PI / 2; sand.position.y = -0.05; sand.receiveShadow = true;
  scene.add(sand);
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(210, 210), new THREE.MeshLambertMaterial({ map: sidewalkTexture() }));
  slab.rotation.x = -Math.PI / 2; slab.position.set(0, 0, -5); slab.receiveShadow = true;
  scene.add(slab);
  const waterTex = waterTexture();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(460, 150), new THREE.MeshLambertMaterial({ map: waterTex }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.25, CFG.waterZ + 72);
  scene.add(water);

  // --- roads (asphalt strips over the slab) ---
  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: asphalt });
  const dashTransforms = [];
  function road(x, z, w, d) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true;
    scene.add(m);
    // dashed centre line — collected and drawn as ONE instanced mesh
    const len = Math.max(w, d), alongX = w > d;
    for (let s = -len / 2 + 4; s < len / 2 - 2; s += 7) {
      dashTransforms.push({ x: x + (alongX ? s : 0), z: z + (alongX ? 0 : s), alongX });
    }
  }
  road(ROADS.ringX[0], -10, ROADS.width, 190);
  road(ROADS.ringX[1], -10, ROADS.width, 190);
  road(0, ROADS.ringZ[0], 190, ROADS.width);
  road(0, ROADS.ringZ[1], 190, ROADS.width);
  road(ROADS.midX, -10, ROADS.width, 190);
  road(0, ROADS.midZ, 190, ROADS.width);
  road(0, 80, 210, ROADS.width); // shore road
  road(-46, 62, ROADS.width, 46); // dock spur
  {
    const dashGeo = new THREE.PlaneGeometry(3.4, 0.35);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
    const inst = new THREE.InstancedMesh(dashGeo, dashMat, dashTransforms.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    dashTransforms.forEach((d, i) => {
      e.set(-Math.PI / 2, 0, d.alongX ? 0 : Math.PI / 2);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(d.x, 0.04, d.z), q, one);
      inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // --- buildings on the blocks between roads ---
  const blockCenters = [];
  for (const bx of [-88, -30, 30, 88]) for (const bz of [-85, -35, 15, 62]) {
    if (Math.abs(bx) < 20 && Math.abs(bz - 62) < 14) continue;
    blockCenters.push([bx + (Math.random() - 0.5) * 6, bz + (Math.random() - 0.5) * 6]);
  }
  const shopFronts = [];
  let signIdx = 0;
  blockCenters.forEach(([bx, bz], i) => {
    const base = FACADE_BASES[i % FACADE_BASES.length];
    const isShop = i % 3 === 0 && signIdx < SIGNS.length;
    const [sign, signColor] = isShop ? SIGNS[signIdx++] : [null, null];
    const w = 13 + (i % 4) * 2.4, d = 12 + (i % 3) * 2.6, h = 9 + ((i * 7) % 5) * 3.4;
    const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(base, sign, signColor) });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(bx, h / 2, bz);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.5, d + 0.7), new THREE.MeshLambertMaterial({ color: 0x4a4238 }));
    roof.position.set(bx, h + 0.25, bz); roof.castShadow = true;
    scene.add(roof);
    addCollider(bx, bz, w, d);
    if (isShop) shopFronts.push({ name: sign, pos: { x: bx, z: bz + d / 2 + 1.6 }, face: { x: bx, z: bz } });
  });

  // --- the weapon shop: unmistakable, signed, lit doorway ---
  const shopPos = CFG.shopPos;
  const shopMat = new THREE.MeshLambertMaterial({ map: facadeTexture('#5b4a3f', PLACES.shopName, '#ffcf4d') });
  const shop = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 11), shopMat);
  shop.position.set(shopPos.x, 4, shopPos.z - 7);
  shop.castShadow = true; shop.receiveShadow = true;
  scene.add(shop);
  addCollider(shopPos.x, shopPos.z - 7, 15, 11);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 3.4), new THREE.MeshLambertMaterial({ color: 0xb33a2b }));
  awning.position.set(shopPos.x, 3.4, shopPos.z + 0.4); awning.rotation.x = 0.3; awning.castShadow = true;
  scene.add(awning);
  shopFronts.push({ name: PLACES.shopName, pos: { x: shopPos.x, z: shopPos.z + 1.6 }, face: { x: shopPos.x, z: shopPos.z - 7 }, isArms: true });

  return finishWorld(scene, { colliders, shopFronts, waterTex, sun });
}

// Second half of the build: dock, safehouse, palms, lamps, billboards, props.
function finishWorld(scene, base) {
  const { colliders, shopFronts, waterTex, sun } = base;
  const addCollider = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  const woodMat = new THREE.MeshLambertMaterial({ map: woodTexture() });

  // --- dock: wooden pier, containers, crates, a simple crane ---
  const pier = new THREE.Mesh(new THREE.BoxGeometry(34, 0.7, 30), woodMat);
  pier.position.set(-30, 0.35, 108); pier.receiveShadow = true; pier.castShadow = true;
  scene.add(pier);
  const contColors = [0xc0392b, 0x2471a3, 0x229954, 0xca6f1e, 0x707b7c, 0x7d3c98];
  const dockProps = [];
  contColors.forEach((col, i) => {
    const x = -44 + (i % 3) * 11, z = 100 + Math.floor(i / 3) * 9;
    const cont = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.7, 2.6), new THREE.MeshLambertMaterial({ color: col }));
    cont.position.set(x, 1.7, z); cont.castShadow = true; cont.receiveShadow = true;
    cont.rotation.y = (i % 2) * 0.12;
    scene.add(cont); dockProps.push(cont);
    if (i < 4) addCollider(x, z, 6.4, 2.8);
  });
  for (let i = 0; i < 9; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), woodMat);
    crate.position.set(-16 + (i % 3) * 2.2, 1.25 + Math.floor(i / 6) * 1.15, 100 + (i % 2) * 3.4);
    crate.castShadow = true;
    scene.add(crate); dockProps.push(crate);
  }
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 15, 0.8), craneMat); legL.position.set(-38, 7.5, 112);
  const legR = legL.clone(); legR.position.x = -22;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(20, 0.9, 0.9), craneMat); beam.position.set(-30, 15, 112);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6, 0.12), craneMat); cable.position.set(-27, 11.8, 112);
  const hookBox = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 2), new THREE.MeshLambertMaterial({ color: 0x2471a3 }));
  hookBox.position.set(-27, 8.4, 112);
  [legL, legR, beam, cable, hookBox].forEach((m) => { m.castShadow = true; scene.add(m); });

  // --- warehouse (mission 4): open-front shed on the dock spur ---
  const wh = { x: -46, z: 66, w: 17, d: 13 };
  const whMat = new THREE.MeshLambertMaterial({ map: facadeTexture('#6e5a44', PLACES.warehouse, '#ffd98a') });
  const whBack = new THREE.Mesh(new THREE.BoxGeometry(wh.w, 6, 0.6), whMat); whBack.position.set(wh.x, 3, wh.z - wh.d / 2);
  const whL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, wh.d), whMat); whL.position.set(wh.x - wh.w / 2, 3, wh.z);
  const whR = whL.clone(); whR.position.x = wh.x + wh.w / 2;
  const whRoof = new THREE.Mesh(new THREE.BoxGeometry(wh.w + 1, 0.4, wh.d + 1), new THREE.MeshLambertMaterial({ color: 0x54443a }));
  whRoof.position.set(wh.x, 6.2, wh.z);
  [whBack, whL, whR, whRoof].forEach((m) => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  addCollider(wh.x, wh.z - wh.d / 2, wh.w, 0.8);
  addCollider(wh.x - wh.w / 2, wh.z, 0.8, wh.d);
  addCollider(wh.x + wh.w / 2, wh.z, 0.8, wh.d);
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0xb03a2e, emissive: 0x550f08 }));
  ledger.position.set(wh.x, 1.05, wh.z - 3);
  scene.add(ledger);
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 2.4), woodMat);
  pallet.position.set(wh.x, 0.45, wh.z - 3); pallet.castShadow = true;
  scene.add(pallet);

  // --- safehouse: small house by the shore road, clothes point inside the yard ---
  const sh = CFG.safehouse;
  const house = new THREE.Mesh(new THREE.BoxGeometry(9, 4.6, 7.5), new THREE.MeshLambertMaterial({ map: facadeTexture('#e8d8b0', 'RUMAH RAKA', '#7fb069') }));
  house.position.set(sh.x, 2.3, sh.z - 6); house.castShadow = true; house.receiveShadow = true;
  scene.add(house);
  addCollider(sh.x, sh.z - 6, 9, 7.5);
  const roofH = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.4, 4), new THREE.MeshLambertMaterial({ color: 0xa6492e }));
  roofH.position.set(sh.x, 5.8, sh.z - 6); roofH.rotation.y = Math.PI / 4; roofH.castShadow = true;
  scene.add(roofH);

  // --- palms along the shore and streets (instanced: 2 draw calls total) ---
  const palmSpots = [];
  for (let x = -95; x <= 95; x += 16) { palmSpots.push({ x, z: 92.5, s: 0.9 + ((x * 7) % 3) * 0.12 }); palmSpots.push({ x: x + 8, z: -68, s: 0.85 }); }
  for (let z = -50; z <= 30; z += 20) { palmSpots.push({ x: -68, z, s: 0.9 }); palmSpots.push({ x: 68, z: z + 6, s: 0.95 }); }
  {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 5.4, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b42 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    const leafGeo = new THREE.PlaneGeometry(2.9, 0.65);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3e8e4f, side: THREE.DoubleSide });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, palmSpots.length * 6);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let li = 0;
    palmSpots.forEach((p, i) => {
      e.set(0, 0, 0.07); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, 2.7 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m4);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        e.set(-0.5, -a, 0, 'YXZ'); q.setFromEuler(e);
        m4.compose(
          new THREE.Vector3(p.x + Math.cos(a) * 1.15 * p.s, 5.6 * p.s, p.z + Math.sin(a) * 1.15 * p.s),
          q, new THREE.Vector3(p.s, p.s, p.s),
        );
        leaves.setMatrixAt(li++, m4);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    trunks.castShadow = true;
    scene.add(trunks); scene.add(leaves);
  }

  // --- street lamps (instanced poles + glowing bulbs) ---
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe6a3, emissive: 0xffc45e });
  {
    const spots = [];
    for (let x = -90; x <= 90; x += 30) for (const z of [-66, -16, 34, 74]) spots.push({ x, z });
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), lampMat, spots.length);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 8), bulbMat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((s, i) => {
      m4.makeTranslation(s.x, 2.8, s.z); poles.setMatrixAt(i, m4);
      m4.makeTranslation(s.x, 5.7, s.z); bulbs.setMatrixAt(i, m4);
    });
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    scene.add(poles); scene.add(bulbs);
  }

  // --- two big billboards ---
  function billboard(x, z, ry, text, color) {
    const grp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), lampMat); post.position.y = 4.5;
    const [bc, bg2] = (() => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; return [cv, cv.getContext('2d')]; })();
    bg2.fillStyle = '#17324a'; bg2.fillRect(0, 0, 512, 160);
    bg2.fillStyle = color; bg2.font = 'bold 52px system-ui, sans-serif'; bg2.textAlign = 'center';
    bg2.fillText(text, 256, 78);
    bg2.font = '24px system-ui, sans-serif'; bg2.fillStyle = '#cfe8ff';
    bg2.fillText('PURNAMA BAY - LIVE THE TIDE', 256, 122);
    const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(13, 4.2, 0.3), new THREE.MeshLambertMaterial({ map: btex, emissive: 0x333333 }));
    panel.position.y = 10.4; panel.castShadow = true;
    grp.add(post); grp.add(panel);
    grp.position.set(x, 0, z); grp.rotation.y = ry;
    scene.add(grp);
  }
  billboard(-72, 74, 0.5, 'SELAMAT DATANG', '#ffd166');
  billboard(74, -70, -0.6, 'GELORA GT - NEW', '#ff8fa3');

  // --- benches + market umbrellas near the cafe strip ---
  const benchMat = woodMat;
  for (let i = 0; i < 6; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), benchMat);
    bench.position.set(-70 + i * 4.5, 0.55, 86); bench.castShadow = true;
    scene.add(bench);
  }

  return {
    colliders,
    shopFronts,
    warehouse: { ...wh, ledgerPos: { x: wh.x, z: wh.z - 3 } },
    sun,
    update(dt, t) {
      waterTex.offset.y = (t * 0.014) % 1;
      waterTex.offset.x = Math.sin(t * 0.05) * 0.02;
    },
    // Push a circle (x,z,r) out of every building collider; returns corrected [x,z].
    collide(x, z, r) {
      for (const c of colliders) {
        const nx = Math.max(c.minX, Math.min(c.maxX, x));
        const nz = Math.max(c.minZ, Math.min(c.maxZ, z));
        const dx = x - nx, dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            x = nx + (dx / d) * r; z = nz + (dz / d) * r;
          } else {
            // centre inside the box: push out along the smallest exit
            const exits = [x - c.minX + r, c.maxX - x + r, z - c.minZ + r, c.maxZ - z + r];
            const m = Math.min(...exits);
            if (m === exits[0]) x = c.minX - r; else if (m === exits[1]) x = c.maxX + r;
            else if (m === exits[2]) z = c.minZ - r; else z = c.maxZ + r;
          }
        }
      }
      const H = CFG.worldHalf;
      x = Math.max(-H, Math.min(H, x));
      z = Math.max(-100, Math.min(CFG.waterZ + 16, z));
      return [x, z];
    },
  };
}
