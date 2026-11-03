// Realistic first-person hands: the rigged WebXR "generic hand" meshes (the hand
// models three.js uses for WebXR hand tracking), dressed as tactical gloves and
// posed into weapon grips with forward kinematics.
//
// The rig is flat (every joint is a direct child of the armature), so a pose is
// built by rotating each finger segment about its knuckle and carrying the joints
// further along the finger with it.
import * as THREE from '../lib/three.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import * as SkeletonUtils from '../lib/SkeletonUtils.js';
import { LEFT_HAND_GLB, RIGHT_HAND_GLB } from '../assets/hands.js';
import { getTexture } from '../world/Textures.js';

const templates = {};
let loading = null;

/** Parse both hand models once (call before the first match). */
export function preloadHands() {
  if (loading) return loading;
  const parse = (b64) => new Promise((ok, no) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    new GLTFLoader().parse(bin, '', ok, no);
  });
  loading = Promise.all([parse(LEFT_HAND_GLB), parse(RIGHT_HAND_GLB)])
    .then(([l, r]) => { templates.left = l.scene; templates.right = r.scene; })
    .catch((e) => console.warn('Hand models failed to load; using simple hands.', e));
  return loading;
}

export const handsReady = () => !!(templates.left && templates.right);

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const fingerChain = (f) => [`${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`, `${f}-finger-phalanx-intermediate`, `${f}-finger-phalanx-distal`, `${f}-finger-tip`];
const THUMB = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];

/**
 * Grip poses. Per finger: flexion (rad) at [knuckle, middle joint, last joint].
 * thumb: [base, middle, tip]; opp: how far the thumb swings across the palm.
 */
export const POSES = {
  // Firing hand on a pistol grip: three fingers wrapped tight, index on the trigger.
  trigger: { index: [0.62, 0.95, 0.42], middle: [1.3, 1.5, 0.85], ring: [1.35, 1.5, 0.85], pinky: [1.4, 1.45, 0.8], thumb: [0.55, 0.45, 0.35], opp: 1.0 },
  // Support hand wrapped around a handguard.
  foregrip: { index: [0.82, 0.95, 0.5], middle: [0.92, 1.05, 0.55], ring: [0.98, 1.05, 0.55], pinky: [1.02, 1.0, 0.5], thumb: [0.3, 0.3, 0.2], opp: 0.42 },
  // Closed fist (running, holding a magazine or grenade).
  fist: { index: [1.35, 1.55, 0.9], middle: [1.4, 1.6, 0.9], ring: [1.45, 1.6, 0.9], pinky: [1.5, 1.55, 0.85], thumb: [0.65, 0.6, 0.45], opp: 1.1 },
};

let GLOVE = null, ARMOR = null, STRAP = null;
function materials() {
  if (GLOVE) return;
  // Black tactical gloves (synthetic leather) with a hard-shell knuckle guard.
  GLOVE = new THREE.MeshStandardMaterial({ color: 0x222224, map: getTexture('fabric', 256), roughness: 0.68, metalness: 0.04 });
  ARMOR = new THREE.MeshStandardMaterial({ color: 0x313136, roughness: 0.42, metalness: 0.06 });
  STRAP = new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.85, metalness: 0 });
}

/** Rotate a joint chain from its rest pose: each pivot bends the rest of the finger toward `toward`. */
function bendChain(names, angles, startK, rest, bones, toward) {
  const P = names.map((n) => rest[n].p.clone());
  const Q = names.map((n) => rest[n].q.clone());
  const r = new THREE.Quaternion(), axis = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let k = startK; k < names.length - 1; k++) {
    const a = angles[k - startK] ?? 0;
    if (!a) continue;
    dir.subVectors(P[k + 1], P[k]).normalize();
    axis.crossVectors(dir, toward);
    if (axis.lengthSq() < 1e-8) continue;
    r.setFromAxisAngle(axis.normalize(), a);
    for (let j = k + 1; j < names.length; j++) P[j].sub(P[k]).applyQuaternion(r).add(P[k]);
    for (let j = k; j < names.length; j++) Q[j].premultiply(r);
  }
  names.forEach((n, i) => { bones[n].position.copy(P[i]); bones[n].quaternion.copy(Q[i]); });
}

/**
 * A posable gloved hand. root: add to the scene; pose(name); place(quat, target)
 * puts the hand so its grip point sits on `target` with orientation `quat`.
 */
export function makeHand(side, scale = 1.3) {
  materials();
  const root = SkeletonUtils.clone(templates[side]);
  // A touch larger than life: gloved hands read properly next to the weapon at viewmodel distance.
  root.scale.setScalar(scale);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { o.material = GLOVE; o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 1; }
  });
  const rest = {};
  for (const [n, b] of Object.entries(bones)) rest[n] = { p: b.position.clone(), q: b.quaternion.clone() };
  const s = side === 'right' ? 1 : -1;
  const palm = new THREE.Vector3(-s, 0, 0); // palm faces -X on the right hand, +X on the left
  const pinkyward = new THREE.Vector3(0, 0, 1);
  const knuckles = FINGERS.map((f) => rest[`${f}-finger-phalanx-proximal`].p).reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(0.25);
  // Hard knuckle guard across the back of the hand, and a velcro wrist strap.
  const guard = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.046, 4, 12), ARMOR);
  guard.position.copy(knuckles).add(new THREE.Vector3(s * 0.012, 0.01, 0.002));
  guard.scale.set(0.75, 1, 1.25);
  guard.rotation.x = Math.PI / 2;
  const armature = bones.wrist.parent;
  armature.add(guard);
  const wristP = rest.wrist.p;
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.033, 0.026, 16), STRAP);
  strap.position.set(wristP.x - s * 0.008, wristP.y - 0.004, wristP.z);
  strap.scale.set(0.82, 1, 1.12);
  armature.add(strap);
  // The point that sits on the weapon's grip anchor: inside the curled fingers, off
  // the palm. The firing hand hangs down the grip from just under the index knuckle;
  // the support hand cradles the handguard from below.
  const gripPoint = side === 'right'
    ? knuckles.clone().addScaledVector(palm, 0.022).add(new THREE.Vector3(0, -0.006, -0.046))
    : knuckles.clone().addScaledVector(palm, 0.028).add(new THREE.Vector3(0, -0.01, 0.004));
  const hand = {
    root, bones, side, gripPoint, current: null,
    wrist: () => bones.wrist.getWorldPosition(new THREE.Vector3()),
    pose(name) {
      if (this.current === name) return;
      this.current = name;
      const p = POSES[name] ?? POSES.trigger;
      for (const f of FINGERS) bendChain(fingerChain(f), p[f], 1, rest, bones, palm);
      const thumbToward = palm.clone().addScaledVector(pinkyward, p.opp).normalize();
      bendChain(THUMB, p.thumb, 0, rest, bones, thumbToward);
    },
    place(quat, target) {
      root.quaternion.copy(quat);
      root.position.copy(target).sub(gripPoint.clone().multiplyScalar(scale).applyQuaternion(quat));
      root.updateMatrixWorld(true);
    },
  };
  hand.pose('trigger');
  return hand;
}
