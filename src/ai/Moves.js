// Motion-captured moves on top of the procedural soldier rig: deaths, a crouch
// walk, left and right jabs, an interact (checking kit, working a device).
//
// The clips are authored on a different skeleton, so they are not played on the
// soldiers' bones directly. Each frame of each clip is turned once, at load, into
// the procedural rig's own terms: pelvis, chest and head rotations, pelvis height
// and drift, thigh and shin directions, ankle flex and where each hand is relative
// to its shoulder. Any Humanoid (skinned or procedural) can then wear any clip,
// scaled to its own proportions.
import * as THREE from '../lib/three.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { MOVES_GLB } from '../assets/moves.js';

const FPS = 30;
const DOWN = new THREE.Vector3(0, -1, 0);
let CLIPS = null;
let loading = null;

export function preloadMoves() {
  if (loading) return loading;
  loading = new Promise((ok, no) => {
    const bin = Uint8Array.from(atob(MOVES_GLB), (c) => c.charCodeAt(0)).buffer;
    new GLTFLoader().parse(bin, '', ok, no);
  })
    .then((g) => { CLIPS = bake(g.scene, g.animations); })
    .catch((e) => console.warn('Soldier moves failed to load.', e));
  return loading;
}

export const movesReady = () => !!CLIPS;
export const moveInfo = (name) => CLIPS?.[name] ?? null;

// The clips face +Z; the soldiers face -Z: turn everything half a turn about Y.
const flipV = (v) => v.set(-v.x, v.y, -v.z);
const flipQ = (q) => q.set(-q.x, q.y, -q.z, q.w);

function bake(scene, animations) {
  const node = (n) => scene.getObjectByName(n);
  const N = ['pelvis', 'spine_03', 'head', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
    'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'];
  const nodes = Object.fromEntries(N.map((n) => [n, node(n)]));
  const read = () => {
    scene.updateMatrixWorld(true);
    const o = {};
    for (const n of N) {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      nodes[n].matrixWorld.decompose(p, q, s);
      o[n] = { p: flipV(p), q: flipQ(q) };
    }
    return o;
  };
  // Rest pose (no clip applied).
  const R = read();
  const len = (a, b) => R[a].p.distanceTo(R[b].p);
  const armLen = len('upperarm_r', 'lowerarm_r') + len('lowerarm_r', 'hand_r') + 0.06;
  const legLen = len('thigh_r', 'calf_r') + len('calf_r', 'foot_r');
  const restPelvis = R.pelvis.p.clone();
  const restInv = { pelvis: R.pelvis.q.clone().invert(), spine_03: R.spine_03.q.clone().invert(), head: R.head.q.clone().invert() };
  // Rest foot pitch relative to the shin.
  const footPitch = (P, side, qShin) => {
    const fd = P[`ball_${side}`].p.clone().sub(P[`foot_${side}`].p).normalize().applyQuaternion(qShin.clone().invert());
    return Math.atan2(fd.y, -fd.z);
  };
  const restShin = (side) => new THREE.Quaternion().setFromUnitVectors(DOWN, R[`foot_${side}`].p.clone().sub(R[`calf_${side}`].p).normalize());
  const restFoot = { l: footPitch(R, 'l', restShin('l')), r: footPitch(R, 'r', restShin('r')) };

  const out = {};
  const holder = new THREE.AnimationMixer(scene);
  for (const clip of animations) {
    holder.stopAllAction();
    const act = holder.clipAction(clip);
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.reset().play();
    const frames = [];
    const n = Math.max(2, Math.ceil(clip.duration * FPS) + 1);
    let p0 = null;
    for (let f = 0; f < n; f++) {
      holder.setTime(Math.min(clip.duration - 1e-3, f / FPS));
      const P = read();
      if (!p0) p0 = P.pelvis.p.clone();
      const Dp = P.pelvis.q.clone().multiply(restInv.pelvis);
      const Dc = P.spine_03.q.clone().multiply(restInv.spine_03);
      const Dh = P.head.q.clone().multiply(restInv.head);
      const hips = Dp.clone();
      const hipsInv = hips.clone().invert();
      const fr = {
        hips,
        torso: hipsInv.clone().multiply(Dc),
        head: Dc.clone().invert().multiply(Dh),
        y: P.pelvis.p.y / restPelvis.y,
        dx: (P.pelvis.p.x - p0.x) / legLen, dz: (P.pelvis.p.z - p0.z) / legLen,
        legs: {}, hands: {},
      };
      for (const [side, s] of [['r', 1], ['l', -1]]) {
        const d1 = P[`calf_${side}`].p.clone().sub(P[`thigh_${side}`].p).normalize().applyQuaternion(hipsInv);
        const thigh = new THREE.Quaternion().setFromUnitVectors(DOWN, d1);
        const toThigh = hips.clone().multiply(thigh).invert();
        const d2 = P[`foot_${side}`].p.clone().sub(P[`calf_${side}`].p).normalize().applyQuaternion(toThigh);
        const shin = new THREE.Quaternion().setFromUnitVectors(DOWN, d2);
        const shinWorld = hips.clone().multiply(thigh).multiply(shin);
        fr.legs[s] = { thigh, shin, ankle: footPitch(P, side, shinWorld) - restFoot[side] };
        const v = P[`hand_${side}`].p.clone().sub(P[`upperarm_${side}`].p).applyQuaternion(Dc.clone().invert()).divideScalar(armLen);
        fr.hands[s] = v;
      }
      frames.push(fr);
    }
    out[clip.name] = { name: clip.name, duration: clip.duration, frames };
  }
  holder.stopAllAction();
  return out;
}

const _qa = new THREE.Quaternion();
const lerpQ = (out, a, b, t) => out.copy(a).slerp(b, t);

/** Pose of `name` at time t (clamped, or wrapped when loop), interpolated between baked frames. */
export function samplePose(name, t, loop, out) {
  const c = CLIPS?.[name];
  if (!c) return null;
  const n = c.frames.length;
  let f = t * FPS;
  if (loop) f = ((f % (n - 1)) + (n - 1)) % (n - 1); else f = Math.min(Math.max(f, 0), n - 1);
  const i = Math.min(n - 2, Math.floor(f)), k = f - i;
  const A = c.frames[i], B = c.frames[i + 1];
  out ??= { hips: new THREE.Quaternion(), torso: new THREE.Quaternion(), head: new THREE.Quaternion(), legs: { 1: { thigh: new THREE.Quaternion(), shin: new THREE.Quaternion(), ankle: 0 }, [-1]: { thigh: new THREE.Quaternion(), shin: new THREE.Quaternion(), ankle: 0 } }, hands: { 1: new THREE.Vector3(), [-1]: new THREE.Vector3() }, y: 1, dx: 0, dz: 0 };
  lerpQ(out.hips, A.hips, B.hips, k);
  lerpQ(out.torso, A.torso, B.torso, k);
  lerpQ(out.head, A.head, B.head, k);
  out.y = A.y + (B.y - A.y) * k;
  out.dx = A.dx + (B.dx - A.dx) * k;
  out.dz = A.dz + (B.dz - A.dz) * k;
  for (const s of [1, -1]) {
    lerpQ(out.legs[s].thigh, A.legs[s].thigh, B.legs[s].thigh, k);
    lerpQ(out.legs[s].shin, A.legs[s].shin, B.legs[s].shin, k);
    out.legs[s].ankle = A.legs[s].ankle + (B.legs[s].ankle - A.legs[s].ankle) * k;
    out.hands[s].copy(A.hands[s]).lerp(B.hands[s], k);
  }
  return out;
}

void _qa;
