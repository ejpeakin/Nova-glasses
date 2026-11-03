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
    .then(([l, r]) => {
      dress(l.scene, 'left');
      dress(r.scene, 'right');
      templates.left = l.scene;
      templates.right = r.scene;
    })
    .catch((e) => console.warn('Hand models failed to load; using simple hands.', e));
  return loading;
}

export const handsReady = () => !!(templates.left && templates.right);

// Glove padding: how far the skin is pushed out along its normals (metres, before scaling).
const PADDING = 0.0026;

/**
 * Turn the bare hand mesh into a padded glove: inflate it along smoothed normals
 * (so fingers and palm get the bulk of a real tactical glove) and paint the
 * panels with vertex colours: black stretch fabric on the back, a darker-grey
 * synthetic-suede palm and reinforced fingertips.
 */
function dress(scene, side) {
  const s = side === 'right' ? 1 : -1;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry;
    const P = g.attributes.position, N = g.attributes.normal;
    const key = (i) => `${P.getX(i).toFixed(5)},${P.getY(i).toFixed(5)},${P.getZ(i).toFixed(5)}`;
    const acc = new Map();
    for (let i = 0; i < P.count; i++) {
      const k = key(i);
      const a = acc.get(k) ?? [0, 0, 0];
      a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i);
      acc.set(k, a);
    }
    g.computeBoundingBox();
    const tipY = g.boundingBox.min.y;
    const col = new Float32Array(P.count * 3);
    // Linear colour values (sRGB ~#262628 back, ~#3c3a38 palm, ~#46443f tips).
    const back = [0.019, 0.019, 0.021], palmC = [0.045, 0.042, 0.039], tipC = [0.062, 0.058, 0.052];
    const n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      const a = acc.get(key(i));
      n.set(a[0], a[1], a[2]).normalize();
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      // A little extra bulk over the palm and knuckles, less at the very fingertips.
      const pad = PADDING * (y < tipY + 0.025 ? 0.75 : 1);
      P.setXYZ(i, x + n.x * pad, y + n.y * pad, z + n.z * pad);
      const palm = THREE.MathUtils.smoothstep(n.x * -s, 0.05, 0.55);
      const tip = THREE.MathUtils.smoothstep(tipY + 0.028 - y, 0, 0.012);
      for (let c = 0; c < 3; c++) col[i * 3 + c] = THREE.MathUtils.lerp(THREE.MathUtils.lerp(back[c], palmC[c], palm), tipC[c], tip * 0.85);
    }
    P.needsUpdate = true;
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Normals are kept: a uniform offset leaves them unchanged, and recomputing
    // would split shading along the UV seams.
    g.computeBoundingBox();
    g.computeBoundingSphere();
  });
}

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
  // Fingers loosely curled over a keyboard.
  type: { index: [0.45, 0.55, 0.3], middle: [0.55, 0.7, 0.35], ring: [0.62, 0.75, 0.38], pinky: [0.7, 0.75, 0.38], thumb: [0.3, 0.25, 0.15], opp: 0.45 },
  // Open hand, palm flat against a surface.
  open: { index: [0.12, 0.15, 0.08], middle: [0.14, 0.16, 0.08], ring: [0.18, 0.18, 0.1], pinky: [0.22, 0.2, 0.1], thumb: [0.15, 0.1, 0.05], opp: 0.2 },
  // Thumb and index pinching (wires, a zip-tie tail), the rest tucked.
  pinch: { index: [0.95, 0.85, 0.45], middle: [1.25, 1.35, 0.75], ring: [1.35, 1.45, 0.8], pinky: [1.4, 1.4, 0.8], thumb: [0.55, 0.35, 0.25], opp: 0.85 },
};

let GLOVE = null, ARMOR = null, STRAP = null, CUFF = null;
function materials() {
  if (GLOVE) return;
  // Black tactical gloves: stretch fabric and synthetic leather (panels come from
  // vertex colours), a moulded rubber knuckle guard and a velcro wrist strap.
  const weave = getTexture('fabric', 256);
  GLOVE = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, map: weave, bumpMap: weave, bumpScale: 1.4, roughness: 0.62, metalness: 0, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x26262a), clearcoat: 0.1, clearcoatRoughness: 0.55 });
  ARMOR = new THREE.MeshPhysicalMaterial({ color: 0x232326, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 });
  STRAP = new THREE.MeshStandardMaterial({ color: 0x18181a, map: weave, bumpMap: weave, bumpScale: 2, roughness: 0.9, metalness: 0 });
  CUFF = new THREE.MeshPhysicalMaterial({ color: 0x1b1b1d, map: weave, bumpMap: weave, bumpScale: 1.2, roughness: 0.75, sheen: 0.25, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x242428), side: THREE.DoubleSide });
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
  const armature = bones.wrist.parent;
  // Moulded knuckle guard: a low plate across the back of the hand with a raised
  // pad over each knuckle.
  const plate = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.05, 4, 14), ARMOR);
  plate.position.copy(knuckles).add(new THREE.Vector3(s * 0.0125, 0.012, 0.001));
  plate.scale.set(0.55, 1, 1.35);
  plate.rotation.x = Math.PI / 2;
  armature.add(plate);
  const padGeo = new THREE.SphereGeometry(0.0072, 14, 10);
  for (const f of FINGERS) {
    const pad = new THREE.Mesh(padGeo, ARMOR);
    pad.position.copy(rest[`${f}-finger-phalanx-proximal`].p).add(new THREE.Vector3(s * 0.0128, 0.003, 0));
    pad.scale.set(0.6, 1.15, 0.95);
    armature.add(pad);
  }
  // Glove cuff running up under the sleeve, with a velcro strap and tab.
  const wristP = rest.wrist.p;
  // Narrow enough to tuck under the sleeve cuff whichever way the wrist turns.
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.026, 0.06, 22, 1, true), CUFF);
  cuff.position.set(wristP.x - s * 0.006, wristP.y + 0.02, wristP.z);
  armature.add(cuff);
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.017, 22), STRAP);
  strap.position.set(wristP.x - s * 0.006, wristP.y - 0.002, wristP.z);
  strap.scale.set(0.9, 1, 1.06);
  armature.add(strap);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.017, 0.026), STRAP);
  tab.position.set(wristP.x - s * 0.006 + s * 0.026, wristP.y - 0.002, wristP.z + 0.004);
  armature.add(tab);
  // The point that sits on the weapon's grip anchor: inside the curled fingers, off
  // the palm. The firing hand hangs down the grip from just under the index knuckle;
  // the support hand cradles the handguard from below.
  const gripPoint = side === 'right'
    ? knuckles.clone().addScaledVector(palm, 0.022).add(new THREE.Vector3(0, -0.006, -0.046))
    : knuckles.clone().addScaledVector(palm, 0.028).add(new THREE.Vector3(0, -0.01, 0.004));
  // Centre of the closed fist (where a held tool sits), in the same frame.
  const fistPoint = knuckles.clone().addScaledVector(palm, 0.024).add(new THREE.Vector3(0, 0.012, -0.004));
  const hand = {
    root, bones, side, gripPoint, fistPoint, palm: palm.clone(), current: null,
    /** Hold an object in the hand's frame (e.g. a tool at fistPoint). */
    hold(obj) { armature.add(obj); },
    wrist: () => bones.wrist.getWorldPosition(new THREE.Vector3()),
    pose(name) {
      if (this.current === name) return;
      this.current = name;
      const p = POSES[name] ?? POSES.trigger;
      for (const f of FINGERS) bendChain(fingerChain(f), p[f], 1, rest, bones, palm);
      const thumbToward = palm.clone().addScaledVector(pinkyward, p.opp).normalize();
      bendChain(THUMB, p.thumb, 0, rest, bones, thumbToward);
    },
    /** anchor: 'grip' (weapon grip point) or 'fist' (centre of the fist). */
    place(quat, target, anchor = 'grip') {
      root.quaternion.copy(quat);
      root.position.copy(target).sub((anchor === 'fist' ? fistPoint : gripPoint).clone().multiplyScalar(scale).applyQuaternion(quat));
      root.updateMatrixWorld(true);
    },
  };
  hand.pose('trigger');
  return hand;
}
