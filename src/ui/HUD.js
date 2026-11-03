// In-game heads-up display (DOM overlay): ammo, health, crosshair, hitmarkers,
// damage direction, minimap/radar, compass, objective markers, killfeed,
// subtitles, prompts, scoreboard and scope overlays.
import * as THREE from '../lib/three.js';
import { EQUIPMENT, WEAPONS } from '../weapons/WeaponData.js';
import { CHARACTERS } from '../campaign/Story.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { escapeHtml, clamp } from '../core/Utils.js';

const SPEAKER = {
  PILOT: 'Raven 2-1', REYES: 'Capt. Reyes', HATCH: 'Sgt. Sorokin', TEX: 'Cpl. Hale', WATCHTOWER: 'Watchtower', HART: 'Dr. Hart',
  VASKO: 'Anton Vasko', KESSLER: 'Kessler', COLE: 'Cole',
};

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-vignette" id="h-vig"></div>
      <div class="hud-suppress" id="h-sup"></div>
      <canvas class="hud-after" id="h-after" width="480" height="270"></canvas>
      <div class="hud-flash" id="h-flash"></div>
      <div class="scope" id="h-scope" hidden>
        <div class="scope-mask"></div>
        <svg class="scope-reticle" viewBox="-100 -100 200 200" id="h-scope-svg"></svg>
        <div class="scope-breath" id="h-breath"><span></span></div>
        <div class="scope-tag" id="h-scope-tag"></div>
      </div>
      <div class="letterbox top" id="h-lb1"></div><div class="letterbox bottom" id="h-lb2"></div>
      <div class="location-card" id="h-loc"></div>
      <div class="markers" id="h-markers"></div>
      <div class="crosshair" id="h-cross"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><b></b></div>
      <div class="hitmarker" id="h-hit"><i></i><i></i><i></i><i></i></div>
      <div class="hurt-dirs" id="h-hurt"></div>
      <div class="compass"><div class="compass-strip" id="h-compass"></div><div class="compass-needle"></div></div>
      <div class="mode-info" id="h-mode"></div>
      <div class="timer" id="h-timer" hidden></div>
      <div class="grap" id="h-grap" hidden></div>
      <div class="detect" id="h-detect" hidden><div class="det-label"></div><div class="det-bar"><div></div></div></div>
      <div class="boss" id="h-boss" hidden><div class="boss-name" id="h-boss-name"></div><div class="boss-bar"><div id="h-boss-fill"></div></div></div>
      <div class="objective" id="h-obj" hidden><div class="obj-label">OBJECTIVE</div><div class="obj-text" id="h-obj-text"></div><div class="obj-sub" id="h-obj-sub"></div></div>
      <div class="killfeed" id="h-feed"></div>
      <div class="big-msg" id="h-big"><div class="big-title"></div><div class="big-sub"></div></div>
      <div class="toasts" id="h-toasts"></div>
      <div class="prompt" id="h-prompt" hidden><div class="prompt-text"></div><div class="prompt-bar"><div></div></div></div>
      <div class="subtitles" id="h-subs"></div>
      <div class="callouts" id="h-callouts"></div>
      <div class="comms" id="h-comms" hidden></div>
      <div class="ptt" id="h-ptt" hidden><div class="ptt-mic"><i></i><i></i><i></i></div><div class="ptt-text"></div></div>
      <div class="squad-status" id="h-squad" hidden></div>
      <div class="hint" id="h-hint"></div>
      <div class="grenade-warn" id="h-gren" hidden>✹</div>
      <div class="cook" id="h-cook" hidden></div>
      <div class="minimap"><canvas id="h-map" width="200" height="200"></canvas><div class="mm-north">N</div></div>
      <div class="vitals">
        <div class="stance" id="h-stance"></div><div class="nvg-tag" id="h-nvgtag" hidden>NVG</div>
        <div class="hp"><div class="hp-label">HEALTH</div><div class="hp-bar"><div id="h-hp-fill"></div></div><div class="hp-num" id="h-hp-num">100</div></div>
      </div>
      <div class="weapon-panel">
        <div class="wp-name" id="h-wname"></div>
        <div class="wp-ammo"><span id="h-mag">30</span><small id="h-res">/ 180</small></div>
        <div class="wp-meta"><span id="h-mode-fire"></span><span class="eq" id="h-lethal"></span><span class="eq" id="h-tactical"></span><span class="eq laser-tag" id="h-laser" hidden></span></div>
        <div class="wp-reload" id="h-reload"></div>
      </div>
      <div class="death-card" id="h-death" hidden><div class="dc-title"></div><div class="dc-sub"></div><div class="dc-timer"></div></div>
      <div class="scoreboard" id="h-score" hidden></div>
      <div class="fps" id="h-fps" hidden></div>
    `;
    const $ = (id) => root.querySelector(id);
    this.el = {
      vig: $('#h-vig'), sup: $('#h-sup'), flash: $('#h-flash'), scope: $('#h-scope'), scopeSvg: $('#h-scope-svg'), breath: $('#h-breath'), scopeTag: $('#h-scope-tag'),
      lb1: $('#h-lb1'), lb2: $('#h-lb2'), loc: $('#h-loc'), markers: $('#h-markers'), cross: $('#h-cross'), hit: $('#h-hit'), hurt: $('#h-hurt'),
      compass: $('#h-compass'), mode: $('#h-mode'), timer: $('#h-timer'), boss: $('#h-boss'), bossName: $('#h-boss-name'), bossFill: $('#h-boss-fill'),
      obj: $('#h-obj'), objText: $('#h-obj-text'), objSub: $('#h-obj-sub'), feed: $('#h-feed'), big: $('#h-big'), toasts: $('#h-toasts'),
      prompt: $('#h-prompt'), subs: $('#h-subs'), callouts: $('#h-callouts'), hint: $('#h-hint'), gren: $('#h-gren'), cook: $('#h-cook'),
      map: $('#h-map'), stance: $('#h-stance'), hpFill: $('#h-hp-fill'), hpNum: $('#h-hp-num'), wname: $('#h-wname'), mag: $('#h-mag'), res: $('#h-res'),
      fire: $('#h-mode-fire'), lethal: $('#h-lethal'), tactical: $('#h-tactical'), reload: $('#h-reload'), death: $('#h-death'), score: $('#h-score'), fps: $('#h-fps'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this._buildCompass();
    this.markerEls = [];
    this.tagEls = [];
    this.subQueue = [];
    this.subT = 0;
    this.hitT = 0;
    this.frame = 0;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.reset();
  }

  reset() {
    this.subQueue = [];
    this.el.subs.innerHTML = '';
    this.el.feed.innerHTML = '';
    this.el.toasts.innerHTML = '';
    this.el.obj.hidden = true;
    this.el.timer.hidden = true;
    this.el.boss.hidden = true;
    this.el.death.hidden = true;
    this.el.prompt.hidden = true;
    this.el.score.hidden = true;
    this.el.mode.innerHTML = '';
    this.el.hint.textContent = '';
    this.el.loc.innerHTML = '';
    this.el.big.classList.remove('show');
    this.letterbox(false);
    this.mapImage = null;
    this.reticleKind = null;
  }

  _buildCompass() {
    const marks = [];
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let rep = -1; rep <= 1; rep++) {
      for (let d = 0; d < 360; d += 15) {
        const deg = d + rep * 360;
        const lab = labels[d];
        marks.push(`<span class="cm ${lab ? 'major' : ''}" style="left:${deg * 4}px">${lab ?? (d % 45 === 0 ? '' : d)}</span>`);
      }
    }
    this.el.compass.innerHTML = marks.join('') + '<div class="cm-obj" id="h-cobj"></div>';
    this.compassObj = this.el.compass.querySelector('#h-cobj');
  }

  // ---------- event API ----------
  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 1800);
  }

  hint(text, seconds = 5) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.el.hint.classList.remove('show'), seconds * 1000);
  }

  hitmarker(kill, head) {
    const h = this.el.hit;
    h.classList.remove('show', 'kill', 'head');
    void h.offsetWidth;
    h.classList.add('show');
    if (kill) h.classList.add('kill');
    if (head) h.classList.add('head');
  }

  killfeed(killer, victim, weapon, head, killerIsPlayer, victimIsPlayer, killerFriendly) {
    const row = document.createElement('div');
    row.className = 'kf' + (killerIsPlayer ? ' mine' : '') + (victimIsPlayer ? ' me-died' : '');
    row.innerHTML = `<span class="${killerFriendly ? 'fr' : 'en'}">${escapeHtml(killer)}</span> <em>[${escapeHtml(weapon)}${head ? ' ⌖' : ''}]</em> <span class="${killerFriendly ? 'en' : 'fr'}">${escapeHtml(victim)}</span>`;
    this.el.feed.prepend(row);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 6000);
  }

  prompt(html, progress = 0) {
    const p = this.el.prompt;
    if (!html) { p.hidden = true; return; }
    p.hidden = false;
    if (p._html !== html) { p.querySelector('.prompt-text').innerHTML = html; p._html = html; }
    p.querySelector('.prompt-bar').style.visibility = progress > 0 ? 'visible' : 'hidden';
    p.querySelector('.prompt-bar div').style.width = `${clamp(progress, 0, 1) * 100}%`;
  }

  grenadeWarning(g) {
    this.grenade = g;
  }

  /** Radio menu (Y): numbered squad orders. */
  commsMenu(open, orders = [], holdFire = false, squadCount = 0) {
    const el = this.root.querySelector('#h-comms');
    el.hidden = !open;
    if (!open) return;
    const rows = orders.map((o, i) => {
      const label = o.id === 'fire' ? (holdFire ? 'Weapons free' : 'Hold fire') : o.label;
      const hint = o.id === 'fire' ? (holdFire ? 'squad fires at will' : 'squad fires only when you fire') : o.hint;
      return `<div class="cm-row"><kbd>${i + 1}</kbd><span class="cm-l">${escapeHtml(label)}</span><span class="cm-h">${escapeHtml(hint)}</span></div>`;
    }).join('');
    el.innerHTML = `<div class="cm-head">RADIO · SQUAD <span>${squadCount ? `${squadCount} ON NET` : 'NO SQUAD'}</span></div>${rows}<div class="cm-foot"><kbd>H</kbd> On me! &nbsp; <kbd>K</kbd> hold to talk &nbsp; <kbd>Y</kbd> close</div>`;
  }

  /** Push-to-talk state: 'listen' | 'heard' | 'miss' | 'error' | 'unsupported' | null. */
  ptt(state, text = '') {
    const el = this.root.querySelector('#h-ptt');
    clearTimeout(this._pttHide);
    if (!state) { el.hidden = true; return; }
    el.hidden = false;
    el.className = `ptt s-${state}`;
    const t = el.querySelector('.ptt-text');
    t.textContent = state === 'listen' ? (text ? `"${text}"` : 'LISTENING… say an order') : state === 'heard' ? `"${text}"` : state === 'miss' ? `Didn't catch an order: "${text}"` : text;
    if (state !== 'listen') this._pttHide = setTimeout(() => { el.hidden = true; }, state === 'heard' ? 1400 : 3200);
  }

  squadStatus(text) {
    if (this._squadTxt === text) return;
    this._squadTxt = text;
    const el = this.root.querySelector('#h-squad');
    el.hidden = !text;
    el.textContent = text;
  }

  callout(name, text, friendly) {
    const c = document.createElement('div');
    c.className = `callout ${friendly ? 'fr' : 'en'}`;
    c.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
    this.el.callouts.appendChild(c);
    setTimeout(() => c.remove(), 2200);
  }

  /** Ride-in mode: hide combat HUD, keep subtitles, prompts and the location card. */
  insertion(on) {
    this.root.classList.toggle('insertion', on);
  }

  /** Burn the frame the flashbang went off on into the afterimage layer. */
  flashAfterimage(canvas) {
    const c = (this._afterEl ??= this.root.querySelector('#h-after'));
    try {
      const x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(canvas, 0, 0, c.width, c.height);
    } catch { /* tainted or unavailable: white-out only */ }
  }

  nvg(on) {
    if (this._nvg === on) return;
    this._nvg = on;
    this.root.querySelector('#h-nvgtag').hidden = !on;
  }

  letterbox(on) {
    this.el.lb1.classList.toggle('on', on);
    this.el.lb2.classList.toggle('on', on);
    this.root.classList.toggle('cinematic', on);
  }

  locationCard(lines) {
    const el = this.el.loc;
    el.innerHTML = lines.map((l, i) => `<div class="loc-line l${i}"></div>`).join('');
    const divs = [...el.children];
    let li = 0, ci = 0;
    clearInterval(this._locT);
    clearTimeout(this._locFade);
    this._locT = setInterval(() => {
      if (li >= lines.length) {
        clearInterval(this._locT);
        this.fadeLocation(3.5);
        return;
      }
      ci++;
      divs[li].textContent = lines[li].slice(0, ci);
      if (ci % 2 === 0) Audio.ui('type');
      if (ci >= lines[li].length) { li++; ci = 0; }
    }, 38);
    el.classList.remove('fade');
  }

  fadeLocation(delay = 0) {
    clearTimeout(this._locFade);
    this._locFade = setTimeout(() => this.el.loc.classList.add('fade'), delay * 1000);
  }

  /** Drop queued and current subtitles (a clip cuts in with its own dialogue). */
  clearSubs() {
    this.subQueue.length = 0;
    this.curSub = null;
    this.el.subs.innerHTML = '';
  }

  say(lines) {
    if (!Store.settings.subtitles && !lines.length) return;
    for (const l of lines) this.subQueue.push(l);
  }

  objective(text) {
    this.el.obj.hidden = false;
    this.el.objText.textContent = text;
    this.el.obj.classList.remove('done');
    this.el.obj.classList.remove('flash');
    void this.el.obj.offsetWidth;
    this.el.obj.classList.add('flash');
    this.toast('NEW OBJECTIVE', 'obj');
  }

  objectiveDone(text) {
    this.toast(`✔ ${text.toUpperCase()}`, 'obj');
  }

  objectiveSub(sub) {
    if (this.el.objSub._v !== sub) { this.el.objSub.textContent = sub; this.el.objSub._v = sub; }
  }

  timer(text, urgent) {
    this.el.timer.hidden = false;
    this.el.timer.textContent = text;
    this.el.timer.classList.toggle('urgent', !!urgent);
  }

  bossBar(name, frac = 1) {
    if (!name) { this.el.boss.hidden = true; return; }
    this.el.boss.hidden = false;
    this.el.bossName.textContent = name;
    this.el.bossFill.style.width = `${clamp(frac, 0, 1) * 100}%`;
  }

  bigMessage(title, sub = '') {
    const b = this.el.big;
    b.querySelector('.big-title').textContent = title;
    b.querySelector('.big-sub').textContent = sub;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  deathCard(title, sub = '') {
    const d = this.el.death;
    if (!title) { d.hidden = true; return; }
    d.hidden = false;
    d.querySelector('.dc-title').textContent = title;
    d.querySelector('.dc-sub').textContent = sub ?? '';
    d.querySelector('.dc-timer').textContent = '';
  }

  deathTimer(n) {
    this.el.death.querySelector('.dc-timer').textContent = n > 0 ? `Respawning in ${n}` : '';
  }

  // ---------- per-frame ----------
  update(game, dt) {
    this.frame++;
    const p = game.player;
    const w = game.weapons;
    const s = w.stats;
    const cam = game.camera;
    const W = window.innerWidth, H = window.innerHeight;

    // FPS.
    if (Store.settings.showFps) {
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { this.el.fps.hidden = false; this.el.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS`; this.fpsAcc = 0; this.fpsN = 0; }
    } else this.el.fps.hidden = true;

    // Weapon panel.
    const wi = w.weapon;
    if (this.el.wname._v !== wi.stats.name) { this.el.wname.textContent = wi.stats.name.toUpperCase(); this.el.wname._v = wi.stats.name; }
    this.el.mag.textContent = wi.ammo;
    this.el.mag.classList.toggle('low', wi.ammo <= Math.ceil(s.mag * 0.25));
    this.el.res.textContent = `/ ${wi.reserve}`;
    this.el.fire.textContent = wi.mode.toUpperCase();
    const L = w.lethal, T = w.tactical;
    this.el.lethal.textContent = `[G] ${EQUIPMENT[L.id].short} ×${L.count}`;
    this.el.tactical.textContent = `[Q] ${EQUIPMENT[T.id].short} ×${T.count}`;
    // Laser module (SMGs and rifles): always shown so the option is easy to find.
    const lz = (this._laserEl ??= this.root.querySelector('#h-laser'));
    const capable = w.laserCapable?.();
    lz.hidden = !capable;
    if (capable) {
      const on = w.laserOn;
      const txt = `[L] LASER ${on ? 'ON' : 'OFF'}`;
      if (lz._t !== txt) { lz.textContent = txt; lz._t = txt; lz.classList.toggle('on', on); }
    }
    let rl = '';
    if (w.isReloading()) rl = 'RELOADING';
    else if (wi.ammo === 0 && wi.reserve === 0) rl = 'NO AMMO';
    else if (wi.ammo <= Math.ceil(s.mag * 0.25)) rl = '[R] RELOAD';
    this.el.reload.textContent = rl;

    // Vitals.
    const hp = p.health / p.maxHealth;
    this.el.hpFill.style.width = `${hp * 100}%`;
    this.el.hpFill.className = hp < 0.3 ? 'crit' : hp < 0.6 ? 'warn' : '';
    this.el.hpNum.textContent = Math.ceil(p.health);
    this.el.stance.className = `stance s-${p.stance}${p.sprinting ? ' sprint' : ''}`;
    this.el.stance.textContent = p.stance === 'stand' ? (p.sprinting ? 'SPRINT' : 'STAND') : p.stance.toUpperCase();
    // Damage vignette + heartbeat.
    const dmg = clamp(1 - hp, 0, 1);
    this.el.vig.style.opacity = p.alive ? Math.pow(dmg, 1.3) * 1.1 : 0.9;
    if (hp < 0.35 && p.alive) {
      this.beat = (this.beat ?? 0) - dt;
      if (this.beat <= 0) { this.beat = 0.9; Audio.heartbeat(); }
    }
    this.el.sup.style.opacity = clamp(p.suppressed ?? 0, 0, 1) * 0.6;
    // Flashbang: solid white-out, then a burned-in afterimage of the moment it went off.
    const fl = p.flashed > 0 ? clamp((p.flashed - 0.5) / 1.9, 0, 1) : 0;
    this.el.flash.style.opacity = fl * fl * (3 - 2 * fl);
    const after = (this._afterEl ??= this.root.querySelector('#h-after'));
    const ao = p.flashed > 0 ? clamp(p.flashed / 3.2, 0, 1) * 0.9 : 0;
    if (ao !== this._ao) { after.style.opacity = ao; this._ao = ao; }

    // Rappel rope: shows at a roof edge with a drop below.
    const gp = game.rappelPlan;
    const gEl = (this._grapEl ??= this.root.querySelector('#h-grap'));
    if (gp && !game.cinematic && p.alive) {
      const txt = `<b>T</b> ▼ RAPPEL DOWN ${Math.round(gp.height)}m`;
      if (gEl._t !== txt) { gEl.innerHTML = txt; gEl._t = txt; }
      gEl.hidden = false;
    } else gEl.hidden = true;

    // Stealth meter (campaign): fills as an unalerted enemy notices you.
    const det = game.mode.type === 'campaign' && p.alive && !game.cinematic ? (p.detection ?? 0) : 0;
    const dEl = (this._detEl ??= this.root.querySelector('#h-detect'));
    if (det > 0.04) {
      dEl.hidden = false;
      const spotted = det >= 1;
      dEl.classList.toggle('spotted', spotted);
      dEl.querySelector('.det-bar div').style.width = `${Math.round(det * 100)}%`;
      const lbl = spotted ? 'SPOTTED' : det > 0.6 ? 'ALMOST SPOTTED' : 'BEING NOTICED';
      if (dEl._l !== lbl) { dEl.querySelector('.det-label').textContent = lbl; dEl._l = lbl; }
    } else dEl.hidden = true;

    // Hurt direction arcs.
    if (this.frame % 2 === 0) {
      const html = p.hurtDirs.map((d) => {
        const rel = d.ang - (Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)));
        return `<div class="hd" style="transform:rotate(${-rel}rad);opacity:${clamp(d.t, 0, 1)}"></div>`;
      }).join('');
      this.el.hurt.innerHTML = html;
    }

    // Crosshair.
    const scope = w.scopeInfo();
    const showCross = Store.settings.crosshair && p.alive && !game.cinematic && !p.sprinting && w.ads < 0.5 && w.state !== 'reload';
    this.el.cross.style.opacity = showCross ? 1 - w.ads * 2 : 0;
    if (showCross) {
      const spreadPx = Math.tan((w.spreadDeg() * Math.PI) / 360) / Math.tan((cam.fov * Math.PI) / 360) * (H / 2);
      const g = Math.max(4, spreadPx);
      this.el.cross.style.setProperty('--gap', `${g}px`);
    }
    // Scope overlay.
    this.el.scope.hidden = !scope.active;
    if (scope.active) {
      if (this.reticleKind !== scope.kind) {
        this.reticleKind = scope.kind;
        this.el.scope.className = `scope k-${scope.kind}`;
        this.el.scopeSvg.innerHTML = RETICLES[scope.kind];
        this.el.scopeTag.textContent = scope.kind === 'thermal' ? 'THERMAL  ·  WHT-HOT' : scope.kind === 'sniper' ? '8×' : '';
      }
      this.el.breath.style.display = scope.kind === 'acog' ? 'none' : '';
      this.el.breath.firstElementChild.style.width = `${p.breath * 100}%`;
    }
    game.app.setThermal(scope.active && scope.kind === 'thermal');

    // Hitmarker decay handled by CSS.
    // Grenade warning.
    const gw = this.grenade;
    if (gw && !gw.dead && p.pos.distanceTo(gw.pos) < gw.def.radius + 2) {
      this.el.gren.hidden = false;
      const v = gw.pos.clone().project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H * 0.8; }
      this.el.gren.style.transform = `translate(${clamp(x, 40, W - 40)}px, ${clamp(y, 40, H - 40)}px)`;
    } else { this.el.gren.hidden = true; this.grenade = null; }

    // Cook timer.
    if (w.cooking && EQUIPMENT[w.cooking.id].cook) {
      this.el.cook.hidden = false;
      this.el.cook.textContent = `COOKING  ${(EQUIPMENT[w.cooking.id].fuse - w.cooking.t).toFixed(1)}s`;
    } else this.el.cook.hidden = true;

    // Compass.
    const heading = ((-p.yaw * 180) / Math.PI) % 360;
    const hd = (heading + 360) % 360;
    this.el.compass.style.transform = `translateX(${-hd * 4}px)`;

    // Markers & nametags.
    this._markers(game, cam, W, H, hd);
    // Mode info.
    if (this.frame % 6 === 0) this._modeInfo(game);
    // Minimap.
    if (this.frame % 2 === 0) this._minimap(game);
    // Subtitles.
    this._subtitles(dt);
    // Scoreboard.
    const tab = game.input.isDown('Tab') || (!p.alive && game.mode.records);
    this.el.score.hidden = !tab || !game.mode.records;
    if (!this.el.score.hidden && this.frame % 10 === 0) this._scoreboard(game);
  }

  _subtitles(dt) {
    if (!this.curSub && this.subQueue.length) {
      const l = this.subQueue.shift();
      this.curSub = l;
      this.subT = 1.6 + l.text.length * 0.055;
      const who = SPEAKER[l.who] ?? l.who;
      const fr = !['VASKO', 'KESSLER', 'HART'].includes(l.who);
      this.el.subs.innerHTML = Store.settings.subtitles ? `<div class="sub"><b class="${fr ? 'fr' : 'en'}">${escapeHtml(who)}:</b> ${escapeHtml(l.text)}</div>` : '';
      Audio.ui('radio');
    }
    if (this.curSub) {
      this.subT -= dt;
      if (this.subT <= 0) {
        this.curSub = null;
        this.el.subs.innerHTML = '';
      }
    }
  }

  _markers(game, cam, W, H, heading) {
    const list = [...(game.mode.markers ?? [])];
    for (const a of game.actors) {
      if (!a.alive || !a.marked || (a.markedUntil && game.time > a.markedUntil) || list.some((m) => m.actor === a)) continue;
      list.push({ pos: a.pos.clone().setY(a.pos.y + 2.05), label: '', kind: 'mark', actor: a });
    }
    for (const pg of game.comms?.pings ?? []) list.push({ pos: pg.pos, label: pg.label, kind: 'ping' });
    // Friendly name tags.
    const tags = [];
    for (const a of game.actors) {
      if (!a.alive || a.team !== game.player.team) continue;
      const d = a.pos.distanceTo(game.player.pos);
      if (d > 40) continue;
      tags.push({ pos: a.pos.clone().setY(a.pos.y + 2.05), label: a.name, kind: 'tag', d });
    }
    const all = list.concat(tags);
    while (this.markerEls.length < all.length) {
      const e = document.createElement('div');
      e.className = 'mk';
      this.el.markers.appendChild(e);
      this.markerEls.push(e);
    }
    const v = new THREE.Vector3();
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    let compassSet = false;
    for (let i = 0; i < this.markerEls.length; i++) {
      const e = this.markerEls[i];
      const m = all[i];
      if (!m || game.cinematic) { e.style.display = 'none'; continue; }
      v.copy(m.pos).project(cam);
      const behind = v.z > 1;
      const dist = Math.round(camPos.distanceTo(m.pos));
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (m.kind === 'tag') {
        if (behind || x < 0 || x > W || y < 0 || y > H) { e.style.display = 'none'; continue; }
        e.style.display = '';
        e.className = 'mk tag';
        const html = escapeHtml(m.label);
        if (e._h !== html) { e.innerHTML = html; e._h = html; }
        e.style.transform = `translate(${x}px, ${y}px)`;
        e.style.opacity = clamp(1 - m.d / 40, 0.3, 1);
        continue;
      }
      if (behind) { x = W - x; y = H - 60; }
      const edge = x < 30 || x > W - 30 || y < 60 || y > H - 60 || behind;
      x = clamp(x, 30, W - 30); y = clamp(y, 70, H - 70);
      e.style.display = '';
      let cls = `mk m-${m.kind}`;
      if (m.kind === 'flag') cls += m.contested ? ' contested' : m.owner === 'a' ? ' own' : m.owner === 'b' ? ' foe' : ' neutral';
      if (edge) cls += ' edge';
      e.className = cls;
      const label = m.kind === 'flag' ? m.label : m.label;
      const html = `<div class="mk-icon">${m.kind === 'flag' ? escapeHtml(m.label) : m.kind === 'enemy' || m.kind === 'mark' ? '▼' : m.kind === 'ping' ? '◎' : '◆'}</div>${label && m.kind !== 'flag' ? `<div class="mk-label">${escapeHtml(label)}</div>` : ''}<div class="mk-dist">${dist}m</div>`;
      if (e._h !== html) { e.innerHTML = html; e._h = html; }
      e.style.transform = `translate(${x}px, ${y}px)`;
      e.style.opacity = '';
      // First objective marker on the compass.
      if (!compassSet && m.kind !== 'enemy' && m.kind !== 'mark' && m.kind !== 'ping') {
        compassSet = true;
        const ang = Math.atan2(m.pos.x - game.player.pos.x, -(m.pos.z - game.player.pos.z)) * 180 / Math.PI;
        const a = (ang + 360) % 360;
        let rel = a - heading;
        if (rel > 180) rel -= 360;
        if (rel < -180) rel += 360;
        this.compassObj.style.display = '';
        this.compassObj.style.left = `${(heading + rel) * 4}px`;
      }
    }
    if (!compassSet) this.compassObj.style.display = 'none';
  }

  _modeInfo(game) {
    const info = game.mode.hudInfo?.();
    if (!info) { this.el.mode.innerHTML = ''; return; }
    let html = '';
    if (info.kind === 'teams' || info.kind === 'dom') {
      html = `<div class="score-row"><span class="team fr">${info.names.a}</span><b class="fr">${info.a}</b><span class="tm">${info.time}</span><b class="en">${info.b}</b><span class="team en">${info.names.b}</span></div>`;
      if (info.kind === 'dom') {
        html += `<div class="flags">${info.flags.map((f) => `<span class="flag ${f.contested ? 'contested' : f.owner === 'a' ? 'own' : f.owner === 'b' ? 'foe' : 'neutral'}">${f.label}<i style="width:${Math.abs(f.progress) * 100}%" class="${f.progress >= 0 ? 'pa' : 'pb'}"></i></span>`).join('')}</div>`;
      } else html += `<div class="limit">FIRST TO ${info.limit}</div>`;
    } else if (info.kind === 'ffa') {
      html = `<div class="score-row"><span class="team fr">YOU</span><b class="fr">${info.you}</b><span class="tm">${info.time}</span><b class="en">${info.leader}</b><span class="team en">${escapeHtml(info.leaderName)}</span></div><div class="limit">PLACE #${info.place}  ·  FIRST TO ${info.limit}</div>`;
    } else if (info.kind === 'survival') {
      html = `<div class="score-row"><span class="team fr">WAVE</span><b class="fr">${info.wave}</b><span class="tm">${info.score}</span><b class="en">${info.left}</b><span class="team en">HOSTILES</span></div>${info.intermission ? `<div class="limit">NEXT WAVE IN ${info.intermission}</div>` : ''}`;
    }
    if (this.el.mode._h !== html) { this.el.mode.innerHTML = html; this.el.mode._h = html; }
  }

  _minimap(game) {
    const ctx = this.mapCtx;
    const S = 200, scale = 2.2; // px per metre
    const p = game.player;
    const w = game.world;
    if (!this.mapImage) {
      // Pre-render the nav grid as a top-down map.
      const n = w.nav;
      const c = document.createElement('canvas');
      c.width = n.w; c.height = n.h;
      const g = c.getContext('2d');
      const img = g.createImageData(n.w, n.h);
      for (let i = 0; i < n.w * n.h; i++) {
        const b = n.blocked[i];
        const v = b ? 150 : 40;
        img.data[i * 4] = v * 0.85; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.85; img.data[i * 4 + 3] = b ? 230 : 140;
      }
      g.putImageData(img, 0, 0);
      this.mapImage = c;
    }
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,14,10,0.75)';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(p.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-p.pos.x, -p.pos.z);
    const n = w.nav;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapImage, n.minX, n.minZ, n.w * n.size, n.h * n.size);
    const now = game.time;
    const dot = (x, z, col, r = 2.2) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, z, r / scale * 1.4, 0, Math.PI * 2); ctx.fill(); };
    for (const a of game.actors) {
      if (!a.alive) continue;
      if (a.team === p.team) dot(a.pos.x, a.pos.z, '#4ec0ff');
      else if (now - a.lastShotTime < 1.6 || (a.targetVisible && a.target === p && now - a.lastShotTime < 4)) dot(a.pos.x, a.pos.z, '#ff4a3a');
    }
    for (const m of game.mode.markers ?? []) {
      if (m.kind === 'flag') {
        ctx.fillStyle = m.contested ? '#ffd040' : m.owner === 'a' ? '#4ec0ff' : m.owner === 'b' ? '#ff4a3a' : '#dddddd';
        ctx.save();
        ctx.translate(m.pos.x, m.pos.z);
        ctx.rotate(-p.yaw);
        ctx.font = `bold ${10 / scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, 0, 0);
        ctx.restore();
      } else if (m.kind !== 'tag') {
        ctx.fillStyle = m.kind === 'enemy' ? '#ff4a3a' : '#ffd040';
        ctx.save();
        ctx.translate(m.pos.x, m.pos.z);
        ctx.rotate(Math.PI / 4);
        const r = 4 / scale;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }
    }
    ctx.restore();
    // Player arrow (always up).
    ctx.fillStyle = '#c8ff8a';
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 - 7);
    ctx.lineTo(S / 2 - 5, S / 2 + 5);
    ctx.lineTo(S / 2, S / 2 + 2);
    ctx.lineTo(S / 2 + 5, S / 2 + 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,220,140,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  _scoreboard(game) {
    const rows = game.mode.scoreboard();
    const teams = game.mode.type === 'ffa' ? [null] : ['a', 'b'];
    let html = `<div class="sb-title">${game.mode.type === 'survival' ? 'SURVIVAL' : game.mapInfo.name.toUpperCase()}</div>`;
    for (const t of teams) {
      const list = t ? rows.filter((r) => r.team === t) : rows;
      if (t) html += `<div class="sb-team ${t === 'a' ? 'fr' : 'en'}">${t === 'a' ? 'TASK FORCE ORION' : 'MERIDIAN'}</div>`;
      html += '<table><tr><th>#</th><th>OPERATOR</th><th>SCORE</th><th>K</th><th>D</th><th>K/D</th></tr>';
      list.forEach((r, i) => {
        html += `<tr class="${r.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(r.name)}${r.weapon ? ` <small>${escapeHtml(WEAPONS[r.weapon]?.name ?? '')}</small>` : ''}</td><td>${r.score}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${(r.kills / Math.max(1, r.deaths)).toFixed(2)}</td></tr>`;
      });
      html += '</table>';
    }
    this.el.score.innerHTML = html;
  }
}

const RETICLES = {
  sniper: `
    <line x1="-100" y1="0" x2="-6" y2="0" stroke="#000" stroke-width="0.7"/><line x1="6" y1="0" x2="100" y2="0" stroke="#000" stroke-width="0.7"/>
    <line x1="0" y1="-100" x2="0" y2="-6" stroke="#000" stroke-width="0.7"/><line x1="0" y1="6" x2="0" y2="100" stroke="#000" stroke-width="0.7"/>
    <line x1="-100" y1="0" x2="-45" y2="0" stroke="#000" stroke-width="2.4"/><line x1="45" y1="0" x2="100" y2="0" stroke="#000" stroke-width="2.4"/>
    <line x1="0" y1="45" x2="0" y2="100" stroke="#000" stroke-width="2.4"/>
    ${[-36, -27, -18, -9, 9, 18, 27, 36].map((v) => `<circle cx="${v}" cy="0" r="0.9" fill="#000"/><circle cx="0" cy="${v}" r="0.9" fill="#000"/>`).join('')}
    <circle cx="0" cy="0" r="0.7" fill="#d02020"/>`,
  acog: `
    <circle cx="0" cy="0" r="62" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="1"/>
    <path d="M -6 6 L 0 -2 L 6 6" fill="none" stroke="#ff6a20" stroke-width="1.4"/>
    <line x1="0" y1="8" x2="0" y2="40" stroke="#111" stroke-width="0.8"/>
    ${[14, 22, 30].map((v) => `<line x1="-${v / 4}" y1="${v}" x2="${v / 4}" y2="${v}" stroke="#111" stroke-width="0.8"/>`).join('')}
    <line x1="-60" y1="0" x2="-16" y2="0" stroke="#111" stroke-width="0.8"/><line x1="16" y1="0" x2="60" y2="0" stroke="#111" stroke-width="0.8"/>`,
  thermal: `
    <line x1="-100" y1="0" x2="-8" y2="0" stroke="#fff" stroke-width="0.6"/><line x1="8" y1="0" x2="100" y2="0" stroke="#fff" stroke-width="0.6"/>
    <line x1="0" y1="-100" x2="0" y2="-8" stroke="#fff" stroke-width="0.6"/><line x1="0" y1="8" x2="0" y2="100" stroke="#fff" stroke-width="0.6"/>
    <rect x="-3" y="-3" width="6" height="6" fill="none" stroke="#fff" stroke-width="0.6"/>`,
};

export { SPEAKER, CHARACTERS };
