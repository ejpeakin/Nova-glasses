// Armory: the weapon rack you draw your primary and sidearm from at the start of a
// campaign mission (in the helicopter cabin on a helicopter insertion, otherwise
// while gearing up at the start point). Better weapons need a higher rank; the
// mission's issued kit is always on the rack.
//
// Controls: A / D (or ← →, mouse wheel) primary · W / S (or ↑ ↓) sidearm ·
// E, Enter, Space or left click to lock and load. Cards can also be clicked
// when the pointer is free.
import { WEAPONS, PRIMARIES, SECONDARIES, CLASSES, computeStats, resolveAttachments, ratings } from '../weapons/WeaponData.js';
import { Store } from '../core/Storage.js';
import { Audio } from '../core/Audio.js';
import { rankOf, rankInfo, WEAPON_RANK } from '../core/Ranks.js';
import { escapeHtml } from '../core/Utils.js';

const STAT_KEYS = ['Damage', 'Fire Rate', 'Range', 'Accuracy', 'Mobility'];

export class Armory {
  /** where: 'heli' | 'ground'. onDone(loadout) runs once the player locks in. */
  constructor(game, mission, where, onDone) {
    this.game = game;
    this.mission = mission;
    this.onDone = onDone;
    this.done = false;
    const lo = mission.loadout;
    this.issued = { primary: lo.primary, secondary: lo.secondary };
    this.rank = rankOf(Store.stats.xp);
    // The sidearm rack also holds the mission's issued secondary when it is a
    // compact primary (an SMG carried as a backup).
    this.rows = {
      primary: PRIMARIES.slice(),
      secondary: [...new Set([...SECONDARIES, lo.secondary])],
    };
    const last = Store.campaign.kit?.[mission.id] ?? {};
    this.sel = {
      primary: this.available(last.primary, 'primary') ? last.primary : lo.primary,
      secondary: this.available(last.secondary, 'secondary') ? last.secondary : lo.secondary,
    };
    this._build(where);
  }

  /** Rank needed for a weapon (issued kit needs none). */
  need(id, row) { return id === this.issued[row] ? 0 : (WEAPON_RANK[id] ?? 1); }

  available(id, row) {
    if (!id || !this.rows[row].includes(id)) return false;
    return this.need(id, row) <= this.rank.index;
  }

  attachmentsFor(id, row) {
    const lo = this.mission.loadout;
    return id === this.issued[row] ? lo.attachments?.[id] : undefined; // otherwise your Gunsmith setup
  }

  _build(where) {
    const root = this.game.hud.root;
    const el = document.createElement('div');
    el.className = 'rack';
    const where1 = where === 'heli' ? 'WEAPON RACK · IN THE CABIN' : 'GEAR UP';
    el.innerHTML = `
      <div class="ar-head"><div><div class="ar-title">ARMORY</div><div class="ar-sub">${where1} · ${escapeHtml(this.mission.title.toUpperCase())}</div></div>
        <div class="ar-rank"><span class="ar-badge">${this.rank.index}</span><div><b>${escapeHtml(this.rank.name.toUpperCase())}</b><small>${Store.stats.xp.toLocaleString()} XP${this.rank.next ? ` · next rank at ${this.rank.next.toLocaleString()}` : ''}</small></div></div></div>
      ${this.mission.loadoutNote ? `<div class="ar-note">${escapeHtml(this.mission.loadoutNote)}</div>` : ''}
      <div class="ar-row" data-row="primary"><div class="ar-lbl">PRIMARY <kbd>A</kbd><kbd>D</kbd></div><div class="ar-cards"></div></div>
      <div class="ar-row" data-row="secondary"><div class="ar-lbl">SIDEARM <kbd>W</kbd><kbd>S</kbd></div><div class="ar-cards"></div></div>
      <div class="ar-detail"></div>
      <button class="ar-go" type="button"><kbd>E</kbd> LOCK AND LOAD</button>`;
    for (const row of ['primary', 'secondary']) {
      const holder = el.querySelector(`.ar-row[data-row="${row}"] .ar-cards`);
      for (const id of this.rows[row]) {
        const w = WEAPONS[id];
        const need = this.need(id, row);
        const locked = need > this.rank.index;
        const c = document.createElement('button');
        c.type = 'button';
        c.className = `ar-card${locked ? ' locked' : ''}`;
        c.dataset.id = id;
        c.innerHTML = `<div class="ac-name">${escapeHtml(w.name)}</div><div class="ac-class">${escapeHtml(CLASSES[w.class])}</div>${
          id === this.issued[row] ? '<div class="ac-tag issued">MISSION ISSUE</div>' : locked ? `<div class="ac-tag lock">🔒 ${escapeHtml(rankInfo(need).name.toUpperCase())}</div>` : ''}`;
        c.addEventListener('click', () => {
          if (locked) { Audio.ui('back'); this.game.hud.toast(`${w.name.toUpperCase()}: REACH ${rankInfo(need).name.toUpperCase()} (${rankInfo(need).xp.toLocaleString()} XP)`, 'warn'); return; }
          this.sel[row] = id;
          Audio.ui('click');
          this._refresh();
        });
        holder.appendChild(c);
      }
    }
    el.querySelector('.ar-go').addEventListener('click', () => this.confirm());
    root.appendChild(el);
    this.el = el;
    this._refresh();
  }

  _refresh() {
    for (const row of ['primary', 'secondary']) {
      for (const c of this.el.querySelectorAll(`.ar-row[data-row="${row}"] .ar-card`)) {
        const on = c.dataset.id === this.sel[row];
        c.classList.toggle('sel', on);
        if (on) { const h = c.parentElement; h.scrollLeft = c.offsetLeft - (h.clientWidth - c.offsetWidth) / 2; }
      }
    }
    const bits = ['primary', 'secondary'].map((row) => {
      const id = this.sel[row];
      const w = WEAPONS[id];
      const st = computeStats(id, resolveAttachments(id, this.attachmentsFor(id, row) ?? Store.getAttachments(id)));
      const r = ratings(st);
      const bars = STAT_KEYS.map((k) => `<div class="ad-stat"><span>${k}</span><i><b style="width:${Math.round(Math.max(4, Math.min(100, r[k])))}%"></b></i></div>`).join('');
      return `<div class="ad-w"><div class="ad-name">${escapeHtml(w.name)} <small>${st.mag} rds · ${st.suppressed ? 'suppressed · ' : ''}${escapeHtml(st.sight)}</small></div><div class="ad-desc">${escapeHtml(w.desc)}</div>${bars}</div>`;
    });
    this.el.querySelector('.ar-detail').innerHTML = bits.join('');
  }

  _step(row, dir) {
    const list = this.rows[row];
    let i = list.indexOf(this.sel[row]);
    for (let k = 0; k < list.length; k++) {
      i = (i + dir + list.length) % list.length;
      if (this.available(list[i], row)) break;
    }
    if (list[i] !== this.sel[row]) { this.sel[row] = list[i]; Audio.ui('click'); this._refresh(); }
  }

  update(dt, input) {
    if (this.done) return;
    if (input.anyPressed('KeyA', 'ArrowLeft') || input.wheel < 0) this._step('primary', -1);
    if (input.anyPressed('KeyD', 'ArrowRight') || input.wheel > 0) this._step('primary', 1);
    if (input.anyPressed('KeyW', 'ArrowUp')) this._step('secondary', -1);
    if (input.anyPressed('KeyS', 'ArrowDown')) this._step('secondary', 1);
    input.wheel = 0;
    if (input.anyPressed('KeyE', 'Enter', 'Space', 'NumpadEnter') || input.mousePressed[0]) {
      for (const k of ['KeyE', 'Enter', 'Space', 'NumpadEnter']) input.edges.delete(k);
      input.mousePressed[0] = false;
      this.confirm();
    }
  }

  /** Lock in the current selection and arm the player. */
  confirm() {
    if (this.done) return;
    this.done = true;
    const lo = this.mission.loadout;
    const p = this.sel.primary, s = this.sel.secondary;
    const attachments = {};
    for (const [id, row] of [[p, 'primary'], [s, 'secondary']]) { const a = this.attachmentsFor(id, row); if (a) attachments[id] = a; }
    const loadout = { primary: p, secondary: s, lethal: lo.lethal, tactical: lo.tactical, attachments };
    const camp = Store.campaign;
    camp.kit = camp.kit ?? {};
    camp.kit[this.mission.id] = { primary: p, secondary: s };
    Store.save();
    this.game.weapons.setLoadout(loadout);
    Audio.ui('confirm');
    Audio.mech('raise');
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 350);
    this.onDone?.(loadout);
  }

  dispose() { this.el?.remove(); }
}
