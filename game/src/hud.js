// HUD: objective panel, wanted stars + "police know" icons, big health bar,
// money, numbered weapon slots with locks and ammo, police response panel,
// vehicle name/condition/speedometer, portrait dialog, toasts, shop panel —
// and the round minimap with the shrinking search ring and blips.
import { CFG, WEAPON_SLOTS } from './config.js';
import { portraitDataURL } from './textures.js';

const $ = (id) => document.getElementById(id);

export function createHUD(handlers) {
  const els = {
    hud: $('hud'), objTitle: $('obj-title'), objText: $('obj-text'), objSub: $('obj-sub'),
    stars: $('stars'), know: $('know-icons'), health: $('health-fill'), money: $('money'),
    slots: $('slots'), ammo: $('ammo'), policeList: $('police-list'),
    arrestWrap: $('arrest-wrap'), arrestFill: $('arrest-fill'),
    vehBox: $('vehicle-box'), speedo: $('speedo'), vehName: $('veh-name'), vehCond: $('veh-cond'),
    prompt: $('prompt'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    dialog: $('dialog'), dlgName: $('dlg-name'), dlgText: $('dlg-text'),
    toast: $('toast'), shop: $('shop'), shopBal: $('shop-bal'), shopMsg: $('shop-msg'),
    minimap: $('minimap'), vignette: $('dmg-vignette'), markerLabel: $('marker-label'),
  };
  $('dlg-portrait').src = portraitDataURL();
  // build weapon slots once
  els.slots.innerHTML = WEAPON_SLOTS.map((s, i) =>
    `<div class="slot" data-slot="${s.id}"><b>${i}</b> ${s.label}<span class="lock"></span></div>`).join('');
  const slotEls = [...els.slots.querySelectorAll('.slot')];

  let toastTimer = 0;
  let dialogQueue = null, dialogDone = null;

  function showToast(msg, seconds = 2.6) {
    els.toast.textContent = msg;
    els.toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.style.opacity = '0'; }, seconds * 1000);
  }

  function nextDialog() {
    if (!dialogQueue) return;
    const line = dialogQueue.shift();
    if (!line) {
      els.dialog.style.display = 'none';
      const done = dialogDone; dialogQueue = null; dialogDone = null;
      if (done) done();
      return;
    }
    els.dlgName.textContent = line.who === 'Mira' ? 'Mira Santoso' : line.who;
    els.dlgText.textContent = line.text;
    els.dialog.style.display = 'block';
    els.dialog.classList.remove('fade-in'); void els.dialog.offsetWidth; els.dialog.classList.add('fade-in');
    if (handlers.onDialogLine) handlers.onDialogLine();
  }

  document.querySelectorAll('#shop [data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const res = handlers.onBuy(btn.dataset.buy);
      els.shopMsg.textContent = res.msg;
      els.shopMsg.style.color = res.ok ? '#8be26b' : '#ffb3a0';
    });
  });
  $('shop-close').addEventListener('click', () => handlers.onShopClose());

  const mm = els.minimap.getContext('2d');
  function drawMinimap(snap) {
    const S = 316, C = S / 2, scale = S / 360;
    mm.clearRect(0, 0, S, S);
    mm.save();
    mm.beginPath(); mm.arc(C, C, C - 2, 0, Math.PI * 2); mm.clip();
    mm.fillStyle = '#274b35'; mm.fillRect(0, 0, S, S);
    const wx = (x) => C + x * scale, wz = (z) => C + z * scale;
    // water (south bay)
    mm.fillStyle = '#14607f';
    mm.fillRect(0, wz(CFG.waterZ), S, S - wz(CFG.waterZ));
    mm.fillStyle = '#c9a66b';
    mm.fillRect(0, wz(94), S, wz(CFG.waterZ) - wz(94));
    // roads
    mm.strokeStyle = '#3c4148'; mm.lineWidth = 9;
    for (const x of [-60, 0, 60]) { mm.beginPath(); mm.moveTo(wx(x), wz(-100)); mm.lineTo(wx(x), wz(100)); mm.stroke(); }
    for (const z of [-60, -10, 40, 80]) { mm.beginPath(); mm.moveTo(wx(-100), wz(z)); mm.lineTo(wx(100), wz(z)); mm.stroke(); }
    // dock pier
    mm.fillStyle = '#7a5a38'; mm.fillRect(wx(-47), wz(94), 34 * scale, 26 * scale);
    // search ring
    if (snap.search) {
      mm.strokeStyle = snap.search.seen ? 'rgba(255,70,50,.95)' : 'rgba(255,190,60,.85)';
      mm.lineWidth = 3;
      mm.beginPath(); mm.arc(wx(snap.search.x), wz(snap.search.z), Math.max(6, snap.search.radius * scale), 0, Math.PI * 2); mm.stroke();
      mm.fillStyle = 'rgba(255,80,50,.12)';
      mm.beginPath(); mm.arc(wx(snap.search.x), wz(snap.search.z), Math.max(6, snap.search.radius * scale), 0, Math.PI * 2); mm.fill();
    }
    function blip(x, z, color, r = 5) {
      mm.fillStyle = color;
      mm.beginPath(); mm.arc(wx(x), wz(z), r, 0, Math.PI * 2); mm.fill();
    }
    blip(CFG.shopPos.x, CFG.shopPos.z, '#ff9f2e', 5); // shop
    blip(CFG.safehouse.x, CFG.safehouse.z, '#7fd069', 5); // safehouse
    if (snap.missionTarget) blip(snap.missionTarget.x, snap.missionTarget.z, '#ffd60a', 7);
    for (const b of snap.policeBlips || []) blip(b.x, b.z, '#4da3ff', 4.5);
    for (const b of snap.thugBlips || []) blip(b.x, b.z, '#ff5a4d', 4);
    // player arrow
    mm.save();
    mm.translate(wx(snap.playerPos.x), wz(snap.playerPos.z));
    mm.rotate(snap.playerHeading);
    mm.fillStyle = '#ffffff';
    mm.beginPath(); mm.moveTo(0, -9); mm.lineTo(6, 7); mm.lineTo(0, 3.5); mm.lineTo(-6, 7); mm.closePath(); mm.fill();
    mm.restore();
    mm.restore();
    // rim
    mm.strokeStyle = 'rgba(255,201,60,.55)'; mm.lineWidth = 3;
    mm.beginPath(); mm.arc(C, C, C - 3, 0, Math.PI * 2); mm.stroke();
  }

  // Objective marker label: distance to the current mission target, shown
  // mid-screen so the player always knows where the gold blip sits.
  function updateMarkerLabel(snap) {
    if (snap.missionTarget && snap.mode !== 'menu') {
      const d = Math.hypot(snap.playerPos.x - snap.missionTarget.x, snap.playerPos.z - snap.missionTarget.z);
      els.markerLabel.textContent = `▼ OBJECTIVE — ${Math.round(d)} m`;
      els.markerLabel.style.display = 'block';
    } else els.markerLabel.style.display = 'none';
  }

  return {
    els,
    showToast,
    updateMarkerLabel,
    showDialog(lines, done) { dialogQueue = [...lines]; dialogDone = done || null; nextDialog(); },
    advanceDialog() { if (dialogQueue) nextDialog(); },
    dialogOpen() { return !!dialogQueue; },
    openShop(balance) {
      els.shop.style.display = 'flex';
      els.shopBal.textContent = `Balance: ${CFG.currency} ${balance}`;
      els.shopMsg.textContent = '';
    },
    closeShop() { els.shop.style.display = 'none'; },
    shopOpen() { return els.shop.style.display === 'flex'; },
    refreshShopBalance(balance) { els.shopBal.textContent = `Balance: ${CFG.currency} ${balance}`; },
    setPrompt(html) {
      if (html) { els.prompt.innerHTML = html; els.prompt.style.display = 'block'; }
      else els.prompt.style.display = 'none';
    },
    flashHitmarker() {
      els.hitmarker.style.display = 'block';
      setTimeout(() => { els.hitmarker.style.display = 'none'; }, 90);
    },
    damageFlash(strength = 0.55) {
      els.vignette.style.boxShadow = `inset 0 0 90px rgba(220,30,20,${strength})`;
      setTimeout(() => { els.vignette.style.boxShadow = 'inset 0 0 90px rgba(220,30,20,0)'; }, 130);
    },
    update(snap) {
      els.objTitle.textContent = snap.missionTitle || 'PURNAMA BAY — FREE ROAM';
      els.objText.textContent = snap.objective || 'Explore the bay. Work for Mira to earn PB$.';
      els.objSub.textContent = snap.objectiveSub || '';
      // stars: exactly the wanted level, lit gold
      els.stars.innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= snap.wanted ? 'on' : ''}">★</span>`).join('');
      const know = [];
      if (snap.knownFace) know.push('POLICE KNOW YOUR FACE');
      if (snap.knownVehicle) know.push('POLICE KNOW YOUR VEHICLE');
      els.know.textContent = know.join(' · ');
      els.health.style.width = `${Math.max(0, snap.health)}%`;
      els.money.textContent = `${CFG.currency} ${snap.money}`;
      slotEls.forEach((el, i) => {
        const slot = WEAPON_SLOTS[i];
        const owned = slot.id === 'fists' || snap.owned[slot.id];
        el.classList.toggle('active', snap.activeWeapon === slot.id);
        el.classList.toggle('locked', !owned);
        el.querySelector('.lock').textContent = owned ? '' : '🔒 LOCKED';
      });
      els.ammo.textContent = snap.activeWeapon === 'pistol' ? `Ammo: ${snap.ammo}` : (snap.activeWeapon === 'baton' ? 'Melee — harbour issue' : 'Bare hands');
      els.crosshair.style.display = snap.activeWeapon === 'pistol' && snap.mode === 'foot' ? 'block' : 'none';
      if (snap.policePanel && snap.policePanel.length) {
        els.policeList.innerHTML = snap.policePanel.map((u) => `${u.kind} — ${u.dist} m — ${u.status}`).join('<br>');
      } else els.policeList.textContent = snap.wanted > 0 ? 'Units converging…' : 'No units dispatched';
      if (snap.arresting) {
        els.arrestWrap.style.display = 'block';
        els.arrestFill.style.width = `${Math.round(snap.arrestProgress * 100)}%`;
      } else els.arrestWrap.style.display = 'none';
      if (snap.mode === 'car' && snap.vehicle) {
        els.vehBox.style.display = 'block';
        els.speedo.innerHTML = `${Math.round(Math.abs(snap.vehicle.speed) * 3.6)} <small>km/h</small>`;
        els.vehName.textContent = snap.vehicle.name;
        els.vehCond.style.width = `${Math.max(0, snap.vehicle.health)}%`;
        els.vehCond.style.background = snap.vehicle.health > 55 ? '#7fd069' : snap.vehicle.health > 26 ? '#ffb020' : '#e33f2f';
      } else els.vehBox.style.display = 'none';
      updateMarkerLabel(snap);
      drawMinimap(snap);
    },
  };
}
