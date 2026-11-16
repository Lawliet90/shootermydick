// All DOM HUD / overlays / buy menu. The 3D code never touches the DOM.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    healthFill: $('health-fill'), healthNum: $('health-num'), armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    nades: $('nades'),
    timer: $('timer'), scoreV: $('score-v'), scoreJ: $('score-j'),
    aliveV: $('alive-v'), aliveJ: $('alive-j'),
    aliveVWrap: $('alive-v-wrap'), aliveJWrap: $('alive-j-wrap'),
    teamV: $('team-v'), teamJ: $('team-j'),
    money: $('money'),
    charge: $('charge-banner'), killfeed: $('killfeed'), dmg: $('dmg-indicator'),
    flashOv: $('flash-overlay'), bloodVg: $('blood-vignette'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    compass: $('compass'),
    start: $('overlay-start'), buy: $('overlay-buy'), end: $('overlay-end'), pause: $('overlay-pause'),
    mode: $('overlay-mode'),
    playGame: $('play-game'), modeComp: $('mode-comp'), modeDm: $('mode-dm'), modeBack: $('mode-back'),
    modePick: $('mode-pick'), loadoutGrid: $('loadout-grid'),
    restart: $('restart'), buyList: $('buy-list'),
    buyMoney: $('buy-money'), buyClose: $('buy-close'), buyTag: $('buy-tag'),
    endTitle: $('end-title'), endSub: $('end-sub'), endStats: $('end-stats'),
  };
  let hitT = null;
  let bannerT = null;
  let bloodT = null;
  let onBuyCb = null;

  function hideAll() { for (const o of [el.start, el.buy, el.end, el.pause, el.mode]) if (o) o.hidden = true; }

  const api = {
    setHealth(hp, armor) {
      el.healthFill.style.width = Math.max(0, hp) + '%';
      el.healthFill.style.background = hp > 50 ? '#7fb069' : hp > 25 ? '#ffb347' : '#d43d2a';
      el.healthNum.textContent = Math.ceil(Math.max(0, hp));
      el.armorNum.textContent = armor > 0 ? 'ARMOR ' + Math.ceil(armor) : '';
    },
    setAmmo(mag, reserve, name, reloading) {
      el.ammoMag.textContent = reloading ? '--' : mag;
      el.ammoReserve.textContent = '/ ' + reserve;
      el.weaponName.textContent = (name || '') + (reloading ? ' — RELOADING' : '');
    },
    setNades(frag, flash, smoke) {
      if (!el.nades) return;
      const parts = [];
      if (frag > 0) parts.push('FRAG ×' + frag);
      if (flash > 0) parts.push('FLASH ×' + flash);
      if (smoke > 0) parts.push('SMOKE ×' + smoke);
      el.nades.textContent = parts.join(' · ');
    },
    setTimer(s) {
      const v = Math.max(0, Math.ceil(s));
      el.timer.textContent = String(Math.floor(v / 60)).padStart(1, '0') + ':' + String(v % 60).padStart(2, '0');
      el.timer.style.color = v <= 10 ? '#ff6b57' : '';
    },
    setScore(wv, wj, av, aj) {
      el.scoreV.textContent = wv; el.scoreJ.textContent = wj;
      el.aliveV.textContent = av; el.aliveJ.textContent = aj;
      if (el.aliveVWrap) el.aliveVWrap.hidden = false;
      if (el.aliveJWrap) el.aliveJWrap.hidden = false;
    },
    // Competitive team labels: POLICE (Vanguard) vs TERRORISTS (Jackals).
    setTeams(vLabel, jLabel) {
      if (el.teamV) el.teamV.textContent = vLabel;
      if (el.teamJ) el.teamJ.textContent = jLabel;
    },
    // Deathmatch scoreboard: your kills vs the top rival's kills. No alive
    // counts — everyone respawns, so "(∞)" read as a bug.
    setDM(playerKills, topKills, topName) {
      if (el.teamV) el.teamV.textContent = 'YOU';
      if (el.teamJ) el.teamJ.textContent = topName || 'RIVAL';
      el.scoreV.textContent = playerKills;
      el.scoreJ.textContent = topKills;
      if (el.aliveVWrap) el.aliveVWrap.hidden = true;
      if (el.aliveJWrap) el.aliveJWrap.hidden = true;
    },
    setMoney(m) { el.money.textContent = '$' + m; },
    setCharge(text, urgent) {
      if (!text) { el.charge.hidden = true; return; }
      el.charge.hidden = false;
      el.charge.textContent = text;
      el.charge.style.borderColor = urgent ? '#d43d2a' : '#ffb347';
      el.charge.style.color = urgent ? '#ff6b57' : '#ffb347';
    },
    setCrosshair(spreadPx) {
      // Shots land exactly on the centre dot, so the gap is feedback, not
      // a scatter radius: keep it on a short leash. The raw spread used to
      // push the gap past 70 px while spraying — the four ticks scattered
      // so far apart the cross stopped reading as an aim point.
      const g = Math.round(Math.min(13, 3 + spreadPx * 0.4));
      el.crosshair.style.setProperty('--gap', g + 'px');
    },
    setCompass(yawDeg) {
      // Simple compass strip: N/E/S/W markers shift with yaw.
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      let deg = ((yawDeg % 360) + 360) % 360;
      const idx = Math.round(deg / 45) % 8;
      el.compass.textContent = '◀ ' + dirs[idx] + ' ' + Math.round(deg) + '° ▶';
    },
    hitmarker(head) {
      el.hitmarker.classList.add('on');
      el.hitmarker.style.color = head ? '#ff6b57' : '#ffb347';
      clearTimeout(hitT);
      hitT = setTimeout(() => el.hitmarker.classList.remove('on'), 110);
    },
    killfeed(text, team) {
      const div = document.createElement('div');
      div.className = 'kf ' + (team || '');
      div.textContent = text;
      el.killfeed.prepend(div);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    damageFrom(angleDeg) {
      // angleDeg: direction the damage came from, relative to view yaw.
      el.dmg.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
      el.dmg.classList.add('on');
      setTimeout(() => el.dmg.classList.remove('on'), 350);
    },
    // Red vignette flash when the player takes a hit.
    blood() {
      if (!el.bloodVg) return;
      el.bloodVg.classList.add('on');
      clearTimeout(bloodT);
      bloodT = setTimeout(() => el.bloodVg.classList.remove('on'), 420);
    },
    // Full-screen white flash (flashbang). strength 0..1; snaps on, then
    // fades out over ~2 s via the CSS transition.
    flash(strength) {
      if (!el.flashOv) return;
      const s = Math.max(0, Math.min(1, strength));
      el.flashOv.style.transition = 'none';
      el.flashOv.style.opacity = s;
      void el.flashOv.offsetWidth; // reflow so the snap applies
      el.flashOv.style.transition = 'opacity 1.8s ease-out';
      el.flashOv.style.opacity = 0;
    },
    banner(title, sub, ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.hidden = false;
      clearTimeout(bannerT);
      bannerT = setTimeout(() => { el.banner.hidden = true; }, ms);
    },
    hideBanner() { el.banner.hidden = true; },
    showStart() { hideAll(); el.start.hidden = false; },
    // Mode select — shown after PLAY GAME on the loadout screen.
    showMode(pickName) {
      hideAll();
      if (el.modePick) el.modePick.textContent = 'Primary weapon: ' + (pickName || '—');
      el.mode.hidden = false;
    },
    // Pre-game loadout: one card per primary weapon; exactly one selected.
    buildLoadout(weapons, selectedId, onPick) {
      if (!el.loadoutGrid) return;
      const KIND = { vk7: 'RIFLE · FULL-AUTO', ratter: 'SMG · FULL-AUTO', breacher: 'SHOTGUN · PUMP', longbow: 'SNIPER · BOLT-ACTION', ak47: 'RIFLE · FULL-AUTO', awp: 'SNIPER · BOLT-ACTION', m4a1s: 'RIFLE · SILENCED' };
      el.loadoutGrid.innerHTML = '';
      const cards = {};
      const paint = (sel) => {
        for (const id of Object.keys(cards)) {
          const on = id === sel;
          cards[id].classList.toggle('selected', on);
          cards[id].querySelector('.wc-badge').textContent = on ? '● SELECTED' : 'TAP TO SELECT';
        }
      };
      for (const w of weapons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wcard';
        b.innerHTML = `<span class="wc-head"><span class="wc-name">${w.name}</span><span class="wc-price">$${w.price}</span></span><span class="wc-kind">${KIND[w.id] || (w.kind || '').toUpperCase()}</span><span class="wc-desc">${w.desc}</span><span class="wc-badge"></span>`;
        b.addEventListener('click', () => { paint(w.id); if (onPick) onPick(w.id); });
        cards[w.id] = b;
        el.loadoutGrid.appendChild(b);
      }
      paint(selectedId);
    },
    showPause() { hideAll(); el.pause.hidden = false; },
    hideOverlays() { hideAll(); },
    showEnd(title, sub, stats) {
      hideAll();
      el.endTitle.textContent = title;
      el.endSub.textContent = sub || '';
      el.endStats.textContent = stats || '';
      el.end.hidden = false;
    },
    showBuy(catalogue, money, owned, nades, hasKit, hasArmor, free, pickId) {
      hideAll();
      if (el.buyTag) el.buyTag.textContent = free ? 'LOADOUT — EVERYTHING FREE' : 'BUY PHASE';
      el.buyMoney.textContent = free ? 'FREE' : '$' + money;
      el.buyClose.textContent = free ? 'START MATCH' : 'START ROUND';
      el.buyList.innerHTML = '';
      const rows = [];
      for (const w of catalogue.weapons) {
        rows.push({ id: w.id, name: w.name, price: w.price, desc: w.desc, owned: !!owned[w.id], key: w.slot });
      }
      for (const gi of catalogue.gear) {
        let ownedGear = false;
        if (gi.id === 'spark9') ownedGear = nades.frag > 0;
        else if (gi.id === 'flash') ownedGear = nades.flash > 0;
        else if (gi.id === 'smoke') ownedGear = nades.smoke > 0;
        else if (gi.id === 'kit') ownedGear = hasKit;
        else if (gi.id === 'kevlar' || gi.id === 'helmet') ownedGear = hasArmor;
        rows.push({ id: gi.id, name: gi.name + (gi.id === 'spark9' && nades.frag > 0 ? ' ×' + nades.frag : '') + (gi.id === 'flash' && nades.flash > 0 ? ' ×' + nades.flash : '') + (gi.id === 'smoke' && nades.smoke > 0 ? ' ×' + nades.smoke : ''), price: gi.price, desc: gi.desc, owned: ownedGear, key: null });
      }
      for (const r of rows) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wcard' + (r.owned ? ' owned' : '') + (pickId && r.id === pickId ? ' picked' : '');
        const price = r.owned && r.key ? 'OWNED' : free ? 'FREE' : '$' + r.price;
        const badge = pickId && r.id === pickId ? '<span class="wc-badge">YOUR PICK</span>' : '';
        b.innerHTML = `<span class="wc-head"><span class="wc-name">${r.name}</span><span class="wc-price">${price}</span></span><span class="wc-desc">${r.desc}</span><span class="wc-foot"><span class="wc-key">${r.key ? 'KEY ' + r.key : 'GEAR'}</span>${badge}</span>`;
        b.addEventListener('click', () => { if (onBuyCb) onBuyCb(r.id); });
        el.buyList.appendChild(b);
      }
      el.buy.hidden = false;
    },
    hideBuy() { el.buy.hidden = true; },
    onPlayGame(cb) { el.playGame.addEventListener('click', cb); },
    onModeComp(cb) { el.modeComp.addEventListener('click', cb); },
    onModeDm(cb) { el.modeDm.addEventListener('click', cb); },
    onModeBack(cb) { if (el.modeBack) el.modeBack.addEventListener('click', cb); },
    onRestart(cb) { el.restart.addEventListener('click', cb); },
    onBuy(cb) { onBuyCb = cb; },
    onCloseBuy(cb) { el.buyClose.addEventListener('click', cb); },
    onResume(cb) { const b = $('resume'); if (b) b.addEventListener('click', cb); },
  };
  return api;
}
