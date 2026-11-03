// First-person hands for objective work: where each hand goes, how it is turned
// and which tool it holds, for every kind of action (typing on a laptop, pressing
// a charge or tracker onto a surface, cutting a hostage's ties, zip-tying a
// prisoner, splicing wires, pulling a drive or the core, dragging a man out).
//
// Hand orientation is given by two world directions: where the fingers point and
// where the thumb points (the palm side follows from those).
import * as THREE from '../lib/three.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const _X = V(), _Y = V(), _Z = V(), _m = new THREE.Matrix4();
/** World rotation for a hand whose fingers point along f and thumb along th. */
export function handQuat(f, th) {
  _Y.copy(f).normalize().negate();
  _Z.copy(th).normalize().negate();
  _Z.addScaledVector(_Y, -_Z.dot(_Y)).normalize();
  _X.crossVectors(_Y, _Z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z));
}

/**
 * Tools held in the right hand, in the hand's frame (thumb along -Z, the hand
 * model is drawn 1.3x, so sizes are divided by that).
 */
export function buildTools(hand) {
  const s = 1 / 1.3;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.25, metalness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.7, metalness: 0.1 });
  const at = hand.fistPoint;
  const palm = hand.palm;
  const mk = (build) => { const g = new THREE.Group(); build(g); g.position.copy(at); g.visible = false; hand.hold(g); return g; };
  const bx = (g, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), m); b.position.set(x * s, y * s, z * s); g.add(b); return b; };
  return {
    // Fixed-blade knife, blade out past the thumb.
    knife: mk((g) => {
      bx(g, 0.024, 0.028, 0.11, black, 0, 0, 0.01);
      bx(g, 0.04, 0.034, 0.008, black, 0, 0, -0.05);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.0035 * s, 0.026 * s, 0.11 * s), steel);
      blade.position.set(0, 0.002 * s, -0.11 * s);
      g.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.013 * s, 0.03 * s, 4), steel);
      tip.rotation.x = -Math.PI / 2;
      tip.scale.set(0.15, 1, 1);
      tip.position.set(0, 0.002 * s, -0.18 * s);
      g.add(tip);
    }),
    // Wire cutters: rubber handles in the fist, steel jaws forward.
    cutters: mk((g) => {
      const red = new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.6, metalness: 0 });
      bx(g, 0.016, 0.03, 0.11, red, 0, 0, 0.015);
      bx(g, 0.018, 0.022, 0.045, steel, 0, 0, -0.06);
      bx(g, 0.012, 0.012, 0.02, steel, 0, 0.006, -0.09);
    }),
    // Breaching charge and tracker, held flat in the palm.
    c4: mk((g) => {
      const putty = new THREE.MeshStandardMaterial({ color: 0xcfc6a2, roughness: 0.9, metalness: 0 });
      const b = bx(g, 0.05, 0.11, 0.2, putty, 0, 0, 0);
      b.position.addScaledVector(palm, 0.035);
      const d = bx(g, 0.03, 0.035, 0.05, black, 0, 0, 0);
      d.position.addScaledVector(palm, 0.065);
    }),
    tracker: mk((g) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.048 * s, 0.022 * s, 18), black);
      c.quaternion.setFromUnitVectors(UP, palm);
      c.position.copy(palm).multiplyScalar(0.03);
      g.add(c);
    }),
    // Lock picks: a rake and a hook, out past the pinch.
    picks: mk((g) => {
      bx(g, 0.0025, 0.004, 0.11, steel, 0, 0, -0.06);
      const hook = bx(g, 0.0025, 0.004, 0.1, steel, 0.008, -0.004, -0.055);
      hook.rotation.y = 0.12;
    }),
    // Zip-tie strap, tail pinched between thumb and finger.
    zip: mk((g) => { bx(g, 0.004, 0.012, 0.2, black, 0, 0, -0.08); }),
  };
}

/**
 * act: { kind, work, n, k, t } (world space). Returns world positions (where
 * each fist centre goes), rotations, poses and the tool in the right hand.
 */
export function actionHands(act) {
  const W = act.work, n = act.n, t = act.t, k = act.k ?? 0;
  const R = V(n.z, 0, -n.x); // operator's right, facing the work
  const into = n.clone().negate();
  const P = (...terms) => { const p = W.clone(); for (let i = 0; i < terms.length; i += 2) p.addScaledVector(terms[i], terms[i + 1]); return p; };
  const hand = (pos, f, th, pose) => ({ pos, quat: handQuat(f, th), pose });
  let left, right, tool = null;
  switch (act.kind) {
    case 'hack': {
      // Typing: palms down over the keys, alternating taps.
      const f = into.clone().addScaledVector(DOWN, 0.55);
      const tapL = Math.max(0, Math.sin(t * 17)) * 0.012, tapR = Math.max(0, Math.sin(t * 17 + 2.1)) * 0.012;
      left = hand(P(R, -0.085, n, 0.04, UP, 0.035 - tapL), f, R, 'type');
      right = hand(P(R, 0.085, n, 0.04, UP, 0.035 - tapR), f, R.clone().negate(), 'type');
      break;
    }
    case 'c4':
    case 'tracker': {
      // Reach in with the device, press it on, arm it, take the hand away.
      const reach = smooth(clamp01(k / 0.42)), away = smooth(clamp01((k - 0.8) / 0.2));
      const press = k > 0.42 && k < 0.8 ? Math.max(0, Math.sin(t * 9)) * 0.008 : 0;
      const start = P(n, 0.3, DOWN, 0.14, R, 0.06), hold = P(n, 0.05 - press, R, 0.01), end = P(n, 0.24, DOWN, 0.1, R, 0.09);
      const pos = away > 0 ? hold.clone().lerp(end, away) : start.clone().lerp(hold, reach);
      const holding = k < 0.46;
      right = hand(pos, UP.clone().addScaledVector(into, 0.35), R.clone().negate(), holding ? 'fist' : 'open');
      left = hand(P(R, -0.17, n, 0.035, UP, 0.06), UP.clone().addScaledVector(into, 0.2), R, 'open');
      tool = holding ? act.kind : null;
      break;
    }
    case 'cut': {
      // Hold the bound wrists, saw through the tie with the knife.
      const saw = Math.sin(t * 11) * 0.03;
      left = hand(P(R, -0.07, n, 0.05, UP, 0.01), DOWN.clone().addScaledVector(into, 0.2), into, 'fist');
      right = hand(P(R, 0.07 + saw, n, 0.07, UP, 0.03), DOWN.clone().addScaledVector(n, 0.25), R.clone().negate().addScaledVector(into, 0.5), 'fist');
      tool = 'knife';
      break;
    }
    case 'detain': {
      // Pin the wrists, loop the zip tie, then cinch it with a pull.
      const cinch = smooth(clamp01((k - 0.5) / 0.35));
      left = hand(P(R, -0.06, n, 0.05, UP, 0.02), DOWN.clone().addScaledVector(into, 0.25), into, 'fist');
      right = hand(P(R, 0.04 + 0.13 * cinch, n, 0.07, UP, 0.01 + Math.sin(t * 8) * 0.008 * (1 - cinch)), into.clone().addScaledVector(DOWN, 0.4), UP, 'pinch');
      tool = k > 0.2 ? 'zip' : null;
      break;
    }
    case 'lockpick': {
      // Tension wrench in the left hand, rake working the pins with the right.
      const rake = Math.sin(t * 13) * 0.006 + Math.sin(t * 5.3) * 0.004;
      left = hand(P(R, -0.035, n, 0.07, UP, -0.02), DOWN.clone().addScaledVector(into, 0.3), into, 'pinch');
      right = hand(P(R, 0.03, n, 0.09, UP, 0.01 + rake), DOWN.clone().addScaledVector(R, 0.3), into, 'pinch');
      tool = 'picks';
      break;
    }
    case 'splice': {
      // Hold the wire with one hand, strip and twist with the cutters.
      const tw = Math.sin(t * 7) * 0.35;
      left = hand(P(R, -0.06, n, 0.08, UP, 0.03), into, UP, 'pinch');
      right = hand(P(R, 0.05, n, 0.09, UP, -0.01), DOWN.clone().addScaledVector(into, 0.4).addScaledVector(R, tw * 0.3), into.clone().addScaledVector(UP, tw), 'fist');
      tool = 'cutters';
      break;
    }
    case 'drive':
    case 'core': {
      // Grip it and pull it free (the prop's work point moves with the item).
      if (act.kind === 'drive') {
        right = hand(P(n, 0.03, R, 0.01), into.clone().addScaledVector(DOWN, 0.15), UP, 'fist');
        left = hand(P(R, -0.22, UP, 0.02, n, -0.05), UP.clone().addScaledVector(into, 0.25), R, 'open');
      } else {
        right = hand(P(R, 0.075, n, 0.01), R.clone().negate(), UP, 'fist');
        left = hand(P(R, -0.075, n, 0.01), R, UP, 'fist');
      }
      break;
    }
    case 'rescue': {
      // Fists in his vest straps, hauling him back in heaves.
      const heave = 0.5 + 0.5 * Math.sin(t * 3.2);
      left = hand(P(R, -0.12, n, 0.05 + 0.06 * heave), DOWN.clone().addScaledVector(into, 0.3), into, 'fist');
      right = hand(P(R, 0.12, n, 0.05 + 0.06 * heave), DOWN.clone().addScaledVector(into, 0.3), into, 'fist');
      break;
    }
    default: {
      left = hand(P(R, -0.1, n, 0.05), into, R, 'open');
      right = hand(P(R, 0.1, n, 0.05), into, R.clone().negate(), 'open');
    }
  }
  return { left, right, tool };
}
