// Squad comms: give orders to your team and hear them answer over the radio.
//   Y      open the radio menu, then 1-6 to pick an order
//   H      quick "On me!"
//   K      hold and speak an order into the microphone ("On me!", "Hold position",
//          "Move up", "Cover me", "Enemy spotted", "Hold fire", "Weapons free")
// Orders go to friendly squadmates in the campaign and to allied bots in multiplayer.
import * as THREE from '../lib/three.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { clamp, pick } from '../core/Utils.js';

export const ORDERS = [
  { id: 'regroup', label: 'On me!', hint: 'squad regroups on you', say: ['On me!', 'Form up on me!', 'Regroup on me!'], reply: ['On you!', 'Moving to you!', 'Coming to you, boss!', 'Copy, on you!'] },
  { id: 'hold', label: 'Hold position', hint: 'stay put and cover the area', say: ['Hold this position!', 'Hold here!'], reply: ['Holding!', 'Roger, holding here.', 'Copy, we hold.'] },
  { id: 'move', label: 'Move up', hint: 'go to where you are aiming', say: ['Move up! Over there!', 'Push up to that spot!', 'Move, move!'], reply: ['Moving up!', 'Moving!', 'On the move!'] },
  { id: 'cover', label: 'Cover me', hint: 'suppress where you are aiming', say: ['Cover me!', 'Suppressing fire, there!', 'Lay it down, there!'], reply: ['Covering!', 'Suppressing!', 'Got you covered!'] },
  { id: 'spot', label: 'Enemy spotted', hint: 'mark the target you are aiming at', say: ['Enemy spotted!', 'Contact, there!', 'Tango, there!'], reply: ['Eyes on!', 'I see him!', 'Copy, tracking!'] },
  { id: 'fire', label: 'Hold fire / Weapons free', hint: 'fire only when you fire', say: [], reply: [] },
];

// Spoken phrases → orders. Checked in this order (so "hold fire" is not "hold").
const PHRASES = [
  ['tight', /\b(hold (your )?fire|weapons (tight|hold)|cease ?fire|don'?t shoot|stop (shooting|firing)|stay quiet|hold your shots?)\b/],
  ['free', /\b(weapons free|open fire|fire at will|light (him|them|'?em) up|take (him|them|'?em) (out|down)|engage|shoot( (him|them|'?em))?|fire)\b/],
  ['cover', /\b(cover( me)?|suppress\w*|covering fire|keep (their|his) heads? down)\b/],
  ['spot', /\b(enemy|enemies|contact|spotted|tango|hostiles?|target|sniper|over there he|i see (him|them|one))\b/],
  ['regroup', /\b(on me|regroup|form up|rally|come (here|to me|on)|follow( me)?|fall back|back to me|with me|to me)\b/],
  ['hold', /\b(hold( (up|position|here|there|this))?|stay( here| there| put)?|wait( here)?|stop|halt|freeze|stand by)\b/],
  ['move', /\b(move( up| out)?|go( go)?|push( up| forward)?|advance|get (over )?there|go there|get moving|let'?s go)\b/],
];

/** Which order a spoken line asks for, or null. */
export function parseOrder(text) {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  for (const [id, re] of PHRASES) if (re.test(t)) return id;
  return null;
}

const STATUS = { regroup: 'REGROUPING ON YOU', hold: 'HOLDING POSITION', move: 'MOVING UP', cover: 'COVERING FIRE' };

export class Comms {
  constructor(game) {
    this.game = game;
    this.menuOpen = false;
    this.menuT = 0;
    this.holdFire = false;
    this.pending = [];
    this.pings = [];
    this.ptt = false;
    this.rec = null;
    this.listening = false;
    this.lastOrder = null;
  }

  /** Friendlies who take orders: campaign squadmates and allied bots. */
  squad() {
    const g = this.game, p = g.player;
    return g.actors.filter((a) => a.alive && a !== p && !a.isPlayer && a.team === p.team && (a.friendly || a.mpBot) && !a.scripted && !a.hidden);
  }

  update(dt, input) {
    const g = this.game;
    if (input.pressed('KeyY')) this.menuOpen ? this.closeMenu() : this.openMenu();
    if (this.menuOpen) {
      this.menuT -= dt;
      for (let i = 0; i < ORDERS.length; i++) {
        if (input.pressed(`Digit${i + 1}`)) { this.closeMenu(); this.issue(ORDERS[i].id); break; }
      }
      // Number keys pick orders while the menu is up, not weapons.
      for (let i = 1; i <= 6; i++) input.edges.delete(`Digit${i}`);
      if (this.menuT <= 0) this.closeMenu();
    }
    if (input.pressed('KeyH')) this.issue('regroup');
    const ptt = input.isDown('KeyK');
    if (ptt && !this.ptt) this.startListening();
    if (!ptt && this.ptt) this.stopListening();
    this.ptt = ptt;
    // Radio replies.
    const now = g.time;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const r = this.pending[i];
      if (now < r.t) continue;
      this.pending.splice(i, 1);
      if (r.who && r.who.alive === false) continue;
      Audio.radio(false);
      g.hud?.callout(r.name, r.text, true);
      this.speak(r.text, r.voice);
    }
    this.pings = this.pings.filter((p) => now < p.until);
    // First time there is a squad to talk to, say how.
    if (!this.hinted && now > 7 && now >= (this._hintCheckT ?? 0)) {
      this._hintCheckT = now + 1;
      if (this.squad().length) { this.hinted = true; g.hud?.hint('Y: squad radio   ·   H: "On me!"   ·   hold K: talk to your squad', 7); }
    }
    // Orders wear off (moving up ends on arrival; regroup once they are with you).
    if (this.lastOrder && now > this.lastOrder.until) this.lastOrder = null;
    g.hud?.squadStatus(this._status());
  }

  _status() {
    const parts = [];
    if (this.lastOrder && STATUS[this.lastOrder.id]) parts.push(STATUS[this.lastOrder.id]);
    if (this.holdFire) parts.push('WEAPONS TIGHT');
    return parts.length ? `SQUAD · ${parts.join(' · ')}` : '';
  }

  openMenu() {
    this.menuOpen = true;
    this.menuT = 6;
    Audio.ui('click');
    this.game.hud?.commsMenu(true, ORDERS, this.holdFire, this.squad().length);
  }

  closeMenu() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.game.hud?.commsMenu(false);
  }

  /** Where the player is aiming: the first wall/ground point, and any hostile under the crosshair. */
  aim() {
    const g = this.game, cam = g.camera;
    const o = cam.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = g.world.raycast(o.x, o.y, o.z, fwd.x, fwd.y, fwd.z, 250);
    const t = hit ? hit.t : 120;
    const point = o.clone().addScaledVector(fwd, t);
    let actor = null, bestA = THREE.MathUtils.degToRad(3.5);
    for (const a of g.actors) {
      if (!a.alive || !g.hostile(g.player, a)) continue;
      const c = a.chest;
      const to = c.clone().sub(o);
      const d = to.length();
      if (d > 220) continue;
      const ang = to.divideScalar(d).angleTo(fwd);
      if (ang < bestA && g.world.los(o, c)) { bestA = ang; actor = a; }
    }
    return { point, actor, hitWorld: !!hit };
  }

  /** Give an order. opts.voice: it was spoken, so do not voice the player's line. */
  issue(id, opts = {}) {
    const g = this.game, p = g.player, now = g.time;
    if (!p.alive) return;
    let def = ORDERS.find((o) => o.id === id);
    let tight = null;
    if (id === 'tight' || id === 'free') { tight = id === 'tight'; def = ORDERS.find((o) => o.id === 'fire'); }
    if (!def) return;
    const squad = this.squad();
    let line = pick(def.say);
    let reply = pick(def.reply);
    if (def.id === 'fire') {
      this.holdFire = tight ?? !this.holdFire;
      line = this.holdFire ? 'Hold fire! Weapons tight.' : 'Weapons free!';
      reply = this.holdFire ? pick(['Weapons tight.', 'Holding fire.', 'Copy, on your shot.']) : pick(['Weapons free!', 'Copy, weapons free!', 'Engaging!']);
    }
    Audio.radio(true);
    g.hud?.callout('YOU', opts.heard ? `"${opts.heard}"` : line, true);
    if (!opts.voice) this.speak(line, 'self');
    if (!squad.length) {
      if (g.mode.type === 'campaign') this._reply(null, 'WATCHTOWER', pick(["Negative, Orion. You're on your own out there.", "No friendlies on this net. You're solo."]), 'hq');
      else g.hud?.toast('NO TEAMMATES ON THE NET', 'warn');
      return;
    }
    const aim = this.aim();
    const yaw = p.yaw;
    switch (def.id) {
      case 'regroup':
        for (const s of squad) s.command('regroup', null, yaw);
        this.lastOrder = { id: 'regroup', until: now + 6 };
        break;
      case 'hold':
        for (const s of squad) s.command('hold', s.pos.clone(), yaw);
        this.lastOrder = { id: 'hold', until: Infinity };
        break;
      case 'move': {
        const w = g.world;
        const at = aim.point.clone();
        // Ground point under the aim (move orders onto roofs land at the nearest street).
        const idx = w.nearestWalkable(at.x, at.z, 8);
        if (idx < 0 || p.pos.distanceTo(at) > 160) { reply = pick(["Can't get there!", 'No route there, boss.']); break; }
        const goal = w.cellCenter(idx, new THREE.Vector3());
        goal.y = 0;
        const face = Math.atan2(-(goal.x - p.pos.x), -(goal.z - p.pos.z));
        for (const s of squad) s.command('move', goal, face);
        this.pings.push({ pos: goal.clone().setY(0.2), until: now + 4, label: 'MOVE', kind: 'move' });
        this.lastOrder = { id: 'move', until: Infinity };
        break;
      }
      case 'cover': {
        const at = aim.actor ? aim.actor.chest : aim.point;
        for (const s of squad) s.command('cover', at.clone(), yaw, aim.actor);
        this.lastOrder = { id: 'cover', until: now + 9 };
        break;
      }
      case 'spot': {
        if (aim.actor) {
          const e = aim.actor;
          e.marked = true;
          e.pingedT = now;
          if (g.mode.type !== 'campaign') e.markedUntil = now + 10;
          for (const s of squad) s.engage(e);
          reply = pick(def.reply);
        } else {
          this.pings.push({ pos: aim.point.clone(), until: now + 7, label: 'CONTACT', kind: 'contact' });
          for (const s of squad) s.watch(aim.point.clone());
          reply = pick(['Eyes on that spot.', 'Watching it.', 'Copy, checking it.']);
        }
        break;
      }
      default: break;
    }
    // Nearest squadmate answers.
    let who = null, bd = Infinity;
    for (const s of squad) { const d = s.pos.distanceTo(p.pos); if (d < bd) { bd = d; who = s; } }
    this._reply(who, who.name, reply, who);
  }

  _reply(who, name, text, voice) {
    this.pending.push({ t: this.game.time + 0.55 + Math.random() * 0.35, who, name, text, voice });
  }

  /** Voice a radio line with the browser's speech synthesis (Settings → Squad voices). */
  speak(text, who) {
    if (this.game.app?.testMode) return;
    // Recorded voices first (you, the squad, Watchtower), then the browser's voice.
    const sp = who === 'self' ? 'WRAITH' : who === 'hq' ? 'WATCHTOWER' : 'SQUAD';
    if (Audio.voice(sp, text, { radio: true })) return;
    if (!Store.settings.squadVoice) return;
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      if (who === 'self') ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = ss.getVoices().filter((v) => /^en/i.test(v.lang));
      const seed = who === 'self' ? 0 : who === 'hq' ? 7 : (who?.id ?? 3);
      if (voices.length) {
        const male = voices.filter((v) => /male|david|mark|guy|daniel|george|james|fred|alex|tom|aaron|arthur|ryan|eric/i.test(v.name) && !/female/i.test(v.name));
        const pool = male.length ? male : voices;
        u.voice = pool[seed % pool.length];
      }
      u.pitch = who === 'self' ? 0.85 : who === 'hq' ? 0.95 : 0.7 + (seed % 5) * 0.09;
      u.rate = who === 'hq' ? 1.0 : 1.12;
      const s = Store.settings;
      u.volume = clamp((s.masterVolume ?? 0.8) * (s.sfxVolume ?? 0.9) * 1.2, 0, 1);
      ss.speak(u);
    } catch { /* speech unavailable */ }
  }

  // ---------- push-to-talk voice orders ----------
  startListening() {
    const g = this.game;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      g.hud?.ptt('unsupported', 'Voice orders need Chrome or Edge. Press Y for the radio menu.');
      return;
    }
    if (this.micBlocked) { g.hud?.ptt('error', 'Microphone blocked. Allow it for this page, or press Y for the radio menu.'); return; }
    if (!this.rec) {
      const r = new SR();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 3;
      r.onresult = (e) => this._onSpeech(e);
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.micBlocked = true;
          g.hud?.ptt('error', 'Microphone blocked. Allow it for this page, or press Y for the radio menu.');
        } else if (e.error === 'network') g.hud?.ptt('error', 'Voice service unreachable. Press Y for the radio menu.');
        this.listening = false;
      };
      r.onend = () => {
        this.listening = false;
        // Chrome ends a session on silence; keep listening while the key is held.
        if (this.ptt && !this.micBlocked) { try { r.start(); this.listening = true; } catch { /* already running */ } }
      };
      this.rec = r;
    }
    this.done = new Set();
    this.heard = '';
    Audio.radio(true);
    try { this.rec.start(); this.listening = true; } catch { /* already started */ }
    g.hud?.ptt('listen', '');
  }

  stopListening() {
    try { this.rec?.stop(); } catch { /* not running */ }
    this.listening = false;
    const g = this.game;
    // Late results can still land for a moment after release.
    clearTimeout(this._pttT);
    this._pttT = setTimeout(() => {
      if (!this.ptt) {
        if (this.heard && !this.done.size) g.hud?.ptt('miss', this.heard);
        else g.hud?.ptt(null);
      }
    }, 900);
  }

  _onSpeech(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (this.done.has(i)) continue;
      let id = null, text = res[0].transcript.trim();
      for (let k = 0; k < res.length && !id; k++) { id = parseOrder(res[k].transcript); if (id) text = res[k].transcript.trim(); }
      this.heard = text;
      if (id) {
        this.done.add(i);
        this.game.hud?.ptt('heard', text);
        this.issue(id, { voice: true, heard: text });
      } else this.game.hud?.ptt(this.ptt ? 'listen' : 'miss', text);
    }
  }

  dispose() {
    try { this.rec?.abort(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    clearTimeout(this._pttT);
  }
}
