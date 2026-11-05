// The player's weapons: firing, fire modes, recoil, spread, ADS, reloads (mag and
// per-shell), bolt/pump cycling, switching, melee, equipment throws and the
// animated first-person viewmodel rendered in its own scene.
import * as THREE from '../lib/three.js';
import { WEAPONS, EQUIPMENT, computeStats, resolveAttachments } from './WeaponData.js';
import { buildWeaponModel, buildArms, Q_CRADLE, Q_VGRIP } from './WeaponModel.js';
import { getSpriteTexture } from '../world/Textures.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { clamp, damp, lerp, rand, smoothstep } from '../core/Utils.js';
import { buildTools, actionHands, handQuat } from './Actions.js';

const ZERO3 = new THREE.Vector3();
// Overall recoil feel: how hard each shot pushes the view (RECOIL_VIEW) and how far
// the gun jumps in the hands (RECOIL_GUN), applied on top of every weapon's stats.
const RECOIL_VIEW = 0.36, RECOIL_GUN = 0.42;
// Support hand on a handguard (gun-local offset from the model's hand point) and
// where its elbow sits below the view.
const CRADLE_OFF = new THREE.Vector3(-0.004, 0.004, -0.03);
const ELBOW_L_CRADLE = new THREE.Vector3(-0.3, -0.42, -0.1);

const DEG = Math.PI / 180;

/*
 * Magazine reload choreography (fraction of reload time -> mag offset from its home
 * position in weapon space, plus mag pitch/roll). The left hand grips the mag from
 * 0.10 to 0.70, so it visibly pulls the old mag out, drops it below the frame,
 * comes back with a fresh one and seats it.
 */
const MAG_KEYS = [
  [0.00, 0, 0, 0, 0, 0],
  [0.20, 0, 0, 0, 0, 0], // hand on the mag, thumb on the release
  [0.26, 0, -0.045, 0.005, 0.06, 0], // released, starts sliding out
  [0.33, -0.04, -0.13, 0.06, 0.45, -0.35], // pulled clear, turned toward the camera
  [0.38, -0.05, -0.15, 0.07, 0.55, -0.4], // brief look at the empty mag
  [0.46, -0.16, -0.55, 0.12, 1.0, -0.6], // stowed below the frame
  [0.51, -0.16, -0.55, 0.12, 1.0, -0.6], // grabbing a fresh mag from the pouch
  [0.585, -0.03, -0.14, 0.04, 0.32, -0.2], // fresh mag lined up under the well
  [0.61, -0.008, -0.1, 0.012, 0.16, -0.05],
  [0.64, 0, -0.04, 0, 0.04, 0], // entering the well
  [0.665, 0, 0.008, 0, 0, 0], // seated hard (tiny overshoot)
  [0.70, 0, 0, 0, 0, 0],
  [1.00, 0, 0, 0, 0, 0],
];

// Pistols swing the mag out to the left so it clears the gun hand's forearm.
const PISTOL_MAG_KEYS = [
  [0.00, 0, 0, 0, 0, 0],
  [0.20, 0, 0, 0, 0, 0],
  [0.26, 0, -0.04, 0, 0, 0], // dropped free of the grip
  [0.33, -0.09, -0.1, 0.05, 0.3, -0.5], // pulled left into view
  [0.38, -0.11, -0.12, 0.06, 0.35, -0.6],
  [0.46, -0.22, -0.5, 0.1, 0.8, -0.9], // stowed
  [0.51, -0.22, -0.5, 0.1, 0.8, -0.9],
  [0.585, -0.08, -0.12, 0.04, 0.25, -0.45], // fresh mag shown left of the grip
  [0.62, -0.02, -0.07, 0.01, 0.08, -0.1],
  [0.645, 0, -0.03, 0, 0, 0],
  [0.665, 0, 0.006, 0, 0, 0], // seated
  [0.70, 0, 0, 0, 0, 0],
  [1.00, 0, 0, 0, 0, 0],
];

function sampleKeys(keys, p) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  const k = smoothstep(clamp((p - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1));
  const out = [];
  for (let j = 1; j < a.length; j++) out.push(a[j] + (b[j] - a[j]) * k);
  return out;
}

/** 0 -> 1 -> 0 bump over [a, b]. */
function bump(p, a, b) {
  if (p <= a || p >= b) return 0;
  return Math.sin(((p - a) / (b - a)) * Math.PI);
}

// Night-vision flip: the goggles hinge on the helmet mount above your brow.
const NVG_PIVOT = new THREE.Vector3(0, 0.105, -0.02);
const NVG_DOWN = new THREE.Vector3(0, -0.105, -0.058); // pivot -> housing centre, flipped down
const NVG_UP = 1.95; // radians the arm swings up to stow
const NVG_DUR = 1.15;
const _nq = new THREE.Quaternion(), _nv = new THREE.Vector3(), _nx = new THREE.Vector3(1, 0, 0);

/** Binocular goggles (dual tubes on a bridge with a J-arm to the helmet mount). */
function buildGoggles() {
  const hull = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.55, metalness: 0.25 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0f1011, roughness: 0.95, metalness: 0 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x0b1614, roughness: 0.05, metalness: 0.8, emissive: 0x0f3a34, emissiveIntensity: 0.4 });
  const root = new THREE.Group();
  const arm = new THREE.Group(); // swings about X at the pivot
  arm.position.copy(NVG_PIVOT);
  root.add(arm);
  const body = new THREE.Group();
  body.position.copy(NVG_DOWN);
  arm.add(body);
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; body.add(o); return o; };
  add(new THREE.BoxGeometry(0.03, 0.028, 0.05), hull, 0, 0.012, 0); // bridge
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.0175, 0.0175, 0.07, 20), hull, s * 0.032, 0, -0.004, Math.PI / 2); // tube
    add(new THREE.CylinderGeometry(0.019, 0.0185, 0.02, 20), hull, s * 0.032, 0, -0.045, Math.PI / 2); // objective focus ring
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.BoxGeometry(0.003, 0.003, 0.018), rubber, s * 0.032 + Math.cos(a) * 0.0195, Math.sin(a) * 0.0195, -0.045); }
    add(new THREE.CircleGeometry(0.015, 20), lens, s * 0.032, 0, -0.0551, Math.PI); // objective
    add(new THREE.CylinderGeometry(0.0195, 0.017, 0.022, 20, 1, true), rubber, s * 0.032, 0, 0.042, Math.PI / 2); // eyecup
    const ep = add(new THREE.CircleGeometry(0.012, 18), lens, s * 0.032, 0, 0.036);
    ep.material = new THREE.MeshStandardMaterial({ color: 0x0a1210, roughness: 0.1, metalness: 0.5, emissive: 0x2a9f8c, emissiveIntensity: 0 });
    body.userData[s < 0 ? 'eyeL' : 'eyeR'] = ep.material;
  }
  add(new THREE.BoxGeometry(0.016, 0.012, 0.028), hull, 0, 0.032, -0.012); // IR illuminator
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 10), lens, 0, 0.032, -0.027, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 12), hull, 0.024, 0.026, 0.006, 0); // battery cap side knob
  // J-arm back up to the mount, and the mount itself on the helmet.
  const len = NVG_DOWN.length();
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.012, len * 0.86, 0.01), hull);
  strut.position.copy(NVG_DOWN).multiplyScalar(0.5);
  strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), NVG_DOWN.clone().normalize());
  arm.add(strut);
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.02, 0.026), hull);
  arm.add(mount);
  root.visible = false;
  root.traverse((o) => { o.frustumCulled = false; });
  return { root, arm, body };
}

export class WeaponSystem {
  constructor(game, loadout) {
    this.game = game;
    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.viewHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.viewSun = new THREE.DirectionalLight(0xffffff, 2);
    this.viewScene.add(this.viewHemi, this.viewSun, this.viewSun.target);
    this.viewFlashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.viewScene.add(this.viewFlashLight);
    this.rig = new THREE.Group(); // weapon root in camera space
    this.viewScene.add(this.rig);
    this.arms = buildArms(game.mode?.sleeveColor ?? 0x4d5340);
    this.viewScene.add(this.arms.left, this.arms.right);
    this.nvgAnim = null;

    const flashMat = new THREE.SpriteMaterial({ map: getSpriteTexture('flash'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    // Shotgun shell held in the left hand during shell-by-shell reloads.
    this.shell = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x9a1c14, roughness: 0.6 }));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 10), new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.3, metalness: 0.9 }));
    base.position.y = -0.031;
    this.shell.add(hull, base);
    this.shell.scale.setScalar(1.15);
    this.shell.visible = false;
    this.viewScene.add(this.shell);
    this.shellPose = 0;

    this.flashSprite = new THREE.Sprite(flashMat);
    this.flashSprite.visible = false;
    this.flashTime = 0;

    this.slots = [];
    this.current = 0;
    this.setLoadout(loadout);

    this.state = 'raise';
    this.stateT = 0;
    this.ads = 0;
    this.fireTimer = 0;
    this.burstLeft = 0;
    this.shotsInRow = 0;
    this.triggerHeld = false;
    this.firing = false;
    this.lastFire = -1;
    this.kickZ = 0;
    this.kickRot = 0;
    this.kickSide = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.time = 0;
    this.scopeSway = new THREE.Vector2();
    this.cooking = null;
    this.c4 = null;
    this.reloadEvents = new Set();
    this.lastSwitch = 0;
    this.bloom = 0;
  }

  setLoadout(lo) {
    for (const s of this.slots) s.model.group.removeFromParent();
    this.slots = [lo.primary, lo.secondary].filter(Boolean).map((id) => this._makeInstance(id, lo.attachments?.[id]));
    this.lethal = { id: lo.lethal ?? 'frag', count: EQUIPMENT[lo.lethal ?? 'frag'].count };
    this.tactical = { id: lo.tactical ?? 'flash', count: EQUIPMENT[lo.tactical ?? 'flash'].count };
    this.current = 0;
    this._show();
    this.state = 'raise';
    this.stateT = 0;
  }

  _makeInstance(id, chosenAtt) {
    let att = resolveAttachments(id, chosenAtt ?? Store.getAttachments(id));
    // Suppressed-only missions: whatever you carry or pick up has a suppressor on it.
    if (this.game.mode?.mission?.allSuppressed && att.muzzle !== 'suppressor') att = { ...att, muzzle: 'suppressor' };
    const stats = computeStats(id, att);
    const model = buildWeaponModel(WEAPONS[id], att);
    if (model.sling) model.sling.visible = false; // slung on soldiers, out of the way in your hands
    return { id, att, stats, model, ammo: stats.mag, reserve: stats.reserve, modeIndex: 0, mode: stats.modes[0], laser: !!Store.data.laser?.[id] };
  }

  /** Swap the active slot's weapon (e.g. picking up an enemy gun). */
  replaceCurrent(id, attachments = {}) {
    const inst = this._makeInstance(id, attachments);
    inst.reserve = Math.floor(inst.stats.reserve * 0.5);
    this.slots[this.current].model.group.removeFromParent();
    this.slots[this.current] = inst;
    this._show();
    this.state = 'raise';
    this.stateT = 0;
    Audio.mech('raise');
  }

  get weapon() { return this.slots[this.current]; }
  get stats() { return this.weapon.stats; }

  _show() {
    for (const s of this.slots) s.model.group.removeFromParent();
    const w = this.weapon;
    this.rig.add(w.model.group);
    this.flashSprite.removeFromParent();
    w.model.muzzle.add(this.flashSprite);
    this.flashSprite.position.set(0, 0, -0.06);
  }

  // ---- queries used by Player / HUD ----
  blocksSprint() { return this.state === 'throw' || this.cooking !== null || this.firing; }
  cancelAds() { this.adsHeldBlocked = true; }
  isFiring() { return this.game.time - this.lastFire < 0.12; }
  recoverRate() { return this.stats.recoil.recover; }
  moveMult() { return this.stats.move * (1 - this.ads * 0.35); }
  isReloading() { return this.state === 'reload'; }

  scopeInfo() {
    const s = this.stats;
    const overlay = s.scope || s.sight === 'acog';
    return { active: overlay && this.ads > 0.86, kind: s.thermal ? 'thermal' : s.sight === 'acog' ? 'acog' : 'sniper' };
  }

  /** Magnification the current optic is set to (variable scopes step through zoomSteps). */
  get zoomTarget() {
    const s = this.stats, w = this.weapon;
    if (!s.zoomSteps) return s.zoom;
    if (w.zoomIdx == null || w.zoomIdx >= s.zoomSteps.length) w.zoomIdx = Math.max(0, s.zoomSteps.indexOf(s.zoom));
    return s.zoomSteps[w.zoomIdx];
  }

  get zoom() { return this.zoomNow ?? this.zoomTarget; }

  currentFov(base) {
    const z = lerp(1, this.zoom, smoothstep(this.ads));
    return base / z;
  }

  spreadDeg() {
    const s = this.stats.spread;
    const p = this.game.player;
    let sp = lerp(s.hip, s.ads, smoothstep(this.ads));
    const moveF = clamp(p.speed / 5, 0, 1.4);
    sp += s.move * moveF * (1 - this.ads * 0.6);
    if (!p.onGround) sp += 3;
    if (p.stance === 'crouch') sp *= 0.8;
    if (p.stance === 'prone') sp *= 0.6;
    sp += this.bloom * (1 - this.ads * 0.8);
    // Laser on: hip shots go where the dot is (much tighter cone and bloom).
    if (this.laserOn) sp *= lerp(0.45, 1, smoothstep(this.ads));
    return sp;
  }

  /** SMGs and rifles carry a laser module (L to toggle). */
  laserCapable() {
    return ['ar', 'smg', 'marksman', 'sniper', 'lmg'].includes(this.stats.class);
  }

  get laserOn() {
    return !!this.weapon?.laser && this.laserCapable();
  }

  onJump() { this.kickRot += 0.05; }

  // ---- main update ----
  update(dt, input, player) {
    this.time += dt;
    const w = this.weapon;
    const s = w.stats;
    this.stateT += dt;
    this.fireTimer -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 6);

    // Busy with an objective (hacking, planting, cuffing...): weapon is lowered.
    const canAct = player.alive && !this.game.paused && !this.game.action;
    // Variable-power optics: the mouse wheel zooms while scoped (instead of switching weapons).
    if (s.zoomSteps && this.ads > 0.6 && input.wheel !== 0) {
      const n = s.zoomSteps.length;
      const i = clamp((w.zoomIdx ?? s.zoomSteps.indexOf(s.zoom)) + (input.wheel < 0 ? 1 : -1), 0, n - 1);
      if (i !== w.zoomIdx) { w.zoomIdx = i; Audio.ui('click'); }
      input.wheel = 0;
    }
    this.zoomNow = damp(this.zoomNow ?? this.zoomTarget, this.zoomTarget, 16, dt);

    // Weapon switching.
    if (canAct && this.state !== 'switchOut' && this.state !== 'throw' && this.cooking === null && this.slots.length > 1) {
      let target = -1;
      if (input.pressed('Digit1')) target = 0;
      if (input.pressed('Digit2')) target = 1;
      if (input.wheel !== 0 || input.pressed('KeyX')) target = (this.current + 1) % this.slots.length;
      if (target >= 0 && target !== this.current) {
        this.nextSlot = target;
        this.state = 'switchOut';
        this.stateT = 0;
        this.burstLeft = 0;
      }
    }

    // ADS.
    const adsBlocked = player.sprinting || player.climbing || this.state === 'switchOut' || this.state === 'raise' || this.state === 'melee' || this.state === 'throw' || (this.state === 'reload' && !s.perShell);
    // Aim down sights / scope: hold right mouse, or hold Left Alt on the keyboard.
    const wantAds = canAct && (input.mouseDown[2] || input.isDown('AltLeft')) && !adsBlocked;
    const adsRate = 1 / Math.max(0.08, s.ads);
    this.ads = clamp(this.ads + (wantAds ? adsRate : -adsRate * 1.4) * dt, 0, 1);

    // Fire mode toggle.
    if (canAct && input.pressed('KeyL')) {
      if (this.laserCapable()) {
        w.laser = !w.laser;
        Audio.ui('click');
        this.game.hud?.toast(w.laser ? 'LASER ON' : 'LASER OFF');
      } else this.game.hud?.toast('NO LASER ON THIS WEAPON');
    }
    if (canAct && input.pressed('KeyB') && s.modes.length > 1) {
      w.modeIndex = (w.modeIndex + 1) % s.modes.length;
      w.mode = s.modes[w.modeIndex];
      Audio.mech('slide');
      this.game.hud?.toast(`FIRE MODE: ${w.mode.toUpperCase()}`);
    }

    // Reload.
    if (canAct && input.pressed('KeyR')) this.startReload();

    // Melee.
    if (canAct && input.pressed('KeyV') && (this.state === 'idle' || this.state === 'reload')) {
      this.state = 'melee';
      this.stateT = 0;
      this.meleeDone = false;
      this.ads = 0;
    }

    // Equipment.
    if (canAct) this._equipment(input, player);

    // Firing.
    const trigger = canAct && input.mouseDown[0];
    const triggerPressed = canAct && input.mousePressed[0];
    this.firing = false;
    if (this.state === 'idle' && !player.sprinting && !player.climbing) {
      const mode = w.mode;
      if (mode === 'auto') {
        if (trigger) this._tryFire(player);
      } else if (mode === 'burst') {
        if (triggerPressed && this.burstLeft <= 0 && this.fireTimer <= 0) this.burstLeft = 3;
        if (this.burstLeft > 0 && this._tryFire(player, 1.25)) this.burstLeft--;
      } else if (triggerPressed) {
        this._tryFire(player);
      }
      if (!trigger) this.shotsInRow = Math.max(0, this.shotsInRow - dt * 20);
    } else if (this.state === 'reload' && s.perShell && triggerPressed && w.ammo > 0) {
      // Interrupt shell-by-shell reload to fire.
      this.state = 'idle';
      this.stateT = 0;
    } else if (player.sprinting && triggerPressed) {
      player.sprinting = false;
    }
    this.firing = trigger && this.state === 'idle';

    this._updateStates(dt, player);
    this._animate(dt, input, player);
  }

  _tryFire(player, rateMult = 1) {
    const w = this.weapon, s = w.stats;
    if (this.fireTimer > 0) return false;
    if (w.ammo <= 0) {
      if (this.game.input.mousePressed[0]) Audio.dryFire();
      if (w.reserve > 0) this.startReload();
      this.burstLeft = 0;
      return false;
    }
    w.ammo--;
    this.fireTimer = 60 / (s.rpm * rateMult);
    this.lastFire = this.game.time;
    this.shotsInRow = Math.floor(this.shotsInRow) + 1;
    const cam = this.game.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const pellets = s.pellets ?? 1;
    const spread = this.spreadDeg();
    const muzzleWorld = this.muzzleWorld();
    let anyHit = false;
    for (let i = 0; i < pellets; i++) {
      const cone = pellets > 1 ? lerp(s.spread.pelletSpread, s.spread.pelletSpread * 0.8, this.ads) : spread;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.tan(cone * DEG * 0.5);
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const hit = this.game.fireBullet(origin, dir, {
        shooter: player, weaponId: w.id, damage: s.damage, range: s.range, headMult: s.headMult, maxDist: 400,
      });
      if (hit?.actor) anyHit = true;
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, 200);
      if (i === 0 && (this.shotsInRow % 2 === 1 || pellets > 1) && !s.suppressed) this.game.effects.tracer(muzzleWorld, end, 420);
    }
    Store.stats.shotsFired++;
    if (anyHit) Store.stats.shotsHit++;
    // Recoil.
    const r = s.recoil;
    const stanceM = player.stance === 'prone' ? 0.55 : player.stance === 'crouch' ? 0.82 : 1;
    const adsM = lerp(1, 0.72, this.ads);
    const pat = r.pattern[(this.shotsInRow - 1) % r.pattern.length] ?? 0;
    const v = r.v * stanceM * adsM * rand(0.85, 1.12) * (1 + Math.min(this.shotsInRow, 12) * 0.015);
    const h = (pat * r.h + rand(-0.5, 0.5) * r.h * 0.7) * stanceM * adsM;
    player.kick(v * RECOIL_VIEW, h * RECOIL_VIEW);
    this.kickZ += r.kick * (1 - this.ads * 0.5) * RECOIL_GUN;
    this.kickRot += r.kick * 1.6 * RECOIL_GUN;
    this.kickSide += h * 0.003 * RECOIL_VIEW;
    this.bloom = Math.min(this.bloom + s.spread.hip * 0.12, s.spread.hip * 0.8);
    // Feedback.
    Audio.gunshot(s.sound, null, s.suppressed);
    if (!s.noFlash) {
      this.flashSprite.visible = true;
      this.flashSprite.material.rotation = Math.random() * Math.PI;
      const fs = (s.suppressed ? 0.06 : 0.16) * (s.class === 'shotgun' || s.class === 'sniper' ? 1.4 : 1) * rand(0.8, 1.2);
      this.flashSprite.scale.set(fs, fs, fs);
      this.flashTime = 0.045;
      this.viewFlashLight.intensity = s.suppressed ? 0.5 : 3;
    }
    this.game.effects.muzzle(muzzleWorld, fwd, 1, !s.suppressed && !s.noFlash);
    // Barrel heat: a burst leaves smoke curling off the muzzle (more through a can).
    this.heat = Math.min(3, (this.heat ?? 0) + (s.class === 'shotgun' ? 0.55 : s.class === 'sniper' ? 0.7 : 0.16) * (s.suppressed ? 1.6 : 1));
    if (s.class !== 'shotgun' && s.mode !== 'bolt') {
      this.game.effects.casing(muzzleWorld.clone().addScaledVector(fwd, -0.4).addScaledVector(right, 0.05), right);
      Audio.shellCasing();
    }
    // (Missions can make the team's gunfire inaudible to the enemy.)
    const silent = !!this.game.mode?.mission?.silentShots;
    if (!silent) this.game.emitNoise(player.pos, s.suppressed ? 9 : 75, player);
    player.lastShotTime = this.game.time;
    if (!s.suppressed && !silent) player.revealed = this.game.time;
    // Bolt / pump cycle.
    if (w.mode === 'bolt' || w.mode === 'pump') {
      if (w.ammo > 0) { this.state = 'cycle'; this.stateT = 0; this.cycleSounded = false; }
    }
    if (w.ammo === 0 && w.reserve > 0 && w.mode !== 'auto') {
      setTimeout(() => { if (this.weapon === w && w.ammo === 0 && this.state === 'idle') this.startReload(); }, 250);
    }
    return true;
  }

  muzzleWorld() {
    // Map the viewmodel muzzle (camera space, own FOV) into world space.
    const m = this.weapon.model.muzzle;
    this.rig.updateMatrixWorld();
    const local = m.getWorldPosition(new THREE.Vector3());
    // Compensate the different FOV: scale x/y toward the centre.
    const k = Math.tan((this.game.camera.fov * DEG) / 2) / Math.tan((this.viewCam.fov * DEG) / 2);
    local.x *= k; local.y *= k;
    return local.applyMatrix4(this.game.camera.matrixWorld);
  }

  startReload() {
    const w = this.weapon;
    if (this.state !== 'idle' && this.state !== 'cycle') return;
    if (w.ammo >= w.stats.mag || w.reserve <= 0) return;
    this.state = 'reload';
    this.stateT = 0;
    this.reloadEmpty = w.ammo === 0;
    this.reloadEvents.clear();
    this.burstLeft = 0;
  }

  _updateStates(dt, player) {
    const w = this.weapon, s = w.stats;
    const isPistol = s.class === 'pistol';
    switch (this.state) {
      case 'raise': {
        const dur = isPistol ? 0.3 : 0.45;
        if (this.stateT === dt) Audio.mech('raise');
        if (this.stateT >= dur) { this.state = 'idle'; this.stateT = 0; }
        break;
      }
      case 'switchOut': {
        const dur = isPistol ? 0.2 : 0.28;
        if (this.stateT >= dur) {
          this.current = this.nextSlot;
          this._show();
          this.state = 'raise';
          this.stateT = 0;
          this.ads = 0;
        }
        break;
      }
      case 'cycle': {
        const dur = s.boltTime ?? 0.6;
        if (!this.cycleSounded && this.stateT > dur * 0.25) {
          Audio.mech(w.mode === 'pump' ? 'pump' : 'bolt');
          this.cycleSounded = true;
          if (s.class === 'shotgun' || w.mode === 'bolt') {
            this.game.effects.casing(this.muzzleWorld().addScaledVector(this.game.camera.getWorldDirection(new THREE.Vector3()), -0.5), new THREE.Vector3(1, 0, 0).applyQuaternion(this.game.camera.quaternion));
          }
        }
        if (this.stateT >= dur) { this.state = 'idle'; this.stateT = 0; }
        break;
      }
      case 'reload': {
        if (s.perShell) {
          const per = s.reload;
          if (this.stateT >= per) {
            this.stateT = 0;
            if (w.reserve > 0 && w.ammo < s.mag) {
              w.ammo++; w.reserve--;
              Audio.mech('shell');
            }
            if (w.ammo >= s.mag || w.reserve <= 0) {
              this.state = this.reloadEmpty ? 'cycle' : 'idle';
              this.cycleSounded = false;
            }
          }
          break;
        }
        const dur = this.reloadEmpty ? s.reloadEmpty : s.reload;
        const p = this.stateT / dur;
        const ev = (name, at, fn) => { if (p >= at && !this.reloadEvents.has(name)) { this.reloadEvents.add(name); fn(); } };
        ev('out', 0.24, () => Audio.mech('magOut'));
        ev('pouch', 0.48, () => Audio.mech('raise'));
        ev('in', 0.655, () => Audio.mech('magIn'));
        if (this.reloadEmpty) ev('bolt', 0.82, () => Audio.mech(isPistol ? 'slide' : 'bolt'));
        if (p >= 1) {
          const need = s.mag - w.ammo;
          const take = Math.min(need, w.reserve);
          w.ammo += take;
          w.reserve -= take;
          this.state = 'idle';
          this.stateT = 0;
        }
        break;
      }
      case 'melee': {
        if (!this.meleeDone && this.stateT > 0.14) {
          this.meleeDone = true;
          this.game.melee(player);
        }
        if (this.stateT > 0.55) { this.state = 'idle'; this.stateT = 0; }
        break;
      }
      case 'throw': {
        if (this.stateT > 0.45) { this.state = 'raise'; this.stateT = 0; }
        break;
      }
      default:
        break;
    }
  }

  _equipment(input, player) {
    const busy = this.state === 'switchOut' || this.state === 'throw' || this.state === 'melee';
    // Lethal (G).
    const L = this.lethal, ld = EQUIPMENT[L.id];
    if (input.pressed('KeyG') && !busy) {
      if (ld.remote && this.c4 && !this.c4.dead) {
        this.c4.detonate = true;
        Audio.ui('beep');
        this.c4 = null;
      } else if (L.count > 0 && this.cooking === null) {
        this.cooking = { id: L.id, t: 0, slot: 'lethal' };
        Audio.mech('pin');
      }
    }
    // Tactical (Q).
    const T = this.tactical, td = EQUIPMENT[T.id];
    if (input.pressed('KeyQ') && !busy && T.count > 0 && this.cooking === null) {
      if (td.stim) {
        T.count--;
        player.heal(true);
        Audio.mech('pin');
        this.game.hud?.toast('STIM APPLIED');
      } else {
        this.cooking = { id: T.id, t: 0, slot: 'tactical' };
        Audio.mech('pin');
      }
    }
    if (this.cooking) {
      const c = this.cooking;
      const def = EQUIPMENT[c.id];
      c.t += this.game.dt;
      const key = c.slot === 'lethal' ? 'KeyG' : 'KeyQ';
      const cooked = def.cook && c.t >= def.fuse - 0.05;
      if (!input.isDown(key) || cooked || !def.cook) {
        if (c.t < 0.12 && input.isDown(key) && !def.cook) return; // brief wind-up
        const slot = c.slot === 'lethal' ? this.lethal : this.tactical;
        slot.count--;
        const cam = this.game.camera;
        const dir = cam.getWorldDirection(new THREE.Vector3());
        const origin = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.4);
        // Throw speed 18.25 m/s: about 27 m at the best angle (was 17 m/s, about 24 m).
        const vel = dir.multiplyScalar(18.25).add(new THREE.Vector3(0, 3, 0)).add(player.vel.clone().multiplyScalar(0.5));
        const g = this.game.grenades.throw(c.id, origin, vel, player, def.cook ? c.t : 0);
        if (def.remote) this.c4 = g;
        this.cooking = null;
        this.state = 'throw';
        this.stateT = 0;
        this.ads = 0;
      }
    }
  }

  _animate(dt, input, player) {
    const w = this.weapon, s = w.stats;
    const isPistol = s.class === 'pistol';
    const mi = this.game.input;
    void mi;
    // Sway from mouse movement.
    const md = this.game.lastMouse ?? { x: 0, y: 0 };
    const swayAmt = lerp(1, 0.2, this.ads);
    this.swayX = damp(this.swayX, clamp(-md.x * 0.0009, -0.06, 0.06) * swayAmt, 10, dt);
    this.swayY = damp(this.swayY, clamp(md.y * 0.0009, -0.06, 0.06) * swayAmt, 10, dt);
    this.kickZ = damp(this.kickZ, 0, 16, dt);
    this.kickRot = damp(this.kickRot, 0, 14, dt);
    this.kickSide = damp(this.kickSide, 0, 12, dt);

    const a = smoothstep(this.ads);
    const long = s.class === 'sniper' || s.class === 'lmg' || s.class === 'marksman';
    // Hip carry: framed so both gloved hands sit in the lower part of the view.
    // Rifles sit low and toward the middle, muzzle angled in, so the support hand on
    // the near side of the handguard is in full view.
    const hip = isPistol ? new THREE.Vector3(0.13, -0.15, -0.36) : long ? new THREE.Vector3(0.135, -0.175, -0.49) : new THREE.Vector3(0.115, -0.162, -0.43);
    const adsPos = new THREE.Vector3(0, -w.model.sightY, isPistol ? -0.34 : -0.3 + (s.sight === 'iron' ? 0.02 : 0));
    const pos = hip.clone().lerp(adsPos, a);
    const rot = new THREE.Euler(0, isPistol ? 0 : 0.06 * (1 - a), isPistol ? 0 : -0.05 * (1 - a));

    // Bob.
    const bobA = player.bob * (1 - a * 0.85);
    const bp = player.bobPhase;
    pos.x += Math.cos(bp) * 0.012 * bobA * (player.sprinting ? 2 : 1);
    pos.y += Math.abs(Math.sin(bp)) * 0.014 * bobA * (player.sprinting ? 2 : 1);
    // Idle breathing.
    pos.y += Math.sin(this.time * 1.6) * 0.0025 * (1 - a * 0.7);
    // Tactical sprint: the gun comes up one-handed beside the right shoulder, muzzle
    // to the sky, while the free arm pumps in time with the stride.
    this.sprintBlend = damp(this.sprintBlend ?? 0, player.sprinting && this.state !== 'reload' ? 1 : 0, 9, dt);
    const sb = this.sprintBlend;
    const stride = Math.sin(bp);
    pos.x += (isPistol ? -0.02 : 0.03) * sb; pos.y += (isPistol ? 0.02 : 0.045) * sb + Math.abs(stride) * 0.012 * sb; pos.z += (isPistol ? 0.06 : 0.11) * sb;
    rot.x += (isPistol ? 0.95 : 1.05) * sb + stride * 0.05 * sb; rot.y += 0.22 * sb; rot.z += -0.38 * sb + stride * 0.04 * sb;
    // Stance tilt (prone/crouch cant).
    // Kick.
    pos.z += this.kickZ;
    pos.x += this.kickSide;
    rot.x += this.kickRot;
    pos.x += this.swayX; pos.y += this.swayY;
    rot.y += this.swayX * 2; rot.x += this.swayY * 1.5;

    // State animations.
    const t = this.stateT;
    const mag = w.model.mag, home = w.model.magHome;
    mag.position.copy(home);
    mag.rotation.set(0, 0, 0);
    mag.visible = true;
    let leftOverride = null;
    this._shellHand = null;
    // Shotgun shell-loading pose (blended so interrupting it is smooth).
    this.shellPose = damp(this.shellPose, this.state === 'reload' && s.perShell ? 1 : 0, 10, dt);
    pos.x -= this.shellPose * 0.08; pos.y += this.shellPose * 0.13;
    rot.x += this.shellPose * 0.3; rot.z -= this.shellPose * 0.75; rot.y += this.shellPose * 0.12;
    if (this.state === 'raise') {
      const p = 1 - smoothstep(clamp(t / (isPistol ? 0.3 : 0.45), 0, 1));
      pos.y -= p * 0.3; rot.x -= p * 0.9;
    } else if (this.state === 'switchOut') {
      const p = smoothstep(clamp(t / 0.28, 0, 1));
      pos.y -= p * 0.3; rot.x -= p * 0.9;
    } else if (this.state === 'reload' && !s.perShell) {
      const dur = this.reloadEmpty ? s.reloadEmpty : s.reload;
      const p = clamp(t / dur, 0, 1);
      // Gun pose: lift and cant the rifle so the magwell faces the screen centre.
      const outStart = this.reloadEmpty ? 0.9 : 0.8;
      const env = Math.min(smoothstep(clamp(p / 0.13, 0, 1)), 1 - smoothstep(clamp((p - outStart) / (1 - outStart), 0, 1)));
      if (isPistol) {
        // Turn the pistol so the bottom of the grip faces the camera.
        pos.x -= env * 0.11; pos.y += env * 0.12; pos.z += env * 0.02;
        rot.x += env * 0.34; rot.z -= env * 0.6; rot.y += env * 0.32;
      } else {
        pos.x -= env * 0.08; pos.y += env * 0.15; pos.z += env * 0.01;
        rot.x += env * 0.33; rot.z -= env * 0.5; rot.y += env * 0.1;
      }
      // Small physical jolts: mag release, seating the fresh mag, charging.
      rot.x -= bump(p, 0.2, 0.3) * 0.035;
      rot.x += bump(p, 0.645, 0.72) * 0.06; pos.y += bump(p, 0.645, 0.72) * 0.012;
      // Magazine path.
      const [mx, my, mz, mrx, mrz] = sampleKeys(isPistol ? PISTOL_MAG_KEYS : MAG_KEYS, p);
      mag.position.set(home.x + mx, home.y + my, home.z + mz);
      mag.rotation.set(mrx, 0, mrz);
      // Left hand: foregrip -> mag -> (pull mag out, fetch new one, seat it) -> charge -> foregrip.
      const gripOnMag = (w.model.magGrip ?? new THREE.Vector3(0, -0.06, 0)).clone().applyEuler(mag.rotation).add(mag.position);
      const rest = w.model.leftHand;
      const act = w.model.action;
      if (act) {
        act.position.copy(w.model.actionHome);
        act.rotation.set(0, 0, 0);
        // An empty pistol's slide stays locked back until it is racked.
        if (isPistol && this.reloadEmpty && p < 0.83) act.position.z += 0.04;
      }
      if (p < 0.12) {
        leftOverride = rest.clone().lerp(gripOnMag, smoothstep(p / 0.12));
      } else if (p < 0.7) {
        leftOverride = gripOnMag;
      } else if (this.reloadEmpty && act && !isPistol && p < 0.9) {
        // Rack the charging handle / slide / bolt.
        const handle = act.position.clone().add(
          isPistol ? new THREE.Vector3(0, 0.022, 0.085) : w.mode === 'bolt' ? new THREE.Vector3(0.06, -0.005, 0) : new THREE.Vector3(-0.04, -0.035, -0.12),
        );
        const reach = smoothstep(clamp((p - 0.7) / 0.08, 0, 1));
        const pull = bump(p, 0.78, 0.88);
        if (w.mode === 'bolt') {
          act.rotation.z = Math.min(1, pull * 2) * 1.1;
          act.position.z = w.model.actionHome.z + Math.max(0, pull - 0.3) * 0.12;
        } else {
          act.position.z = Math.max(act.position.z, w.model.actionHome.z + pull * (isPistol ? 0.045 : 0.07));
        }
        const handNow = isPistol || w.mode === 'bolt'
          ? act.position.clone().add(handle.sub(w.model.actionHome))
          : handle.add(new THREE.Vector3(0, 0, pull * 0.015)); // slap the bolt release
        leftOverride = gripOnMag.clone().lerp(handNow, reach);
        rot.z -= pull * 0.06;
      } else {
        const racked = this.reloadEmpty && act && !isPistol;
        const from = racked ? 0.9 : 0.7;
        const k = smoothstep(clamp((p - from) / (racked ? 0.08 : 0.14), 0, 1));
        // Empty pistol: slide stop pressed, slide slams home with a kick.
        if (isPistol && this.reloadEmpty) { rot.x += bump(p, 0.82, 0.9) * 0.08; pos.z += bump(p, 0.82, 0.9) * 0.01; }
        const start = racked
          ? act.position.clone().add(isPistol ? new THREE.Vector3(0, 0.022, 0.085) : w.mode === 'bolt' ? new THREE.Vector3(0.06, -0.005, 0) : new THREE.Vector3(-0.04, -0.035, -0.12))
          : gripOnMag;
        leftOverride = start.lerp(rest, k);
      }
    } else if (this.state === 'reload' && s.perShell) {
      // Shell by shell: hand brings a shell up from the belt and thumbs it into the loading port.
      const k = clamp(t / s.reload, 0, 1);
      const port = new THREE.Vector3(0, -0.04, -0.07);
      const below = new THREE.Vector3(-0.06, -0.26, 0.02);
      let hand;
      if (k < 0.45) hand = below.clone().lerp(port.clone().add(new THREE.Vector3(0, -0.035, 0.03)), smoothstep(k / 0.45));
      else if (k < 0.7) hand = port.clone().add(new THREE.Vector3(0, -0.035, 0.03)).lerp(port, smoothstep((k - 0.45) / 0.25));
      else hand = port.clone().lerp(below, smoothstep((k - 0.7) / 0.3));
      leftOverride = hand;
      this._shellHand = k < 0.7 ? hand : null;
      rot.x += bump(k, 0.6, 0.78) * 0.03;
    } else if (this.state === 'cycle') {
      const dur = s.boltTime ?? 0.6;
      const k = Math.sin(clamp(t / dur, 0, 1) * Math.PI);
      if (w.mode === 'pump' && w.model.action) w.model.action.position.z = w.model.actionHome.z + k * 0.1;
      if (w.mode === 'bolt' && w.model.action) {
        w.model.action.rotation.z = k * 1.1;
        w.model.action.position.z = w.model.actionHome.z + Math.max(0, k - 0.3) * 0.12;
        if (this.ads < 0.5) { rot.z += k * 0.25; }
      }
      rot.x += k * 0.05;
    } else if (this.state === 'melee') {
      const k = Math.sin(clamp(t / 0.5, 0, 1) * Math.PI);
      pos.x -= k * 0.12; pos.z -= k * 0.18; rot.y += k * 0.9; rot.z -= k * 0.4;
    } else if (this.state === 'throw') {
      const k = Math.sin(clamp(t / 0.45, 0, 1) * Math.PI);
      pos.y -= k * 0.25; rot.x -= k * 0.6;
    }
    if (this.cooking) {
      pos.y -= 0.12; rot.x -= 0.3; pos.x += 0.05;
    }
    // Climbing: gun swings down and aside while the hands are busy.
    this.mantleBlend = damp(this.mantleBlend ?? 0, player.climbing ? 1 : 0, 14, dt);
    pos.y -= this.mantleBlend * 0.16; pos.x += this.mantleBlend * 0.04; rot.x -= this.mantleBlend * 0.5; rot.z -= this.mantleBlend * 0.4;
    if (!(this.state === 'cycle' && w.mode === 'bolt') && w.model.action && this.state !== 'reload') {
      w.model.action.position.copy(w.model.actionHome);
      w.model.action.rotation.z = 0;
    }
    // Pistol slide lock-back when empty.
    if (isPistol && w.model.action && this.state !== 'reload') {
      const back = w.ammo === 0 && this.state !== 'reload' ? 0.04 : this.game.time - this.lastFire < 0.06 ? 0.035 : 0;
      w.model.action.position.z = w.model.actionHome.z + back;
    }

    // Hands busy with an objective: the weapon drops out of view first.
    const actB = this.arms.real ? (this.game.action?.blend ?? 0) : 0;
    if (actB > 0) {
      const e = smoothstep(Math.min(1, actB * 2));
      pos.y -= 0.42 * e;
      pos.x += 0.05 * e;
      rot.x -= 0.75 * e;
    }
    // Flipping the goggles: the gun drops and cants away while the support hand is up.
    const nv = this.nvgAnim;
    let nvPose = null;
    if (nv) {
      nv.t += dt / NVG_DUR;
      nvPose = this._nvgPose(nv);
      const e = nvPose.gunDip;
      pos.y -= 0.05 * e; pos.x += 0.025 * e; pos.z += 0.03 * e;
      rot.x -= 0.12 * e; rot.z -= 0.22 * e;
      const gg = this.goggles;
      gg.arm.rotation.x = nvPose.ang;
      gg.root.visible = nvPose.show;
      for (const k of ['eyeL', 'eyeR']) gg.body.userData[k].emissiveIntensity = nv.on ? 0 : 0.6; // tubes still glowing as they come off
      if (nv.t >= 1) { this.finishNvg(); nvPose = null; }
    }
    this.rig.position.copy(pos);
    this.rig.rotation.copy(rot);
    w.model.group.position.set(0, 0, 0);

    // Scope hides the model.
    const scope = this.scopeInfo();
    this.rig.visible = !scope.active && !player.rappel && actB < 0.5;
    this.arms.left.visible = this.arms.right.visible = !scope.active;

    // Arms: elbows fixed below-outside the view, hands on grip / foregrip.
    this.rig.updateMatrixWorld(true);
    const grip = (w.model.rightHand ?? new THREE.Vector3(0, -0.04, 0.03)).clone().applyMatrix4(this.rig.matrixWorld);
    const leftLocal = leftOverride ?? w.model.leftHand;
    // The gloved support hand grips the near side of the handguard, back of the glove to the camera.
    const cradle = this.arms.real && !leftOverride && !w.model.vgrip && !isPistol;
    const lh = leftLocal.clone().add(cradle ? CRADLE_OFF : ZERO3).applyMatrix4(this.rig.matrixWorld);
    if (this.cooking || this.state === 'throw') lh.set(-0.15, -0.25, -0.35);
    else if (sb > 0.01 && !leftOverride) {
      // Free arm pumping: forward and up on one stride, back and down on the next.
      const swing = Math.sin(bp);
      const pump = new THREE.Vector3(-0.2 + swing * 0.02, -0.33 + swing * 0.08, -0.36 - swing * 0.1);
      lh.lerp(pump, sb);
    }
    // Elbows below the view: the support forearm runs forward under the gun.
    const elbowR = new THREE.Vector3(0.28, -0.42, 0.05), elbowL = cradle ? ELBOW_L_CRADLE : new THREE.Vector3(-0.22, -0.45, -0.05);
    if (this.arms.real && actB >= 0.5) {
      // Working on an objective: hands come up from below to the work.
      this.tools ??= buildTools(this.arms.hands.right);
      const cam = this.game.camera, act = this.game.action;
      const hands = actionHands(act);
      const rise = smoothstep((actB - 0.5) * 2);
      const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.viewCam.fov * Math.PI) / 360);
      const camQi = cam.getWorldQuaternion(new THREE.Quaternion()).invert();
      for (const side of ['left', 'right']) {
        const h = hands[side];
        const v = h.pos.clone().applyMatrix4(cam.matrixWorldInverse);
        v.x /= k; v.y /= k;
        v.lerp(new THREE.Vector3(v.x * 0.6 + (side === 'right' ? 0.15 : -0.15), -0.55, -0.25), 1 - rise);
        const qv = camQi.clone().multiply(h.quat);
        this.arms.attach(side, null, v, side === 'right' ? elbowR : elbowL, h.pose, qv, 'fist');
      }
      for (const [name, t] of Object.entries(this.tools)) t.visible = hands.tool === name;
    } else if (this.arms.real && player.rappel) {
      // On the rappel rope: guide hand up the line in front of the chest, brake hand low by the hip.
      const cam = this.game.camera, plan = player.rappel.plan;
      const tw = plan.toWall;
      const at = new THREE.Vector3(player.pos.x + tw.x * 0.22, player.pos.y + 1.05, player.pos.z + tw.z * 0.22);
      const up = plan.anchor.clone().sub(at).normalize();
      const guide = at.clone().addScaledVector(up, 0.42);
      const right = new THREE.Vector3(-tw.z, 0, tw.x);
      const brake = new THREE.Vector3(at.x + right.x * 0.16 - tw.x * 0.05, player.pos.y + 0.72, at.z + right.z * 0.16 - tw.z * 0.05);
      const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.viewCam.fov * Math.PI) / 360);
      const toView = (v) => { const o = v.clone().applyMatrix4(cam.matrixWorldInverse); o.x /= k; o.y /= k; return o; };
      // Fists closed round the line: knuckles stacked down it, fingers wrapped toward the wall.
      const Z = up.clone().negate(), Y = tw.clone().negate(), X = new THREE.Vector3().crossVectors(Y, Z).normalize();
      Y.crossVectors(Z, X).normalize();
      const qWorld = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      const qView = cam.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qWorld);
      this.arms.attach('left', null, toView(guide), new THREE.Vector3(-0.3, -0.55, 0.1), 'fist', qView);
      this.arms.attach('right', null, toView(brake), new THREE.Vector3(0.34, -0.62, 0.1), 'fist', qView);
    } else if (this.arms.real) {
      // Gloved hands wrap the weapon: trigger hand on the grip, support hand on the
      // handguard; a free hand (sprinting, cooking, throwing) balls into a fist.
      const gq = this.rig.getWorldQuaternion(new THREE.Quaternion());
      const leftFree = this.cooking || this.state === 'throw' || (sb > 0.5 && !leftOverride);
      this.arms.attach('right', gq, grip, elbowR, 'trigger');
      if (nvPose && nvPose.reach > 0.02) {
        // Support hand up on the goggle housing: palm to the tubes, fingers forward.
        const r = nvPose.reach;
        const hand = lh.clone().lerp(nvPose.grab, r);
        hand.y += Math.sin(r * Math.PI) * 0.03; // arc up past the gun rather than through it
        const el = elbowL.clone().lerp(new THREE.Vector3(-0.38, -0.2, -0.14), r);
        const q = handQuat(new THREE.Vector3(0.35, 0.25, -1), new THREE.Vector3(0.2, -1, 0.1));
        const hq = gq.clone().multiply(cradle ? Q_CRADLE : Q_VGRIP).slerp(q, Math.min(1, r * 1.6));
        this.arms.attach('left', null, hand, el, r > 0.5 ? 'cradle' : 'foregrip', hq);
      } else this.arms.attach('left', leftFree ? null : gq, lh, elbowL, leftFree || leftOverride ? 'fist' : cradle ? 'cradle' : 'foregrip');
    } else {
      this.arms.place(this.arms.right, elbowR, grip);
      this.arms.place(this.arms.left, elbowL, lh);
    }
    if (this.tools && actB < 0.5) for (const t of Object.values(this.tools)) t.visible = false;
    if (this._shellHand && !scope.active) {
      this.shell.visible = true;
      this.shell.position.copy(this._shellHand).add(new THREE.Vector3(0.012, 0.02, -0.01)).applyMatrix4(this.rig.matrixWorld);
      this.shell.quaternion.copy(this.rig.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    } else {
      this.shell.visible = false;
    }

    // Muzzle flash decay.
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) { this.flashSprite.visible = false; this.viewFlashLight.intensity = 0; }
    }
    const mw = w.model.muzzle.getWorldPosition(new THREE.Vector3());
    this.muzzleView = mw; // muzzle in view space (for the world-space laser beam)
    // Smoke wisps off a hot barrel once the shooting stops.
    if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 0.45);
      const quiet = this.game.time - (player.lastShotTime ?? -9) > 0.12;
      if (quiet && this.heat > 0.3 && this.rig.visible && Math.random() < dt * 22 * Math.min(1.5, this.heat)) {
        const cam = this.game.camera;
        const p = mw.clone().applyMatrix4(cam.matrixWorld);
        const k = Math.min(1, this.heat);
        this.game.effects.smoke.emit(p.x, p.y, p.z, rand(-0.04, 0.04), rand(0.18, 0.42), rand(-0.04, 0.04),
          { life: rand(0.9, 1.6), size: 0.02, sizeEnd: rand(0.1, 0.18), color: [0.78, 0.78, 0.76], alpha: 0.2 * k, drag: 1.4, spin: 0.8 });
      }
    }
    this.viewFlashLight.position.copy(mw);

    // Viewmodel FOV narrows slightly with ADS so optics look right.
    const vf = lerp(60, s.scope ? 30 : 44, a);
    if (Math.abs(this.viewCam.fov - vf) > 0.01) { this.viewCam.fov = vf; this.viewCam.updateProjectionMatrix(); }
  }

  /**
   * Flip the goggles down (on) or up (off) by hand: the gun dips, the support hand
   * reaches up to the mount and swings the tubes over your eyes (or up out of the
   * way); `apply` fires at the moment they reach your eyes or leave them.
   * Returns false when the hands can't do it now (the caller applies it at once).
   */
  startNvg(on, apply) {
    if (this.nvgAnim || !this.arms.real || this.game.action || this.state === 'reload') return false;
    this.goggles ??= buildGoggles();
    if (!this.goggles.root.parent) this.viewScene.add(this.goggles.root);
    this.nvgAnim = { on, t: 0, apply, fired: false };
    return true;
  }

  /** Snap any flip in progress to its end (death, cutscenes). */
  finishNvg() {
    const a = this.nvgAnim;
    if (!a) return;
    if (!a.fired) a.apply();
    this.nvgAnim = null;
    if (this.goggles) this.goggles.root.visible = false;
  }

  /**
   * Goggle swing angle, hand target and gun dip for the flip at progress p (0..1).
   * On: reach up (0-.3), pull the tubes down over the eyes (.3-.62), hand back.
   * Off: reach up to the tubes (0-.25), push them up and away (.25-.62), hand back.
   */
  _nvgPose(a) {
    const p = a.t;
    const ease = (x) => smoothstep(clamp(x, 0, 1));
    let ang, reach;
    if (a.on) {
      ang = lerp(NVG_UP, 0.1, ease((p - 0.3) / 0.32));
      reach = p < 0.3 ? ease(p / 0.3) : p < 0.62 ? 1 : 1 - ease((p - 0.62) / 0.33);
      if (!a.fired && p >= 0.6) { a.fired = true; a.apply(); }
    } else {
      ang = lerp(0.1, NVG_UP, ease((p - 0.25) / 0.37));
      reach = p < 0.25 ? ease(p / 0.25) : p < 0.62 ? 1 : 1 - ease((p - 0.62) / 0.33);
      if (!a.fired && p >= 0.27) { a.fired = true; a.apply(); }
    }
    // Hand on the left side of the housing, wherever the arm has swung to.
    _nq.setFromAxisAngle(_nx, ang);
    const grab = _nv.set(-0.058, 0.004, 0.0).add(NVG_DOWN).applyQuaternion(_nq).add(NVG_PIVOT);
    // Shown only while they are moving and out in front of the eyes (once they are
    // down the picture is the goggles' own).
    const show = a.on ? !a.fired : a.fired && ang > 0.18;
    return { ang, reach, grab: grab.clone(), show, gunDip: Math.min(1, reach * 1.4) };
  }

  scopeOffset(dt, input, player) {
    const sc = this.scopeInfo();
    if (!sc.active || sc.kind === 'acog') {
      player.breath = Math.min(1, player.breath + dt * 0.3);
      return { x: 0, y: 0 };
    }
    const holding = input.anyDown('ShiftLeft', 'ShiftRight') && player.breath > 0;
    if (holding) player.breath = Math.max(0, player.breath - dt / 4);
    else player.breath = Math.min(1, player.breath + dt * 0.25);
    // Sway is angular, so high magnification shows more of it; ease it a little.
    const amp = (holding ? 0.0004 : player.breath <= 0 ? 0.012 : 0.0055) * clamp(9 / this.zoom, 0.6, 1);
    const st = player.stance === 'prone' ? 0.35 : player.stance === 'crouch' ? 0.7 : 1;
    const t = this.time;
    this.scopeSway.x = damp(this.scopeSway.x, Math.sin(t * 0.9) * amp * st + Math.sin(t * 2.3) * amp * 0.3 * st, 6, dt);
    this.scopeSway.y = damp(this.scopeSway.y, Math.sin(t * 1.3 + 1) * amp * st, 6, dt);
    return { x: this.scopeSway.y, y: this.scopeSway.x };
  }

  /** Refill ammo; returns true if anything was added. */
  addAmmo(fraction = 0.5, refillEquipment = true) {
    let any = false;
    for (const s of this.slots) {
      const max = s.stats.reserve;
      if (s.reserve < max) { s.reserve = Math.min(max, s.reserve + Math.ceil(max * fraction)); any = true; }
    }
    if (refillEquipment) {
      const lmax = EQUIPMENT[this.lethal.id].count, tmax = EQUIPMENT[this.tactical.id].count;
      if (this.lethal.count < lmax) { this.lethal.count++; any = true; }
      if (this.tactical.count < tmax) { this.tactical.count++; any = true; }
    }
    return any;
  }

  updateLighting(env, camera) {
    if (!env) return;
    if (this.viewScene.environment !== env.envMap) this.viewScene.environment = env.envMap;
    this.viewHemi.color.copy(env.hemi.color);
    this.viewHemi.groundColor.copy(env.hemi.groundColor);
    this.viewHemi.intensity = Math.max(0.7, env.hemi.intensity * 0.9); // keep the gun readable at night
    this.viewSun.color.copy(env.sun.color);
    this.viewSun.intensity = env.sun.intensity * 0.6;
    // Sun direction into camera space.
    const d = env.sunDir.clone().applyQuaternion(camera.quaternion.clone().invert());
    this.viewSun.position.copy(d.multiplyScalar(5));
  }

  dispose() {
    this.viewScene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}
