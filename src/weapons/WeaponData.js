// The fictional arsenal: base stats, recoil patterns, sound profiles and model
// proportions for every weapon, plus attachments and equipment.

export const CLASSES = {
  ar: 'Assault Rifle', smg: 'Submachine Gun', sniper: 'Sniper Rifle', shotgun: 'Shotgun',
  lmg: 'Light Machine Gun', marksman: 'Marksman Rifle', pistol: 'Pistol',
};

/*
 * damage: [close, far] per bullet, range: [falloffStart, falloffEnd] metres.
 * recoil: v = vertical kick (deg), h = horizontal wander (deg), pattern = per-shot horizontal bias,
 *         recover = how fast the view settles, kick = visual push-back.
 * spread: hip / ads / move cone (deg).
 * model: proportions used by WeaponModel (metres).
 */
export const WEAPONS = {
  vx4: {
    name: 'VX-4 Talon', class: 'ar', slot: 'primary', mode: 'auto', modes: ['auto', 'burst', 'semi'],
    rpm: 760, damage: [30, 22], range: [28, 60], headMult: 1.6, mag: 30, reserve: 180,
    reload: 2.1, reloadEmpty: 2.6, ads: 0.24, move: 0.95, velocity: 880,
    recoil: { v: 0.62, h: 0.32, pattern: [0.2, 0.4, 0.1, -0.3, -0.5, -0.2, 0.3, 0.5], recover: 9, kick: 0.035 },
    spread: { hip: 3.2, ads: 0.12, move: 2.2 },
    sound: { pitch: 1.0, body: 2400, thump: 140, crack: 0.9, tail: 0.6, sample: 'ar' },
    model: { len: 0.82, barrel: 0.36, body: 'ar', color: 0x2a2c2e, accent: 0x3b3f42, magType: 'curved' },
    desc: 'Balanced 5.56 carbine. Predictable climb, fast handling — the operator\'s default.',
  },
  rk74: {
    name: 'RK-74 Volkov', class: 'ar', slot: 'primary', mode: 'auto', modes: ['auto', 'semi'],
    rpm: 620, damage: [38, 28], range: [30, 65], headMult: 1.6, mag: 30, reserve: 150,
    reload: 2.4, reloadEmpty: 2.9, ads: 0.28, move: 0.92, velocity: 760,
    recoil: { v: 0.95, h: 0.55, pattern: [0.4, 0.6, 0.2, -0.6, -0.8, 0.3, 0.7, -0.4], recover: 7, kick: 0.045 },
    spread: { hip: 3.6, ads: 0.16, move: 2.4 },
    sound: { pitch: 0.88, body: 1900, thump: 120, crack: 1.0, tail: 0.75, gain: 1.1, sample: 'ar', samplePitch: 0.93 },
    model: { len: 0.88, barrel: 0.4, body: 'ak', color: 0x2b2522, accent: 0x6b4a2e, magType: 'banana' },
    desc: 'Hard-hitting 7.62 rifle. Brutal at range if you can tame the kick.',
  },
  hx30: {
    name: 'HX-30 Bastion', class: 'marksman', slot: 'primary', mode: 'semi', modes: ['semi'],
    rpm: 330, damage: [58, 48], range: [45, 90], headMult: 2.0, mag: 20, reserve: 100,
    reload: 2.5, reloadEmpty: 3.0, ads: 0.3, move: 0.9, velocity: 900,
    recoil: { v: 1.6, h: 0.4, pattern: [0.3, -0.3], recover: 8, kick: 0.06 },
    spread: { hip: 4, ads: 0.05, move: 2.5 },
    sound: { pitch: 0.8, body: 1700, thump: 110, crack: 1.1, tail: 0.85, gain: 1.15 },
    model: { len: 0.98, barrel: 0.48, body: 'scar', color: 0x9a8a66, accent: 0x2a2a28, magType: 'box' },
    desc: 'Semi-automatic battle rifle. Two-tap kills and a scope-ready rail.',
    defaultOptic: 'acog',
  },
  wasp: {
    name: 'MP-9 Wasp', class: 'smg', slot: 'primary', mode: 'auto', modes: ['auto', 'semi'],
    rpm: 950, damage: [26, 15], range: [12, 32], headMult: 1.4, mag: 32, reserve: 192,
    reload: 1.8, reloadEmpty: 2.2, ads: 0.17, move: 1.05, velocity: 420,
    recoil: { v: 0.42, h: 0.42, pattern: [0.3, -0.3, 0.5, -0.5, 0.2, -0.2], recover: 12, kick: 0.025 },
    spread: { hip: 2.4, ads: 0.25, move: 1.4 },
    sound: { pitch: 1.25, body: 3000, thump: 170, crack: 0.6, tail: 0.4, gain: 0.85, sample: 'smg' },
    model: { len: 0.55, barrel: 0.16, body: 'smg', color: 0x1e2022, accent: 0x2d3033, magType: 'straight' },
    desc: 'Compact 9 mm buzzsaw. Owns hallways, struggles past 30 metres.',
  },
  viper: {
    name: 'K-45 Viper', class: 'smg', slot: 'primary', mode: 'auto', modes: ['auto', 'burst'],
    rpm: 1100, damage: [24, 14], range: [10, 26], headMult: 1.4, mag: 25, reserve: 175,
    reload: 1.9, reloadEmpty: 2.3, ads: 0.16, move: 1.06, velocity: 400,
    recoil: { v: 0.36, h: 0.2, pattern: [0.1, 0.1, -0.1, -0.1], recover: 14, kick: 0.02 },
    spread: { hip: 2.2, ads: 0.28, move: 1.3 },
    sound: { pitch: 1.1, body: 2600, thump: 190, crack: 0.55, tail: 0.35, gain: 0.85, sample: 'smg', samplePitch: 1.05 },
    model: { len: 0.6, barrel: 0.18, body: 'vector', color: 0x34383a, accent: 0x1a1a1a, magType: 'straight' },
    desc: 'Recoil-mitigating .45 SMG. Shreds anything up close.',
  },
  longbow: {
    name: 'LR-50 Longbow', class: 'sniper', slot: 'primary', mode: 'bolt', modes: ['bolt'],
    rpm: 48, damage: [135, 115], range: [80, 180], headMult: 2.5, mag: 5, reserve: 30,
    reload: 3.2, reloadEmpty: 3.6, ads: 0.42, move: 0.85, velocity: 950, boltTime: 1.05,
    recoil: { v: 4.5, h: 0.8, pattern: [0.5], recover: 5, kick: 0.12 },
    spread: { hip: 6, ads: 0, move: 4 },
    sound: { pitch: 0.65, body: 1400, thump: 90, crack: 1.4, tail: 1.2, gain: 1.35 },
    model: { len: 1.22, barrel: 0.62, body: 'bolt', color: 0x3a4232, accent: 0x1c1d1e, magType: 'box' },
    desc: '.338 bolt-action. One shot to the chest at any range. Hold Shift to steady.',
    defaultOptic: 'sniper8',
  },
  specter: {
    name: 'SR-7 Specter', class: 'sniper', slot: 'primary', mode: 'semi', modes: ['semi'],
    rpm: 160, damage: [95, 80], range: [60, 140], headMult: 2.2, mag: 10, reserve: 50,
    reload: 2.9, reloadEmpty: 3.4, ads: 0.38, move: 0.87, velocity: 900,
    recoil: { v: 2.8, h: 0.6, pattern: [0.4, -0.4], recover: 6, kick: 0.09 },
    spread: { hip: 5.5, ads: 0, move: 4 },
    sound: { pitch: 0.72, body: 1500, thump: 100, crack: 1.3, tail: 1.0, gain: 1.25 },
    model: { len: 1.12, barrel: 0.55, body: 'dmr', color: 0x2c2e30, accent: 0x50483a, magType: 'box' },
    desc: 'Semi-auto precision rifle. Faster follow-ups, slightly less punch.',
    defaultOptic: 'sniper8',
  },
  breaker: {
    name: 'Breaker-12', class: 'shotgun', slot: 'primary', mode: 'pump', modes: ['pump'],
    rpm: 70, damage: [22, 6], range: [7, 22], headMult: 1.2, mag: 7, reserve: 35, pellets: 9,
    reload: 0.55, reloadEmpty: 0.55, perShell: true, ads: 0.25, move: 0.95, velocity: 400, boltTime: 0.7,
    recoil: { v: 3.5, h: 0.9, pattern: [0.4], recover: 6, kick: 0.1 },
    spread: { hip: 5.5, ads: 4.2, move: 1, pelletSpread: 4.5 },
    sound: { pitch: 0.7, body: 1300, thump: 80, crack: 0.9, tail: 0.9, gain: 1.3 },
    model: { len: 0.95, barrel: 0.5, body: 'pump', color: 0x232323, accent: 0x5a3f28, magType: 'tube' },
    desc: '12-gauge pump. Nine pellets of room clearing.',
  },
  havoc: {
    name: 'AA-20 Havoc', class: 'shotgun', slot: 'primary', mode: 'auto', modes: ['auto', 'semi'],
    rpm: 300, damage: [16, 4], range: [6, 16], headMult: 1.2, mag: 10, reserve: 40, pellets: 8,
    reload: 2.6, reloadEmpty: 3.0, ads: 0.27, move: 0.93, velocity: 380,
    recoil: { v: 2.4, h: 1.1, pattern: [0.6, -0.5, 0.4], recover: 7, kick: 0.08 },
    spread: { hip: 6.5, ads: 5.2, move: 1, pelletSpread: 5.5 },
    sound: { pitch: 0.75, body: 1400, thump: 85, crack: 0.8, tail: 0.8, gain: 1.25 },
    model: { len: 0.85, barrel: 0.38, body: 'autoshotgun', color: 0x2a2c2a, accent: 0x111111, magType: 'drum' },
    desc: 'Drum-fed automatic shotgun. Panic button for breaching.',
  },
  juggernaut: {
    name: 'M-260 Juggernaut', class: 'lmg', slot: 'primary', mode: 'auto', modes: ['auto'],
    rpm: 680, damage: [34, 26], range: [35, 75], headMult: 1.5, mag: 100, reserve: 200,
    reload: 5.2, reloadEmpty: 5.8, ads: 0.4, move: 0.82, velocity: 860,
    recoil: { v: 0.68, h: 0.5, pattern: [0.3, 0.5, -0.2, -0.6, 0.4, -0.1], recover: 7, kick: 0.04 },
    spread: { hip: 4.5, ads: 0.2, move: 3.4 },
    sound: { pitch: 0.92, body: 2000, thump: 125, crack: 1.0, tail: 0.8, gain: 1.15 },
    model: { len: 1.0, barrel: 0.48, body: 'lmg', color: 0x2c2f2a, accent: 0x5a5e4a, magType: 'boxmag' },
    desc: 'Belt-fed suppression. A hundred rounds before you have to stop talking.',
  },
  p11: {
    name: 'P-11 Warden', class: 'pistol', slot: 'secondary', mode: 'semi', modes: ['semi'],
    rpm: 450, damage: [32, 20], range: [12, 30], headMult: 1.6, mag: 15, reserve: 75,
    reload: 1.5, reloadEmpty: 1.8, ads: 0.14, move: 1.08, velocity: 380,
    recoil: { v: 1.1, h: 0.4, pattern: [0.3, -0.3], recover: 12, kick: 0.05 },
    spread: { hip: 1.8, ads: 0.25, move: 1 },
    sound: { pitch: 1.2, body: 2800, thump: 160, crack: 0.7, tail: 0.45, gain: 0.85 },
    model: { len: 0.2, barrel: 0.1, body: 'pistol', color: 0x222324, accent: 0x111111, magType: 'pistol' },
    desc: 'Reliable 9 mm sidearm. Fast draw, fast reload.',
  },
  raptor: {
    name: '.50 Raptor', class: 'pistol', slot: 'secondary', mode: 'semi', modes: ['semi'],
    rpm: 180, damage: [70, 45], range: [15, 35], headMult: 1.8, mag: 7, reserve: 35,
    reload: 1.9, reloadEmpty: 2.2, ads: 0.17, move: 1.05, velocity: 450,
    recoil: { v: 3.2, h: 0.9, pattern: [0.4, -0.4], recover: 8, kick: 0.1 },
    spread: { hip: 2.6, ads: 0.25, move: 1.4 },
    sound: { pitch: 0.82, body: 1900, thump: 110, crack: 1.0, tail: 0.75, gain: 1.15 },
    model: { len: 0.27, barrel: 0.13, body: 'deagle', color: 0x8a8d90, accent: 0x222222, magType: 'pistol' },
    desc: 'Hand cannon. Two body shots, one to the head.',
  },
};

export const PRIMARIES = Object.keys(WEAPONS).filter((k) => WEAPONS[k].slot === 'primary');
export const SECONDARIES = Object.keys(WEAPONS).filter((k) => WEAPONS[k].slot === 'secondary');

/*
 * Attachments. Stat mods are multipliers (×) unless noted:
 * recoilV, recoilH, adsTime, spreadHip, range, move, reload, mag(+), suppressed(bool), zoom, sight.
 */
export const ATTACHMENTS = {
  optic: {
    iron: { name: 'Iron Sights', desc: 'Factory sights.', zoom: 1.2, sight: 'iron' },
    reflex: { name: 'Pinpoint Reflex', desc: 'Clean red dot, minimal obstruction.', zoom: 1.35, sight: 'reflex', adsTime: 1.02 },
    holo: { name: 'HV-2 Holographic', desc: 'Ring-and-dot holo. Fast target acquisition.', zoom: 1.45, sight: 'holo', adsTime: 1.04 },
    acog: { name: 'Tac-4x Combat Scope', desc: '4× prism optic with a lit chevron and bullet-drop ladder.', zoom: 4, sight: 'acog', adsTime: 1.12, classes: ['ar', 'marksman', 'lmg', 'sniper'] },
    sniper8: { name: 'Vantage 6-14× Scope', desc: 'Variable sniper optic (mouse wheel zooms 6×, 10×, 14×) with a mil-hash reticle and rangefinder.', zoom: 10, zoomSteps: [6, 10, 14], sight: 'scope', adsTime: 1.2, scope: true, classes: ['sniper', 'marksman'] },
    thermal: { name: 'Night-Eye Thermal', desc: '3-8× thermal (mouse wheel zooms): hostiles glow through smoke and darkness.', zoom: 5, zoomSteps: [3, 5, 8], sight: 'scope', adsTime: 1.25, scope: true, thermal: true, classes: ['ar', 'marksman', 'sniper', 'lmg'] },
  },
  muzzle: {
    none: { name: 'None', desc: '' },
    suppressor: { name: 'Ghost Suppressor', desc: 'Silent fire, off the enemy radar. Slight range loss.', suppressed: true, range: 0.85, recoilV: 0.95 },
    compensator: { name: 'K-Comp Compensator', desc: 'Redirects gas to fight vertical climb.', recoilV: 0.8, recoilH: 1.1 },
    flash: { name: 'Flash Guard', desc: 'Hides muzzle flash and tightens horizontal wander.', recoilH: 0.85, noFlash: true },
  },
  barrel: {
    stock: { name: 'Factory Barrel', desc: '' },
    long: { name: 'Extended Barrel', desc: '+25% effective range. Heavier.', range: 1.25, adsTime: 1.08, move: 0.98 },
    short: { name: 'CQB Barrel', desc: 'Faster handling, shorter reach.', range: 0.85, adsTime: 0.9, move: 1.02, spreadHip: 0.9 },
  },
  underbarrel: {
    none: { name: 'None', desc: '' },
    vgrip: { name: 'Vertical Grip', desc: 'Controls vertical recoil.', recoilV: 0.85, adsTime: 1.03 },
    agrip: { name: 'Angled Grip', desc: 'Snappier aim-down-sights.', adsTime: 0.86, recoilH: 0.95 },
    laser: { name: 'Tac Laser', desc: 'Tighter hip-fire cone.', spreadHip: 0.65 },
  },
  magazine: {
    standard: { name: 'Standard Mag', desc: '' },
    extended: { name: 'Extended Mag', desc: '+50% capacity, slower reload.', magMult: 1.5, reload: 1.15, adsTime: 1.03 },
    fast: { name: 'Fast Mag', desc: 'Taped mags: much faster reloads.', reload: 0.75 },
  },
  stock: {
    standard: { name: 'Standard Stock', desc: '' },
    heavy: { name: 'Heavy Stock', desc: 'Steadier aim and lower recoil. Slower movement.', recoilV: 0.88, recoilH: 0.85, move: 0.97 },
    light: { name: 'Skeleton Stock', desc: 'Run faster and aim quicker, more kick.', recoilV: 1.12, move: 1.04, adsTime: 0.92 },
  },
};

export const SLOT_NAMES = { optic: 'Optic', muzzle: 'Muzzle', barrel: 'Barrel', underbarrel: 'Underbarrel', magazine: 'Magazine', stock: 'Stock' };
export const SLOT_DEFAULT = { optic: 'iron', muzzle: 'none', barrel: 'stock', underbarrel: 'none', magazine: 'standard', stock: 'standard' };

export function allowedAttachments(weaponId, slot) {
  const w = WEAPONS[weaponId];
  const list = ATTACHMENTS[slot];
  return Object.keys(list).filter((k) => {
    const a = list[k];
    if (a.classes && !a.classes.includes(w.class)) return false;
    if (w.class === 'pistol' && (slot === 'barrel' || slot === 'underbarrel' || slot === 'stock')) return k === Object.keys(list)[0];
    if (w.class === 'pistol' && slot === 'optic') return k === 'iron' || k === 'reflex';
    if (w.class === 'shotgun' && slot === 'optic') return !a.scope && k !== 'acog';
    if (w.mode === 'pump' && slot === 'magazine') return k !== 'fast';
    return true;
  });
}

/** Resolve the full attachment set (filling defaults) for a weapon. */
export function resolveAttachments(weaponId, chosen = {}) {
  const w = WEAPONS[weaponId];
  const out = {};
  for (const slot of Object.keys(SLOT_DEFAULT)) {
    let id = chosen[slot] ?? (slot === 'optic' && w.defaultOptic ? w.defaultOptic : SLOT_DEFAULT[slot]);
    if (!allowedAttachments(weaponId, slot).includes(id)) id = SLOT_DEFAULT[slot];
    out[slot] = id;
  }
  return out;
}

/** Final stats after attachments. */
export function computeStats(weaponId, att) {
  const w = WEAPONS[weaponId];
  const s = {
    ...w,
    recoil: { ...w.recoil },
    spread: { ...w.spread },
    range: [...w.range],
    suppressed: false,
    zoom: 1.15,
    sight: 'iron',
    scope: false,
    thermal: false,
    noFlash: false,
  };
  for (const slot of Object.keys(att)) {
    const a = ATTACHMENTS[slot][att[slot]];
    if (!a) continue;
    if (a.recoilV) s.recoil.v *= a.recoilV;
    if (a.recoilH) s.recoil.h *= a.recoilH;
    if (a.adsTime) s.ads *= a.adsTime;
    if (a.spreadHip) s.spread.hip *= a.spreadHip;
    if (a.range) { s.range[0] *= a.range; s.range[1] *= a.range; }
    if (a.move) s.move *= a.move;
    if (a.reload) { s.reload *= a.reload; s.reloadEmpty *= a.reload; }
    if (a.magMult) s.mag = Math.round(s.mag * a.magMult);
    if (a.suppressed) s.suppressed = true;
    if (a.noFlash) s.noFlash = true;
    if (a.zoom) s.zoom = a.zoom;
    if (a.zoomSteps) s.zoomSteps = a.zoomSteps;
    if (a.sight) s.sight = a.sight;
    if (a.scope) s.scope = true;
    if (a.thermal) s.thermal = true;
  }
  return s;
}

/** 0-100 ratings for the gunsmith stat bars. */
export function ratings(s) {
  const dps = (s.damage[0] * (s.pellets ?? 1) * Math.min(s.rpm, 1000)) / 60;
  return {
    Damage: Math.min(100, (s.damage[0] * (s.pellets ? s.pellets * 0.55 : 1)) / 1.4),
    'Fire Rate': Math.min(100, s.rpm / 11),
    Range: Math.min(100, s.range[1] / 1.8),
    Accuracy: Math.max(5, 100 - (s.recoil.v * 22 + s.recoil.h * 25)),
    Mobility: Math.min(100, (s.move - 0.75) * 300),
    Handling: Math.max(5, 100 - s.ads * 180),
    _dps: dps,
  };
}

export const EQUIPMENT = {
  frag: { short: 'Frag', name: 'M67-X Frag', type: 'lethal', fuse: 3.5, radius: 10, damage: 160, fx: 1.5, count: 2, cook: true, desc: 'Cookable fragmentation grenade.' },
  semtex: { short: 'Semtex', name: 'Sticky Semtex', type: 'lethal', fuse: 2.2, radius: 8, damage: 150, fx: 1.35, count: 2, sticky: true, desc: 'Sticks to the first surface it hits.' },
  c4: { short: 'C4', name: 'C4 Charge', type: 'lethal', fuse: Infinity, radius: 12, damage: 200, fx: 2, count: 1, remote: true, desc: 'Throw, then press the key again to detonate.' },
  flash: { short: 'Flash', name: 'M84-S Flashbang', type: 'tactical', fuse: 1.6, radius: 20, count: 2, flash: true, fx: 1.3, desc: 'Blinds and deafens everyone facing it.' },
  smoke: { short: 'Smoke', name: 'Smoke Screen', type: 'tactical', fuse: 1.4, radius: 7.35, count: 2, smoke: true, desc: 'Thick cloud that blocks line of sight for 20 s.' },
  stim: { short: 'Stim', name: 'Combat Stim', type: 'tactical', count: 1, stim: true, desc: 'Instantly restores health and resets regeneration.' },
};
export const LETHALS = Object.keys(EQUIPMENT).filter((k) => EQUIPMENT[k].type === 'lethal');
export const TACTICALS = Object.keys(EQUIPMENT).filter((k) => EQUIPMENT[k].type === 'tactical');
