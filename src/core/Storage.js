// Persistent settings, stats, loadouts and campaign progress (localStorage).
// Every access is guarded: private windows or blocked storage just fall back to defaults.

const KEY = 'shadowstrike.v1';

const DEFAULTS = {
  settings: {
    sensitivity: 1.0,
    adsSensitivity: 0.8,
    fov: 80,
    invertY: false,
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.9,
    quality: 'high', // low | medium | high
    renderScale: 1.0,
    showFps: false,
    fullscreen: true,
    crosshair: true,
    subtitles: true,
    nvgPhosphor: 'green', // green | white
    nvgAuto: true, // goggles down at the start of night missions
    squadVoice: true, // squadmates' radio replies are spoken (speech synthesis)
    difficulty: 'regular', // recruit | regular | hardened | veteran
  },
  stats: {
    kills: 0, deaths: 0, headshots: 0, shotsFired: 0, shotsHit: 0, grenadeKills: 0, meleeKills: 0,
    matchesPlayed: 0, matchesWon: 0, missionsCompleted: 0, wavesSurvived: 0, bestWave: 0,
    playTime: 0, longestKill: 0, xp: 0, weaponKills: {},
  },
  campaign: { unlocked: 1, completed: {}, bestTimes: {}, seenIntro: false, kit: {} }, // kit: missionId -> { primary, secondary } last drawn from the armory
  loadout: { primary: 'vx4', secondary: 'p11', lethal: 'frag', tactical: 'flash' },
  attachments: {}, // weaponId -> { optic, muzzle, barrel, underbarrel, magazine, stock }
  laser: {}, // weaponId -> laser module on at the start of a match
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && Object.keys(base[k]).length) {
      merge(base[k], over[k]);
    } else {
      base[k] = over[k];
    }
  }
  return base;
}

class StorageManager {
  constructor() {
    this.data = clone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) merge(this.data, JSON.parse(raw));
    } catch { /* storage unavailable: defaults */ }
    this._timer = 0;
  }

  get settings() { return this.data.settings; }
  get stats() { return this.data.stats; }
  get campaign() { return this.data.campaign; }
  get loadout() { return this.data.loadout; }
  get attachments() { return this.data.attachments; }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignored */ }
  }

  /** Debounced save for frequent updates (stats during play). */
  saveSoon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.save(), 1500);
  }

  resetStats() {
    this.data.stats = clone(DEFAULTS.stats);
    this.save();
  }

  getAttachments(weaponId) {
    if (!this.data.attachments[weaponId]) this.data.attachments[weaponId] = {};
    return this.data.attachments[weaponId];
  }
}

export const Store = new StorageManager();
