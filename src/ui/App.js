// Application shell: renderer, main loop, menu screens (main, campaign, briefing,
// multiplayer, armory/gunsmith, settings, statistics, pause, death, results) and
// the flow between menus and live games.
import * as THREE from '../lib/three.js';
import { Input } from '../core/Input.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { setAnisotropy } from '../world/Textures.js';
import { HUD } from './HUD.js';
import { MenuScene } from './MenuScene.js';
import { Game } from '../Game.js';
import { CampaignMode } from '../modes/CampaignMode.js';
import { createMatch, MODE_INFO } from '../modes/MatchModes.js';
import { MISSIONS, PROLOGUE, CHARACTERS } from '../campaign/Story.js';
import { MAP_INFO, MAP_IDS } from '../world/Maps.js';
import { DIFFICULTY } from '../ai/Soldier.js';
import { SPEAKER } from './HUD.js';
import {
  WEAPONS, PRIMARIES, SECONDARIES, CLASSES, ATTACHMENTS, SLOT_NAMES, EQUIPMENT, LETHALS, TACTICALS,
  allowedAttachments, resolveAttachments, computeStats, ratings,
} from '../weapons/WeaponData.js';
import { escapeHtml, formatTime, clamp } from '../core/Utils.js';
import { rankOf } from '../core/Ranks.js';

export { rankOf };

const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Look / aim'], ['Left click', 'Fire'], ['Right click / Left Alt', 'Aim down sights / scope'],
  ['R', 'Reload'], ['Shift', 'Sprint · hold breath (scoped)'], ['Space', 'Jump · vault / climb ledges · stand up'], ['T', 'Rappel down from a roof edge (campaign)'], ['L', 'Weapon laser (SMGs & rifles)'], ['C', 'Crouch · slide while sprinting'],
  ['Ctrl / Z', 'Prone'], ['E', 'Interact · pick up'], ['1 / 2 · wheel', 'Switch weapon'], ['G', 'Lethal (hold to cook)'],
  ['Q', 'Tactical'], ['V', 'Melee · silent takedown from behind'], ['B', 'Fire mode'], ['Y then 1-6', 'Squad radio: orders to your team'], ['H', 'Squad: "On me!"'], ['K (hold)', 'Talk to your squad (microphone)'], ['F', 'Flashlight'], ['N', 'Night vision'], ['Tab', 'Scoreboard'], ['Esc', 'Pause'],
];

const TIPS = [
  'Crouching behind waist-high cover hides you; standing up lets you shoot over it.',
  'Enemies hear unsuppressed gunfire from far away. Suppressors keep you off their radar.',
  'Hold G to cook a frag grenade — release it late so enemies cannot run.',
  'Sprint + C performs a combat slide into cover.',
  'Flashbangs blind anyone looking toward them — including you.',
  'Smoke blocks enemy line of sight completely. Use it to cross open ground.',
  'Hold Shift while scoped with a sniper rifle to steady your breath.',
  'Headshots deal heavy bonus damage, especially with marksman and sniper rifles.',
  'Prone is the most accurate stance, but you move at a crawl.',
  'Fallen enemies sometimes drop ammo or their weapon. Press E to swap.',
  'Enemies take cover and flank. Do not stay in one spot for too long.',
];

export class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ui = document.getElementById('ui');
    this.overlay = document.getElementById('overlay');
    this.testMode = new URLSearchParams(location.search).has('test');
    const q = Store.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.applyResolution();
    this.input = new Input(this.canvas);
    if (this.testMode) Object.defineProperty(this.input, 'locked', { get: () => true });
    this.input.onPointerLockChange = (locked) => this._lockChange(locked);
    this.input.onFallback = () => this._lockFallback();
    this.input.onEscape = () => {
      if (this.game && !this.game.paused && !this.game.over && !this.overlayOpen) { this.input.fallback = false; this.pause(); }
    };
    this.hud = new HUD(document.getElementById('hud'));
    this.game = null;
    this.menu = null;
    this.last = performance.now();
    this.screen = null;
    this.mpCfg = { mode: 'tdm', map: 'desert', botDifficulty: 'regular', bots: MODE_INFO.tdm.bots, scoreLimit: MODE_INFO.tdm.defLimit, timeLimit: 600 };
    this.gunsmithWeapon = Store.loadout.primary;
    window.addEventListener('resize', () => this.resize());
    this.ui.addEventListener('mouseover', (e) => { if (e.target.closest('button:not([disabled]), .card:not(.locked)')) Audio.ui('hover'); });
    this.ui.addEventListener('click', (e) => {
      const b = e.target.closest('button, .card');
      if (b && !b.disabled && !b.classList.contains('locked')) Audio.ui(b.dataset.sound ?? 'click');
    });
    window.addEventListener('keydown', (e) => this._menuKeys(e));
    window.__app = this;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  applyResolution() {
    const s = Store.settings;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * s.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  resize() {
    this.applyResolution();
    this.game?.resize();
    this.menu?.resize();
  }

  // ---------- main loop ----------
  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    try {
      if (this.game) {
        this.game.update(dt);
        if (!this.game.paused) Store.stats.playTime += dt;
      } else if (this.menu) {
        this.menu.update(dt);
        this.menu.render();
      }
    } catch (err) {
      console.error(err);
      this._fatal(err);
    }
    this.input.endFrame();
  }

  _fatal(err) {
    if (this._fatalShown) return;
    this._fatalShown = true;
    const d = document.createElement('div');
    d.className = 'fatal';
    d.textContent = `Something went wrong: ${err.message}. Press Esc and return to the menu.`;
    document.body.appendChild(d);
    setTimeout(() => { d.remove(); this._fatalShown = false; }, 6000);
  }

  // ---------- boot ----------
  boot() {
    const s = document.createElement('div');
    s.className = 'boot';
    s.innerHTML = `
      <div class="boot-inner">
        <div class="boot-studio">CLASSIFIED // EYES ONLY</div>
        <h1 class="logo"><span class="logo-op">TASK FORCE ORION</span><span class="logo-main">FIELD OF HONOR</span><span class="logo-sub">US ARMY SPECIAL FORCES</span></h1>
        <div class="boot-press">PRESS ANY KEY OR CLICK TO BEGIN</div>
        <div class="boot-note">Keyboard and mouse required · Best in Chrome, Edge or Firefox · Headphones recommended</div>
      </div>`;
    document.body.appendChild(s);
    const go = () => {
      window.removeEventListener('keydown', go);
      s.removeEventListener('click', go);
      Audio.init();
      s.classList.add('out');
      setTimeout(() => s.remove(), 900);
      this.ensureMenuScene();
      Audio.playMusic('menu');
      this.show('main');
    };
    window.addEventListener('keydown', go);
    s.addEventListener('click', go);
    if (this.testMode) go();
  }

  ensureMenuScene() {
    if (!this.menu) this.menu = new MenuScene(this.renderer, Store.settings.quality);
  }

  // ---------- screens ----------
  show(name, arg) {
    this.screen = name;
    this.ui.hidden = false;
    this.ui.className = `ui s-${name}`;
    this.menu?.showWeapon(null);
    const fn = this[`_screen_${name}`];
    this.ui.innerHTML = '';
    fn.call(this, arg);
    this.ui.scrollTop = 0;
  }

  hideUI() {
    this.ui.hidden = true;
    this.ui.innerHTML = '';
    this.screen = null;
  }

  _menuKeys(e) {
    if (!this.screen) return;
    if (e.code === 'Escape' || e.code === 'Backspace') {
      const back = this.ui.querySelector('[data-back]');
      if (back && document.activeElement?.tagName !== 'INPUT') { back.click(); e.preventDefault(); }
    }
  }

  _header(title, sub, back = 'main') {
    return `<header class="scr-head">
      ${back ? `<button class="btn-back" data-back="${back}" data-sound="back">◂ BACK</button>` : ''}
      <div><div class="scr-sub">${sub}</div><h2 class="scr-title">${title}</h2></div>
    </header>`;
  }

  _bindBack() {
    for (const b of this.ui.querySelectorAll('[data-back]')) b.addEventListener('click', () => this.show(b.dataset.back));
  }

  _screen_main() {
    const st = Store.stats;
    const r = rankOf(st.xp);
    const camp = Store.campaign;
    const nextIdx = Math.min(MISSIONS.length - 1, camp.unlocked - 1);
    const next = MISSIONS[nextIdx];
    this.ui.innerHTML = `
      <div class="main">
        <div class="main-left">
          <h1 class="logo small"><span class="logo-op">TASK FORCE ORION</span><span class="logo-main">FIELD OF HONOR</span><span class="logo-sub">US ARMY SPECIAL FORCES</span></h1>
          <nav class="main-nav">
            <button class="nav-btn" data-go="campaign"><span>CAMPAIGN</span><small>9 missions · the HALCYON affair</small></button>
            <button class="nav-btn" data-go="multiplayer"><span>MULTIPLAYER</span><small>TDM · FFA · Domination · vs bots</small></button>
            <button class="nav-btn" data-go="survival"><span>SURVIVAL</span><small>Endless escalating waves</small></button>
            <button class="nav-btn" data-go="armory"><span>ARMORY</span><small>Loadout & gunsmith</small></button>
            <button class="nav-btn" data-go="stats"><span>STATISTICS</span><small>Service record</small></button>
            <button class="nav-btn" data-go="settings"><span>SETTINGS</span><small>Controls · audio · graphics</small></button>
          </nav>
          <div class="rank-card">
            <div class="rank-badge">${r.index}</div>
            <div class="rank-info"><div class="rank-name">${r.name.toUpperCase()}</div>
              <div class="xp-bar"><div style="width:${r.progress * 100}%"></div></div>
              <div class="xp-text">${st.xp.toLocaleString()} XP${r.next ? ` · next rank at ${r.next.toLocaleString()}` : ' · max rank'}</div></div>
          </div>
        </div>
        <aside class="main-right">
          <div class="intel">
            <div class="intel-tag">${camp.unlocked > 1 ? 'CONTINUE CAMPAIGN' : 'NEW CAMPAIGN'}</div>
            <div class="intel-title">MISSION ${nextIdx + 1}: ${next.title.toUpperCase()}</div>
            <div class="intel-loc">${next.location}</div>
            <p>${next.summary}</p>
            <button class="btn primary" id="btn-continue">${camp.unlocked > 1 ? 'CONTINUE' : 'BEGIN'} ▸</button>
          </div>
          <div class="intel controls-mini">
            <div class="intel-tag">FIELD CONTROLS</div>
            <div class="ctl-grid">${CONTROLS.slice(0, 12).map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
          </div>
        </aside>
      </div>
      <footer class="main-foot">v0.1 · Browser build · A work of fiction: all characters, weapons, factions and places are fictional · Not affiliated with or endorsed by the U.S. Army</footer>`;
    for (const b of this.ui.querySelectorAll('[data-go]')) {
      b.addEventListener('click', () => {
        const g = b.dataset.go;
        if (g === 'survival') { this.mpCfg.mode = 'survival'; this.show('multiplayer'); } else {
          if (g === 'multiplayer' && this.mpCfg.mode === 'survival') this.mpCfg.mode = 'tdm';
          this.show(g);
        }
      });
    }
    this.ui.querySelector('#btn-continue').addEventListener('click', () => {
      if (!camp.seenIntro && nextIdx === 0) this.show('prologue', { index: 0, difficulty: Store.settings.difficulty });
      else this.show('briefing', { index: nextIdx, difficulty: Store.settings.difficulty });
    });
  }

  _screen_campaign(sel) {
    const camp = Store.campaign;
    let selected = sel ?? Math.min(MISSIONS.length - 1, camp.unlocked - 1);
    let diff = Store.settings.difficulty;
    const render = () => {
      const m = MISSIONS[selected];
      const done = camp.completed[m.id];
      this.ui.innerHTML = `
        ${this._header('CAMPAIGN', 'FIELD OF HONOR: US ARMY SPECIAL FORCES')}
        <div class="camp">
          <div class="mission-list">
            ${MISSIONS.map((mm, i) => {
              const locked = i + 1 > camp.unlocked;
              const c = camp.completed[mm.id];
              return `<div class="card mission ${i === selected ? 'sel' : ''} ${locked ? 'locked' : ''}" data-i="${i}">
                <div class="m-num">${String(i + 1).padStart(2, '0')}</div>
                <div class="m-body"><div class="m-title">${locked ? 'CLASSIFIED' : mm.title.toUpperCase()}</div><div class="m-loc">${locked ? '— — —' : mm.location}</div></div>
                <div class="m-medal">${c ? '★'.repeat(c) : locked ? '🔒' : ''}</div>
              </div>`;
            }).join('')}
          </div>
          <div class="mission-detail panel">
            <div class="md-tag">MISSION ${selected + 1} · ${MAP_INFO[m.map].name.toUpperCase()} · ${m.lighting.toUpperCase()}${m.weather !== 'none' ? ' · ' + m.weather.toUpperCase() : ''}</div>
            <h3 class="md-title">${m.title.toUpperCase()}</h3>
            <div class="md-loc">${m.location} — ${m.time}</div>
            <p class="md-sum">${m.summary}</p>
            <div class="md-objs"><div class="lbl">OBJECTIVES</div>${m.objectives.map((o) => `<div class="md-obj">◆ ${escapeHtml(o.text)}</div>`).join('')}</div>
            <div class="md-stats">${done ? `<span>Completed: ${['', 'Recruit', 'Regular', 'Hardened', 'Veteran'][done]}</span>` : '<span>Not completed</span>'}${camp.bestTimes[m.id] ? `<span>Best time ${formatTime(camp.bestTimes[m.id])}</span>` : ''}</div>
            <div class="lbl">DIFFICULTY</div>
            <div class="seg" id="diff">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="${k === diff ? 'on' : ''}" data-d="${k}">${d.label.toUpperCase()}</button>`).join('')}</div>
            <div class="diff-desc">${{ recruit: 'Enemies are slow to react and inaccurate.', regular: 'A fair fight. Use cover.', hardened: 'Enemies are sharp, aggressive and hit hard.', veteran: 'One mistake is your last.' }[diff]}</div>
            <div class="row-btns">
              ${selected === 0 ? '<button class="btn" id="btn-prologue">WATCH PROLOGUE</button>' : ''}
              <button class="btn primary" id="btn-brief">MISSION BRIEFING ▸</button>
            </div>
          </div>
        </div>`;
      this._bindBack();
      for (const c of this.ui.querySelectorAll('.mission')) {
        c.addEventListener('click', () => {
          const i = +c.dataset.i;
          if (i + 1 > camp.unlocked) return;
          selected = i;
          render();
        });
      }
      for (const b of this.ui.querySelectorAll('#diff button')) b.addEventListener('click', () => { diff = b.dataset.d; Store.settings.difficulty = diff; Store.save(); render(); });
      this.ui.querySelector('#btn-brief').addEventListener('click', () => {
        if (selected === 0 && !camp.seenIntro) this.show('prologue', { index: 0, difficulty: diff });
        else this.show('briefing', { index: selected, difficulty: diff });
      });
      this.ui.querySelector('#btn-prologue')?.addEventListener('click', () => this.show('prologue', { index: 0, difficulty: diff }));
    };
    render();
  }

  _screen_prologue(arg) {
    this.ui.innerHTML = `<div class="prologue"><div class="pro-lines" id="pro"></div><div class="pro-skip">SPACE / CLICK — CONTINUE</div></div>`;
    const box = this.ui.querySelector('#pro');
    Audio.playMusic('tension');
    let li = 0, ci = 0, line = null, wait = 0, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      window.removeEventListener('keydown', key);
      Store.campaign.seenIntro = true;
      Store.save();
      if (this.screen === 'prologue') this.show('briefing', arg);
    };
    const timer = setInterval(() => {
      if (this.screen !== 'prologue') { clearInterval(timer); window.removeEventListener('keydown', key); return; }
      if (wait > 0) { wait -= 28; return; }
      if (li >= PROLOGUE.length) { finish(); return; }
      if (!line) {
        line = document.createElement('p');
        if (li === PROLOGUE.length - 1) line.className = 'final';
        box.appendChild(line);
      }
      ci += 2;
      line.textContent = PROLOGUE[li].slice(0, ci);
      if (ci % 4 === 0) Audio.ui('type');
      if (ci >= PROLOGUE[li].length) {
        li++; ci = 0; line = null;
        wait = li >= PROLOGUE.length ? 2600 : 900;
      }
    }, 28);
    const key = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') finish(); };
    window.addEventListener('keydown', key);
    this.ui.querySelector('.prologue').addEventListener('click', finish);
  }

  _screen_briefing({ index, difficulty }) {
    const m = MISSIONS[index];
    const lo = m.loadout;
    this.ui.innerHTML = `
      ${this._header(`MISSION ${index + 1}: ${m.title.toUpperCase()}`, `${m.location} · ${m.time}`, 'campaign')}
      <div class="brief">
        <div class="panel brief-main">
          <div class="lbl">BRIEFING</div>
          <div class="brief-lines" id="blines"></div>
          <div class="lbl">OBJECTIVES</div>
          ${m.objectives.map((o, i) => `<div class="md-obj">${i + 1}. ${escapeHtml(o.text)}</div>`).join('')}
        </div>
        <div class="panel brief-side">
          <div class="lbl">AREA OF OPERATIONS</div>
          <div class="brief-map">${MAP_INFO[m.map].name.toUpperCase()}<small>${MAP_INFO[m.map].blurb}</small></div>
          <div class="lbl">CONDITIONS</div>
          <div class="brief-cond">${m.lighting.toUpperCase()}${m.weather !== 'none' ? ' · ' + m.weather.toUpperCase() : ''}${m.timer ? ` · ${formatTime(m.timer)} TIME LIMIT` : ''}${m.stealth ? ' · STEALTH ADVISED' : ''}</div>
          <div class="lbl">ISSUED KIT</div>
          <div class="brief-lo">
            <div><b>${WEAPONS[lo.primary].name}</b><small>${CLASSES[WEAPONS[lo.primary].class]}${lo.attachments?.[lo.primary] ? ' · ' + Object.values(resolveAttachments(lo.primary, lo.attachments[lo.primary])).map((a, i) => ATTACHMENTS[Object.keys(SLOT_NAMES)[i]][a]).filter((a) => a && a.desc).map((a) => a.name).join(', ') : ''}</small></div>
            <div><b>${WEAPONS[lo.secondary].name}</b><small>${CLASSES[WEAPONS[lo.secondary].class]}</small></div>
            <div><b>${EQUIPMENT[lo.lethal].name}</b> · <b>${EQUIPMENT[lo.tactical].name}</b></div>
            <div class="brief-armory">You pick your primary and sidearm from the armory ${m.insertion ? 'in the helicopter' : 'at the start'}. Better weapons unlock with rank (you: ${escapeHtml(rankOf(Store.stats.xp).name)}).</div>
          </div>
          <div class="lbl">SQUAD</div>
          <div class="brief-squad">${m.squad.map((s) => `<span>${escapeHtml(SPEAKER[s.name.toUpperCase()] ?? s.name)}</span>`).join('')}</div>
          <div class="lbl">DIFFICULTY</div>
          <div class="brief-cond">${DIFFICULTY[difficulty].label.toUpperCase()}</div>
          <button class="btn primary big" id="btn-deploy">DEPLOY ▸</button>
        </div>
      </div>`;
    this._bindBack();
    const box = this.ui.querySelector('#blines');
    let li = 0, ci = 0, cur = null;
    clearInterval(this._briefT);
    this._briefT = setInterval(() => {
      if (this.screen !== 'briefing' || li >= m.briefing.length) { clearInterval(this._briefT); return; }
      const l = m.briefing[li];
      if (!cur) {
        cur = document.createElement('div');
        cur.className = 'bl';
        cur.innerHTML = `<b>${escapeHtml(SPEAKER[l.who] ?? l.who)}</b><span></span>`;
        box.appendChild(cur);
        Audio.ui('radio');
      }
      ci += 2;
      cur.querySelector('span').textContent = l.text.slice(0, ci);
      if (ci >= l.text.length) { li++; ci = 0; cur = null; }
    }, 22);
    this.ui.querySelector('#btn-deploy').addEventListener('click', () => {
      clearInterval(this._briefT);
      this.launch(new CampaignMode(index, difficulty));
    });
  }

  _screen_multiplayer() {
    const c = this.mpCfg;
    const isSurv = c.mode === 'survival';
    const info = MODE_INFO[c.mode];
    this.ui.innerHTML = `
      ${this._header(isSurv ? 'SURVIVAL' : 'MULTIPLAYER', isSurv ? 'Special Operations' : 'Local match vs AI operators')}
      <div class="mp">
        <div class="mp-col">
          <div class="lbl">GAME MODE</div>
          <div class="mode-grid">${Object.entries(MODE_INFO).map(([k, m]) => `<div class="card mode ${k === c.mode ? 'sel' : ''}" data-mode="${k}"><div class="mode-short">${m.short}</div><div class="mode-name">${m.name}</div><div class="mode-desc">${m.desc}</div></div>`).join('')}</div>
          <div class="lbl">MAP</div>
          <div class="map-grid">${MAP_IDS.map((id) => `<div class="card map ${id === c.map ? 'sel' : ''} map-${id}" data-map="${id}"><div class="map-name">${MAP_INFO[id].name.toUpperCase()}</div><div class="map-meta">${MAP_INFO[id].location} · ${MAP_INFO[id].size}</div><div class="map-blurb">${MAP_INFO[id].blurb}</div></div>`).join('')}</div>
        </div>
        <div class="mp-col panel">
          <div class="lbl">MATCH SETTINGS</div>
          ${isSurv ? '<p class="muted">Enemy difficulty rises every few waves. Heavies arrive on every fifth wave, a warlord on every tenth.</p>' : `
          <div class="field"><label>Bot difficulty</label><div class="seg" id="bdiff">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="${k === c.botDifficulty ? 'on' : ''}" data-d="${k}">${d.label.toUpperCase()}</button>`).join('')}</div></div>
          <div class="field"><label>Bots <b id="bots-v">${c.bots}</b></label><input type="range" id="bots" min="${c.mode === 'ffa' ? 2 : 3}" max="${c.mode === 'ffa' ? 11 : 15}" step="${c.mode === 'ffa' ? 1 : 2}" value="${c.bots}"></div>
          <div class="field"><label>Score limit</label><div class="seg" id="limit">${info.limits.map((l) => `<button class="${l === c.scoreLimit ? 'on' : ''}" data-l="${l}">${l}</button>`).join('')}</div></div>
          <div class="field"><label>Time limit</label><div class="seg" id="time">${[300, 600, 900].map((t) => `<button class="${t === c.timeLimit ? 'on' : ''}" data-t="${t}">${t / 60} MIN</button>`).join('')}</div></div>`}
          <div class="field"><label>Your loadout</label>
            <div class="lo-summary">${WEAPONS[Store.loadout.primary].name} · ${WEAPONS[Store.loadout.secondary].name} · ${EQUIPMENT[Store.loadout.lethal].name} · ${EQUIPMENT[Store.loadout.tactical].name}</div>
            <button class="btn" id="btn-lo">EDIT LOADOUT</button></div>
          <button class="btn primary big" id="btn-start">${isSurv ? 'START SURVIVAL' : 'START MATCH'} ▸</button>
        </div>
      </div>`;
    this._bindBack();
    for (const e of this.ui.querySelectorAll('[data-mode]')) e.addEventListener('click', () => {
      c.mode = e.dataset.mode;
      const mi = MODE_INFO[c.mode];
      c.bots = mi.bots;
      c.scoreLimit = mi.defLimit;
      this.show('multiplayer');
    });
    for (const e of this.ui.querySelectorAll('[data-map]')) e.addEventListener('click', () => { c.map = e.dataset.map; this.show('multiplayer'); });
    for (const b of this.ui.querySelectorAll('#bdiff button')) b.addEventListener('click', () => { c.botDifficulty = b.dataset.d; this.show('multiplayer'); });
    for (const b of this.ui.querySelectorAll('#limit button')) b.addEventListener('click', () => { c.scoreLimit = +b.dataset.l; this.show('multiplayer'); });
    for (const b of this.ui.querySelectorAll('#time button')) b.addEventListener('click', () => { c.timeLimit = +b.dataset.t; this.show('multiplayer'); });
    const bots = this.ui.querySelector('#bots');
    bots?.addEventListener('input', () => { c.bots = +bots.value; this.ui.querySelector('#bots-v').textContent = c.bots; });
    this.ui.querySelector('#btn-lo').addEventListener('click', () => this.show('armory', { back: 'multiplayer' }));
    this.ui.querySelector('#btn-start').addEventListener('click', () => this.launch(createMatch({ ...c })));
  }

  _statBars(id, att) {
    const base = ratings(computeStats(id, resolveAttachments(id, {})));
    const cur = ratings(computeStats(id, resolveAttachments(id, att)));
    return Object.keys(cur).filter((k) => !k.startsWith('_')).map((k) => {
      const d = cur[k] - base[k];
      return `<div class="stat"><span>${k}</span><div class="sbar"><div style="width:${clamp(cur[k], 2, 100)}%"></div>${Math.abs(d) > 0.5 ? `<i class="${d > 0 ? 'up' : 'down'}" style="left:${clamp(Math.min(cur[k], base[k]), 0, 100)}%;width:${Math.abs(d)}%"></i>` : ''}</div></div>`;
    }).join('');
  }

  _screen_armory(arg = {}) {
    const lo = Store.loadout;
    const back = arg.back ?? 'main';
    let focus = arg.focus ?? lo.primary;
    const render = () => {
      const fw = WEAPONS[focus];
      const att = Store.getAttachments(focus);
      this.ui.innerHTML = `
        ${this._header('ARMORY', 'Loadout · multiplayer & survival', back)}
        <div class="armory">
          <div class="arm-col">
            <div class="lbl">PRIMARY</div>
            <div class="wgrid">${PRIMARIES.map((id) => `<div class="card weapon ${id === lo.primary ? 'equipped' : ''} ${id === focus ? 'sel' : ''}" data-w="${id}"><small>${CLASSES[WEAPONS[id].class]}</small><b>${WEAPONS[id].name}</b></div>`).join('')}</div>
            <div class="lbl">SECONDARY</div>
            <div class="wgrid">${SECONDARIES.map((id) => `<div class="card weapon ${id === lo.secondary ? 'equipped' : ''} ${id === focus ? 'sel' : ''}" data-w="${id}"><small>${CLASSES[WEAPONS[id].class]}</small><b>${WEAPONS[id].name}</b></div>`).join('')}</div>
            <div class="lbl">LETHAL</div>
            <div class="wgrid eq">${LETHALS.map((id) => `<div class="card equip ${id === lo.lethal ? 'equipped sel' : ''}" data-l="${id}" title="${EQUIPMENT[id].desc}"><b>${EQUIPMENT[id].name}</b><small>${EQUIPMENT[id].desc}</small></div>`).join('')}</div>
            <div class="lbl">TACTICAL</div>
            <div class="wgrid eq">${TACTICALS.map((id) => `<div class="card equip ${id === lo.tactical ? 'equipped sel' : ''}" data-t="${id}" title="${EQUIPMENT[id].desc}"><b>${EQUIPMENT[id].name}</b><small>${EQUIPMENT[id].desc}</small></div>`).join('')}</div>
          </div>
          <div class="arm-right"><div class="preview-space"></div>
          <div class="arm-detail panel">
            <div class="md-tag">${CLASSES[fw.class].toUpperCase()} · ${fw.mag} RDS · ${fw.rpm} RPM · ${fw.modes.join(' / ').toUpperCase()}</div>
            <h3 class="md-title">${fw.name.toUpperCase()}</h3>
            <p class="md-sum">${fw.desc}</p>
            <div class="stats">${this._statBars(focus, att)}</div>
            <div class="att-list">${Object.keys(SLOT_NAMES).map((s) => { const a = ATTACHMENTS[s][resolveAttachments(focus, att)[s]]; return `<span>${SLOT_NAMES[s]}: <b>${a.name}</b></span>`; }).join('')}</div>
            <div class="row-btns">
              <button class="btn ${focus === lo.primary || focus === lo.secondary ? 'disabled' : 'primary'}" id="btn-equip" ${focus === lo.primary || focus === lo.secondary ? 'disabled' : ''}>${focus === lo.primary || focus === lo.secondary ? 'EQUIPPED' : 'EQUIP'}</button>
              <button class="btn primary" id="btn-smith">GUNSMITH ▸</button>
            </div>
          </div></div>
        </div>`;
      this._bindBack();
      this.menu?.showWeapon(focus, att, this.ui.querySelector('.preview-space'));
      for (const c of this.ui.querySelectorAll('[data-w]')) c.addEventListener('click', () => { focus = c.dataset.w; render(); });
      for (const c of this.ui.querySelectorAll('[data-l]')) c.addEventListener('click', () => { lo.lethal = c.dataset.l; Store.save(); render(); });
      for (const c of this.ui.querySelectorAll('[data-t]')) c.addEventListener('click', () => { lo.tactical = c.dataset.t; Store.save(); render(); });
      this.ui.querySelector('#btn-equip').addEventListener('click', () => {
        if (WEAPONS[focus].slot === 'primary') lo.primary = focus; else lo.secondary = focus;
        Store.save();
        Audio.ui('confirm');
        render();
      });
      this.ui.querySelector('#btn-smith').addEventListener('click', () => this.show('gunsmith', { weapon: focus, back }));
    };
    render();
  }

  _screen_gunsmith(arg) {
    const id = arg.weapon;
    const w = WEAPONS[id];
    const render = () => {
      const att = Store.getAttachments(id);
      const res = resolveAttachments(id, att);
      const st = computeStats(id, res);
      this.ui.innerHTML = `
        ${this._header('GUNSMITH', `${w.name} · ${CLASSES[w.class]}`, 'armory')}
        <div class="smith">
          <div class="panel smith-slots">
            ${Object.keys(SLOT_NAMES).map((slot) => {
              const allowed = allowedAttachments(id, slot);
              return `<div class="slot"><div class="lbl">${SLOT_NAMES[slot].toUpperCase()}</div><div class="chips">${allowed.map((a) => `<button class="chip ${res[slot] === a ? 'on' : ''}" data-slot="${slot}" data-a="${a}" title="${escapeHtml(ATTACHMENTS[slot][a].desc)}">${ATTACHMENTS[slot][a].name}</button>`).join('')}</div>
              <div class="chip-desc">${escapeHtml(ATTACHMENTS[slot][res[slot]].desc || '—')}</div></div>`;
            }).join('')}
            ${['ar', 'smg', 'marksman', 'sniper', 'lmg'].includes(w.class) ? `<div class="slot"><div class="lbl">LASER MODULE</div><div class="chips">
              <button class="chip ${Store.data.laser?.[id] ? '' : 'on'}" data-laser="0">Off at start</button>
              <button class="chip ${Store.data.laser?.[id] ? 'on' : ''}" data-laser="1">On at start</button></div>
              <div class="chip-desc">Built into every SMG and rifle. Press L in a match to switch it on or off: a red beam from the muzzle and a dot where your shots land, with much tighter hip fire.</div></div>` : ''}
          </div>
          <div class="arm-right"><div class="preview-space"></div>
          <div class="panel smith-stats">
            <h3 class="md-title">${w.name.toUpperCase()}</h3>
            <div class="stats">${this._statBars(id, att)}</div>
            <div class="spec">
              <span>Damage <b>${st.damage[0]}${st.pellets ? '×' + st.pellets : ''} → ${st.damage[1]}</b></span>
              <span>Range <b>${Math.round(st.range[0])}–${Math.round(st.range[1])} m</b></span>
              <span>Magazine <b>${st.mag}</b></span>
              <span>Reload <b>${st.reload.toFixed(2)} s</b></span>
              <span>ADS <b>${Math.round(st.ads * 1000)} ms</b></span>
              <span>Zoom <b>${st.zoomSteps ? `${st.zoomSteps[0]}-${st.zoomSteps[st.zoomSteps.length - 1]}` : st.zoom.toFixed(1)}×</b></span>
              <span>Suppressed <b>${st.suppressed ? 'YES' : 'NO'}</b></span>
            </div>
            <button class="btn" id="btn-reset">RESET TO DEFAULT</button>
          </div></div>
        </div>`;
      this._bindBack();
      this.ui.querySelector('[data-back]').addEventListener('click', () => this.show('armory', { focus: id, back: arg.back }), { once: true });
      this.menu?.showWeapon(id, att, this.ui.querySelector('.preview-space'));
      for (const c of this.ui.querySelectorAll('.chip[data-laser]')) c.addEventListener('click', () => {
        (Store.data.laser ??= {})[id] = c.dataset.laser === '1';
        Store.save();
        render();
      });
      for (const c of this.ui.querySelectorAll('.chip[data-slot]')) c.addEventListener('click', () => {
        att[c.dataset.slot] = c.dataset.a;
        Store.save();
        render();
      });
      this.ui.querySelector('#btn-reset').addEventListener('click', () => { Store.data.attachments[id] = {}; Store.save(); render(); });
    };
    render();
  }

  _screen_settings(arg = {}) {
    const s = Store.settings;
    const back = arg.back ?? 'main';
    const slider = (key, label, min, max, step, fmt = (v) => v) => `<div class="field"><label>${label} <b data-v="${key}">${fmt(s[key])}</b></label><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"></div>`;
    const toggle = (key, label) => `<div class="field toggle"><label>${label}</label><button class="tog ${s[key] ? 'on' : ''}" data-tog="${key}">${s[key] ? 'ON' : 'OFF'}</button></div>`;
    this.ui.innerHTML = `
      ${back === 'pause' ? '' : this._header('SETTINGS', 'Controls · audio · graphics', back)}
      ${back === 'pause' ? '<header class="scr-head"><button class="btn-back" data-back-pause data-sound="back">◂ BACK</button><div><h2 class="scr-title">SETTINGS</h2></div></header>' : ''}
      <div class="settings">
        <div class="panel"><div class="lbl">CONTROLS</div>
          ${slider('sensitivity', 'Mouse sensitivity', 0.1, 3, 0.05, (v) => (+v).toFixed(2))}
          ${slider('adsSensitivity', 'Aim-down-sights sensitivity', 0.2, 1.5, 0.05, (v) => (+v).toFixed(2))}
          ${toggle('invertY', 'Invert Y axis')}
          <div class="ctl-grid full">${CONTROLS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
        </div>
        <div class="panel"><div class="lbl">AUDIO</div>
          ${slider('masterVolume', 'Master volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
          ${slider('sfxVolume', 'Effects volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
          ${slider('musicVolume', 'Music volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
          ${toggle('subtitles', 'Subtitles')}
          <div class="lbl">GAMEPLAY</div>
          ${toggle('crosshair', 'Show crosshair')}
          ${toggle('showFps', 'Show FPS counter')}
          ${toggle('fullscreen', 'Fullscreen on deploy (recommended: stops Ctrl+W closing the tab)')}
          <div class="lbl">NIGHT VISION</div>
          ${toggle('nvgAuto', 'Goggles down at the start of night missions')}
          ${toggle('squadVoice', 'Squad voices (spoken radio replies)')}
          <div class="field"><label>Phosphor</label><div class="seg" id="phosphor">${['green', 'white'].map((q) => `<button class="${q === s.nvgPhosphor ? 'on' : ''}" data-ph="${q}">${q === 'green' ? 'GREEN (P43)' : 'WHITE (P45)'}</button>`).join('')}</div>
          <small class="muted">Press N in game to flip the goggles down or up.</small></div>
        </div>
        <div class="panel"><div class="lbl">GRAPHICS</div>
          ${slider('fov', 'Field of view (horizontal)', 65, 110, 1, (v) => v + '°')}
          <div class="field"><label>Quality preset</label><div class="seg" id="quality">${['low', 'medium', 'high'].map((q) => `<button class="${q === s.quality ? 'on' : ''}" data-q="${q}">${q.toUpperCase()}</button>`).join('')}</div>
          <small class="muted">Quality changes shadows, particle counts and lights. Takes effect on the next deploy (shadow/AA changes after reload).</small></div>
          ${slider('renderScale', 'Render scale', 0.5, 1, 0.05, (v) => Math.round(v * 100) + '%')}
          <div class="lbl">DATA</div>
          <button class="btn danger" id="btn-reset-stats">RESET STATISTICS</button>
          <button class="btn danger" id="btn-reset-camp">RESET CAMPAIGN PROGRESS</button>
        </div>
      </div>`;
    this._bindBack();
    this.ui.querySelector('[data-back-pause]')?.addEventListener('click', () => this.show('pause'));
    for (const r of this.ui.querySelectorAll('input[data-k]')) {
      r.addEventListener('input', () => {
        const k = r.dataset.k;
        s[k] = +r.value;
        const lbl = this.ui.querySelector(`[data-v="${k}"]`);
        const fmt = { sensitivity: (v) => v.toFixed(2), adsSensitivity: (v) => v.toFixed(2), fov: (v) => v + '°' }[k] ?? ((v) => Math.round(v * 100) + '%');
        lbl.textContent = fmt(s[k]);
        if (k.includes('Volume')) Audio.applyVolumes();
        if (k === 'renderScale') this.applyResolution();
        if (k === 'fov') this.game?.resize();
        Store.saveSoon();
      });
    }
    for (const t of this.ui.querySelectorAll('[data-tog]')) t.addEventListener('click', () => {
      const k = t.dataset.tog;
      s[k] = !s[k];
      t.classList.toggle('on', s[k]);
      t.textContent = s[k] ? 'ON' : 'OFF';
      Store.save();
    });
    for (const b of this.ui.querySelectorAll('#phosphor button')) b.addEventListener('click', () => {
      s.nvgPhosphor = b.dataset.ph;
      Store.save();
      for (const x of this.ui.querySelectorAll('#phosphor button')) x.classList.toggle('on', x === b);
    });
    for (const b of this.ui.querySelectorAll('#quality button')) b.addEventListener('click', () => {
      s.quality = b.dataset.q;
      Store.save();
      for (const x of this.ui.querySelectorAll('#quality button')) x.classList.toggle('on', x === b);
    });
    this.ui.querySelector('#btn-reset-stats').addEventListener('click', (e) => {
      if (e.target.dataset.confirm) { Store.resetStats(); e.target.textContent = 'STATISTICS RESET'; return; }
      e.target.dataset.confirm = '1'; e.target.textContent = 'CLICK AGAIN TO CONFIRM';
    });
    this.ui.querySelector('#btn-reset-camp').addEventListener('click', (e) => {
      if (e.target.dataset.confirm) { Store.data.campaign = { unlocked: 1, completed: {}, bestTimes: {}, seenIntro: false }; Store.save(); e.target.textContent = 'CAMPAIGN RESET'; return; }
      e.target.dataset.confirm = '1'; e.target.textContent = 'CLICK AGAIN TO CONFIRM';
    });
  }

  _screen_stats() {
    const st = Store.stats;
    const r = rankOf(st.xp);
    const kd = (st.kills / Math.max(1, st.deaths)).toFixed(2);
    const acc = st.shotsFired ? ((st.shotsHit / st.shotsFired) * 100).toFixed(1) : '0.0';
    const hs = st.kills ? ((st.headshots / st.kills) * 100).toFixed(1) : '0.0';
    const top = Object.entries(st.weaponKills).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const tile = (k, v) => `<div class="tile"><div class="tile-v">${v}</div><div class="tile-k">${k}</div></div>`;
    this.ui.innerHTML = `
      ${this._header('STATISTICS', 'Service record — Sgt. E. Cole')}
      <div class="stats-page">
        <div class="panel rank-big"><div class="rank-badge big">${r.index}</div><div><div class="rank-name">${r.name.toUpperCase()}</div><div class="xp-bar"><div style="width:${r.progress * 100}%"></div></div><div class="xp-text">${st.xp.toLocaleString()} XP</div></div></div>
        <div class="tiles">
          ${tile('Kills', st.kills.toLocaleString())}${tile('Deaths', st.deaths.toLocaleString())}${tile('K/D ratio', kd)}${tile('Accuracy', acc + '%')}
          ${tile('Headshots', st.headshots)}${tile('Headshot %', hs + '%')}${tile('Longest kill', st.longestKill + ' m')}${tile('Grenade kills', st.grenadeKills)}
          ${tile('Melee kills', st.meleeKills)}${tile('Matches played', st.matchesPlayed)}${tile('Matches won', st.matchesWon)}${tile('Win rate', st.matchesPlayed ? Math.round((st.matchesWon / st.matchesPlayed) * 100) + '%' : '—')}
          ${tile('Missions completed', st.missionsCompleted)}${tile('Campaign progress', `${Object.keys(Store.campaign.completed).length}/${MISSIONS.length}`)}${tile('Best survival wave', st.bestWave)}${tile('Time played', formatTime(st.playTime).replace(/^(\d+):/, (m, a) => (a >= 60 ? Math.floor(a / 60) + 'h ' + (a % 60) + 'm ' : a + 'm ')).replace(/:\d+$/, ''))}
        </div>
        <div class="panel"><div class="lbl">TOP WEAPONS</div>${top.length ? top.map(([id, k]) => `<div class="wk"><span>${WEAPONS[id]?.name ?? EQUIPMENT[id]?.name ?? id}</span><b>${k}</b></div>`).join('') : '<p class="muted">No kills recorded yet.</p>'}</div>
      </div>`;
    this._bindBack();
  }

  _screen_pause() {
    const g = this.game;
    const isCamp = g?.mode.type === 'campaign';
    const obj = isCamp ? g.mode.objective?.text : null;
    this.ui.innerHTML = `
      <div class="pause">
        <div class="pause-col">
          <div class="scr-sub">${isCamp ? `MISSION ${g.mode.index + 1} · ${g.mode.mission.title.toUpperCase()}` : `${MODE_INFO[g.mode.type].name.toUpperCase()} · ${g.mapInfo.name.toUpperCase()}`}</div>
          <h2 class="scr-title">PAUSED</h2>
          ${obj ? `<div class="pause-obj"><div class="lbl">CURRENT OBJECTIVE</div>${escapeHtml(obj)}</div>` : ''}
          <nav class="main-nav">
            <button class="nav-btn" id="p-resume"><span>RESUME</span></button>
            ${isCamp && g.player.alive ? '<button class="nav-btn" id="p-check"><span>RESTART FROM CHECKPOINT</span></button>' : ''}
            <button class="nav-btn" id="p-restart"><span>${isCamp ? 'RESTART MISSION' : 'RESTART MATCH'}</span></button>
            <button class="nav-btn" id="p-nvg"><span>NIGHT VISION: ${g.nvg ? 'ON' : 'OFF'}</span><small>N in game</small></button>
            <button class="nav-btn" id="p-settings"><span>SETTINGS</span></button>
            <button class="nav-btn" id="p-quit"><span>QUIT TO MAIN MENU</span></button>
          </nav>
          <div class="pause-hint" id="p-hint"></div>
        </div>
        <div class="panel pause-ctl"><div class="lbl">CONTROLS</div><div class="ctl-grid full">${CONTROLS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div></div>
      </div>`;
    this.ui.querySelector('#p-resume').addEventListener('click', () => this.resume());
    this.ui.querySelector('#p-check')?.addEventListener('click', () => { g.mode.respawnAtCheckpoint(); this.resume(); });
    this.ui.querySelector('#p-restart').addEventListener('click', () => this.restart());
    this.ui.querySelector('#p-nvg').addEventListener('click', () => { g.setNvg(!g.nvg); g.nvgFx.amount = g.nvg ? 1 : 0; this.show('pause'); });
    this.ui.querySelector('#p-settings').addEventListener('click', () => this.show('settings', { back: 'pause' }));
    this.ui.querySelector('#p-quit').addEventListener('click', () => this.quitToMenu());
  }

  // ---------- game flow ----------
  launch(mode) {
    Audio.init();
    this.lastMode = mode;
    this.ui.innerHTML = `<div class="loading"><div class="ld-title">DEPLOYING</div><div class="ld-map">${MAP_INFO[mode.mapId].name.toUpperCase()}</div><div class="ld-bar"><div></div></div><div class="ld-tip">TIP: ${TIPS[Math.floor(Math.random() * TIPS.length)]}</div></div>`;
    this.ui.className = 'ui s-loading';
    this.screen = 'loading';
    if (Store.settings.fullscreen && !this.testMode && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => {
        try { navigator.keyboard?.lock?.()?.catch?.(() => {}); } catch { /* not supported */ }
      }).catch(() => {});
    }
    this.input.lock();
    // Let the loading screen paint before the heavy build.
    setTimeout(() => {
      try {
        this._disposeGame();
        if (this.menu) { this.menu.dispose(); this.menu = null; }
        this.hud.reset();
        const game = new Game(this, {});
        this.game = game;
        game.build(mode);
        document.getElementById('hud').hidden = false;
        this.input.enabled = true;
        this.hideUI();
        if (!this.input.locked) this._showClickToPlay();
        else if (this.input.fallback) this._fallbackHint();
        window.__game = game;
      } catch (err) {
        console.error(err);
        this._fatal(err);
        this.quitToMenu();
      }
    }, 60);
  }

  _showClickToPlay() {
    if (this.testMode) return;
    this.ui.hidden = false;
    this.ui.className = 'ui s-click';
    this.screen = 'click';
    this.ui.innerHTML = '<div class="click-play">CLICK TO TAKE CONTROL</div>';
    this.ui.querySelector('.click-play').addEventListener('click', () => this.input.lock());
  }

  _lockChange(locked) {
    const g = this.game;
    if (!g) return;
    if (locked) {
      if (this.screen === 'click' || this.screen === 'pause') this.hideUI();
      g.paused = false;
      this.input.enabled = true;
    } else if (!g.over && !this.overlayOpen && g.player.alive) {
      this.pause();
    }
  }

  /** Mouse capture was refused: keep playing with plain mouse-move look. */
  _lockFallback() {
    const g = this.game;
    if (!g) return; // launch() checks the flag once the game is built
    if (this.screen === 'click' || this.screen === 'pause') this.hideUI();
    g.paused = false;
    this.input.enabled = true;
    this._fallbackHint();
  }

  _fallbackHint() {
    this.hud.hint('Mouse capture is unavailable here, so the cursor stays visible. Move the mouse to look; Esc pauses.', 8);
  }

  pause() {
    const g = this.game;
    if (!g || g.paused) return;
    g.paused = true;
    this.input.enabled = false;
    this.input.reset();
    this.show('pause');
  }

  resume() {
    if (!this.game) return;
    this.input.lock();
    if (this.testMode) { this.game.paused = false; this.hideUI(); }
    const hint = this.ui.querySelector('#p-hint');
    if (hint) hint.textContent = 'If the game does not resume, click RESUME again (browsers need a moment after Esc).';
  }

  restart() {
    const m = this.lastMode;
    if (!m) return;
    this.overlayOpen = false;
    const fresh = m.type === 'campaign' ? new CampaignMode(m.index, m.difficulty) : createMatch({ ...m.cfg });
    this.launch(fresh);
  }

  _disposeGame() {
    if (!this.game) return;
    this.game.dispose();
    this.game = null;
    window.__game = null;
  }

  quitToMenu() {
    this.overlayOpen = false;
    this._disposeGame();
    this.input.enabled = false;
    this.input.unlock();
    document.getElementById('hud').hidden = true;
    this.hud.reset();
    this.setNightVision(false);
    this.setThermal(false);
    this.ensureMenuScene();
    this.resize();
    Audio.setAmbience([]);
    Audio.playMusic('menu');
    this.show('main');
  }

  setNightVision(on) {
    // Night vision is a render pass in Game (NightVision.js); kept for callers.
    this.nvgOn = on;
  }

  setThermal(on) {
    if (this.thermalOn === on) return;
    this.thermalOn = on;
    this._applyFilters();
  }

  _applyFilters() {
    let f = '';
    if (this.thermalOn) f = 'grayscale(1) contrast(1.6) brightness(0.75)';
    this.canvas.style.filter = f;
  }

  // ---------- overlays from modes ----------
  showDeath({ title, reason, quote, author, checkpoint }) {
    this.overlayOpen = true;
    this.input.enabled = false;
    this.input.unlock();
    this.ui.hidden = false;
    this.ui.className = 'ui s-death';
    this.screen = 'death';
    this.ui.innerHTML = `
      <div class="death">
        <h2 class="death-title">${title}</h2>
        <div class="death-reason">${escapeHtml(reason)}</div>
        <blockquote>${escapeHtml(quote)}<cite>— ${escapeHtml(author)}</cite></blockquote>
        <div class="row-btns center">
          ${checkpoint ? '<button class="btn primary" id="d-check">RETRY FROM CHECKPOINT</button>' : ''}
          <button class="btn" id="d-restart">RESTART MISSION</button>
          <button class="btn" id="d-quit">QUIT TO MENU</button>
        </div>
      </div>`;
    this.ui.querySelector('#d-check')?.addEventListener('click', () => {
      this.overlayOpen = false;
      this.hideUI();
      checkpoint();
      this.input.enabled = true;
      this.input.lock();
      if (!this.input.locked) this._showClickToPlay();
    });
    this.ui.querySelector('#d-restart').addEventListener('click', () => this.restart());
    this.ui.querySelector('#d-quit').addEventListener('click', () => this.quitToMenu());
  }

  missionComplete(r) {
    this.overlayOpen = true;
    this.input.enabled = false;
    this.input.unlock();
    const st = Store.stats;
    const m = r.mission;
    const next = MISSIONS[r.index + 1];
    this.ui.hidden = false;
    this.ui.className = 'ui s-results';
    this.screen = 'results';
    this.ui.innerHTML = `
      <div class="results">
        <div class="scr-sub">MISSION ${r.index + 1} · ${m.location}</div>
        <h2 class="res-title">${m.finale ? 'OPERATION COMPLETE' : 'MISSION COMPLETE'}</h2>
        <div class="res-mission">${m.title.toUpperCase()}${r.xp ? ` · +${r.xp.toLocaleString()} MISSION XP` : ''}</div>
        ${r.rankUp ? `<div class="res-rankup">PROMOTED TO ${escapeHtml(r.rankUp.toUpperCase())} · new weapons in the armory</div>` : ''}
        <div class="tiles">
          <div class="tile"><div class="tile-v">${formatTime(r.time)}</div><div class="tile-k">Time</div></div>
          <div class="tile"><div class="tile-v">${r.kills}</div><div class="tile-k">Kills</div></div>
          <div class="tile"><div class="tile-v">${r.deaths}</div><div class="tile-k">Deaths</div></div>
          <div class="tile"><div class="tile-v">${DIFFICULTY[r.difficulty].label}</div><div class="tile-k">Difficulty</div></div>
          <div class="tile"><div class="tile-v">${st.shotsFired ? Math.round((st.shotsHit / st.shotsFired) * 100) : 0}%</div><div class="tile-k">Career accuracy</div></div>
        </div>
        <div class="panel debrief"><div class="lbl">DEBRIEF</div>${(m.outro ?? []).map((l) => `<div class="bl"><b>${escapeHtml(SPEAKER[l.who] ?? l.who)}</b><span>${escapeHtml(l.text)}</span></div>`).join('')}</div>
        ${m.finale ? `<div class="credits"><div class="lbl">FIELD OF HONOR: US ARMY SPECIAL FORCES</div><p>Thank you for playing. Task Force ORION will return.</p><p class="muted">${Object.values(CHARACTERS).map((c) => `${escapeHtml(c.name)} — ${escapeHtml(c.role)}`).join('<br>')}</p></div>` : ''}
        <div class="row-btns center">
          ${next ? '<button class="btn primary" id="r-next">NEXT MISSION ▸</button>' : ''}
          <button class="btn" id="r-replay">REPLAY</button>
          <button class="btn" id="r-menu">MAIN MENU</button>
        </div>
      </div>`;
    this.ui.querySelector('#r-next')?.addEventListener('click', () => {
      this.overlayOpen = false;
      this._disposeGame();
      document.getElementById('hud').hidden = true;
      this.ensureMenuScene();
      this.show('briefing', { index: r.index + 1, difficulty: r.difficulty });
    });
    this.ui.querySelector('#r-replay').addEventListener('click', () => this.restart());
    this.ui.querySelector('#r-menu').addEventListener('click', () => this.quitToMenu());
  }

  matchComplete(r) {
    this.overlayOpen = true;
    this.input.enabled = false;
    this.input.unlock();
    this.ui.hidden = false;
    this.ui.className = 'ui s-results';
    this.screen = 'results';
    const ffa = r.mode === 'ffa';
    const rows = (list) => `<table><tr><th>#</th><th>OPERATOR</th><th>SCORE</th><th>KILLS</th><th>DEATHS</th><th>K/D</th></tr>${list.map((x, i) => `<tr class="${x.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(x.name)}</td><td>${x.score}</td><td>${x.kills}</td><td>${x.deaths}</td><td>${(x.kills / Math.max(1, x.deaths)).toFixed(2)}</td></tr>`).join('')}</table>`;
    let board;
    if (r.mode === 'survival') {
      board = `<div class="tiles"><div class="tile"><div class="tile-v">${Math.max(0, r.extra.wave - 1)}</div><div class="tile-k">Waves survived</div></div><div class="tile"><div class="tile-v">${r.extra.kills}</div><div class="tile-k">Kills</div></div><div class="tile"><div class="tile-v">${r.extra.score}</div><div class="tile-k">Score</div></div><div class="tile"><div class="tile-v">${Store.stats.bestWave}</div><div class="tile-k">Best wave</div></div></div>`;
    } else if (ffa) board = rows(r.rows);
    else board = `<div class="sb-team fr">TASK FORCE ORION — ${r.teamScores.a}</div>${rows(r.rows.filter((x) => x.team === 'a'))}<div class="sb-team en">MERIDIAN — ${r.teamScores.b}</div>${rows(r.rows.filter((x) => x.team === 'b'))}`;
    this.ui.innerHTML = `
      <div class="results">
        <div class="scr-sub">${MODE_INFO[r.mode].name.toUpperCase()} · ${MAP_INFO[r.map].name.toUpperCase()}</div>
        <h2 class="res-title ${r.won ? '' : 'lost'}">${escapeHtml(r.title)}</h2>
        <div class="res-mission">+${r.won ? 1000 : 400} MATCH XP · ${r.player.kills} KILLS · ${r.player.deaths} DEATHS</div>
        <div class="panel scoreboard-final">${board}</div>
        <div class="row-btns center">
          <button class="btn primary" id="r-again">PLAY AGAIN</button>
          <button class="btn" id="r-menu">MAIN MENU</button>
        </div>
      </div>`;
    this.ui.querySelector('#r-again').addEventListener('click', () => this.restart());
    this.ui.querySelector('#r-menu').addEventListener('click', () => this.quitToMenu());
  }
}
