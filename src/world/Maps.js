// The five original battlegrounds. Each builder lays out geometry through MapBuilder
// and registers spawns, Domination flags and named points used by campaign scripts.
import * as THREE from '../lib/three.js';
import { dressMap } from './Dressing.js';

export const MAP_INFO = {
  desert: {
    name: 'Desert Outpost', short: 'DESERT OUTPOST', lighting: 'desert', weather: 'dust', ambience: ['wind'],
    blurb: 'Fortified compound in the Al-Rashid basin. Towers, hesco lines and a two-storey HQ at its heart.',
    location: 'Al-Rashid Basin', size: 'Large',
  },
  downtown: {
    name: 'Downtown', short: 'DOWNTOWN', lighting: 'overcast', weather: 'ash', ambience: ['city', 'wind'],
    blurb: 'Shattered financial district of Vel Harat. Close-quarters streets, gutted towers and rooftop lanes.',
    location: 'Vel Harat', size: 'Medium',
  },
  snowfall: {
    name: 'Snowfall', short: 'SNOWFALL', lighting: 'snow', weather: 'snow', ambience: ['wind'],
    blurb: 'Radar installation high in the Korvask range. Hangar, bunkers and treeline flanks in a whiteout.',
    location: 'Korvask Mountains', size: 'Large',
  },
  blacksite: {
    name: 'Blacksite', short: 'BLACKSITE', lighting: 'indoor', weather: 'none', ambience: ['hum'],
    blurb: 'Classified research facility sixty metres underground. Tight corridors around a central atrium.',
    location: 'Classified', size: 'Small',
  },
  harbor: {
    name: 'Harbor', short: 'HARBOR', lighting: 'night', weather: 'rain', ambience: ['rain', 'waves'],
    blurb: 'Port Kaval container terminal. Stacked lanes, warehouses and gantry cranes over black water.',
    location: 'Port Kaval', size: 'Large',
  },
};

export const MAP_IDS = Object.keys(MAP_INFO);

// ---------------------------------------------------------------------------

function desert(b) {
  b.ground('sand');
  b.setBounds(-70, 70, -70, 70);
  // Roads.
  b.patch(0, 0, 8, 140, 'dirt');
  b.patch(0, 0, 140, 6, 'dirt', 0.025);
  // Compound perimeter (hesco) with gates N/S and a breach E.
  const R = 30;
  b.hesco(-17, -R, 26, 'x', 2.1); b.hesco(17, -R, 26, 'x', 2.1);
  b.hesco(-17, R, 26, 'x', 2.1); b.hesco(17, R, 26, 'x', 2.1);
  b.hesco(-R, -15, 30, 'z', 2.1); b.hesco(-R, 15, 30, 'z', 2.1);
  b.hesco(R, -18, 24, 'z', 2.1); b.hesco(R, 20, 20, 'z', 2.1);
  // Gate posts / barriers.
  b.barrier(0, -R - 3, 3, 'x');
  b.barrier(-2, R + 3, 3, 'x');
  // HQ.
  b.building({ x: 0, z: 2, w: 14, d: 10, floors: 2, mat: 'plasterTan', floorMat: 'wood', roofAccess: true, doors: [{ side: 's', at: -3 }, { side: 'n', at: 3 }, { side: 'w', at: 2 }] });
  // Barracks & comms.
  b.building({ x: -18, z: 16, w: 12, d: 7, mat: 'plaster', doors: [{ side: 's', at: 0 }, { side: 'e', at: 1 }] });
  b.building({ x: 18, z: -16, w: 12, d: 7, mat: 'plaster', doors: [{ side: 'n', at: 0 }, { side: 'w', at: 1 }] });
  b.building({ x: 18, z: 16, w: 7, d: 7, mat: 'plasterTan', doors: [{ side: 's', at: 0 }, { side: 'w', at: 1.5 }] });
  b.box(20, 3.3, 17, 0.3, 9, 0.3, 'metalDark'); // antenna
  b.building({ x: -18, z: -16, w: 9, d: 8, mat: 'plaster', doors: [{ side: 'n', at: 0 }, { side: 'e', at: 1.5 }] });
  // Towers.
  b.tower(-25, -25); b.tower(25, -25); b.tower(-25, 25); b.tower(25, 25);
  // Courtyard cover.
  b.sandbags(-7, -9, 4, 'x'); b.sandbags(7, -10, 4, 'x');
  b.sandbags(-8, 12, 4, 'x'); b.sandbags(9, 11, 3, 'z');
  b.truck(-10, -20, 'x'); b.truck(8, 21, 'z', 'tan');
  b.crateStack(-4, -16); b.crateStack(10, -4, 2); b.crate(-10, 6); b.crate(-11.3, 6, 1.0);
  b.container(-20, 0, 4, 'z', 'contGreen'); b.container(23, 2, 0, 'z', 'contGrey');
  b.barrel(-6, -18, 'olive'); b.barrel(-5.3, -18.5, 'olive'); b.barrel(12, 8, 'steelBlue');
  b.hesco(-6, 22, 5, 'x', 1.4); b.hesco(6, -22, 6, 'x', 1.4);
  // Outside: tents (west), village ruins (east), rocks.
  b.tent(-45, -12, 6, 4, 'z'); b.tent(-45, 0, 6, 4, 'z'); b.tent(-45, 12, 6, 4, 'z');
  b.sandbags(-40, -20, 5, 'x'); b.sandbags(-40, 20, 5, 'x');
  b.building({ x: 48, z: -8, w: 8, d: 8, mat: 'plasterTan', ruined: true, doors: [{ side: 'w', at: 1.5 }, { side: 's', at: 0 }] });
  b.building({ x: 50, z: 14, w: 9, d: 7, mat: 'plaster', ruined: true, doors: [{ side: 'w', at: 0 }, { side: 'n', at: 1 }] });
  b.rubble(42, 4, 3); b.car(40, -22, 'z', 'carWhite', true); b.car(55, 30, 'x', 'carRed', true);
  for (const [x, z, s] of [[-30, -48, 3], [-55, -40, 4], [35, -45, 3.5], [55, -55, 3], [-55, 45, 4], [30, 50, 3], [-20, 55, 2.5], [60, 0, 3], [-60, 15, 3], [15, 45, 2.5], [-35, 38, 2.2], [40, 35, 2.4]]) b.rock(x, z, s, 'rock');
  b.sandbags(-15, -45, 6, 'x'); b.sandbags(12, -42, 6, 'x'); b.sandbags(-12, 45, 6, 'x'); b.sandbags(14, 44, 6, 'x');
  b.barrier(-30, -40, 4, 'z'); b.barrier(30, 40, 4, 'z');

  for (let i = -3; i <= 3; i++) b.spawn('a', i * 4, -60, Math.PI);
  for (let i = -3; i <= 3; i++) b.spawn('b', i * 4, 60, 0);
  for (const [x, z] of [[-50, -50], [50, -50], [-50, 50], [50, 50], [-45, 0], [55, 0], [0, -45], [0, 45], [-18, 16], [18, -16], [0, 2], [35, -30], [-35, 30], [20, 40], [-20, -40]]) b.spawn('ffa', x, z);
  b.dom('A', 0, -42); b.dom('B', -6, -12); b.dom('C', 0, 42);
  b.point('start', 0, -62); b.point('gate', 0, -32); b.point('hq', 0, 2); b.point('intel', -4, 2, 3.3);
  b.point('comms', 18, 16); b.point('village', 46, 2); b.point('exfil', -50, -50); b.point('lz', -45, 30);
  b.patrol('perimeter', [[-35, -35], [35, -35], [35, 35], [-35, 35]]);
  b.patrol('court', [[-8, -14], [8, -14], [8, 12], [-8, 12]]);
  b.patrol('village', [[42, -14], [56, -2], [44, 22]]);
  return MAP_INFO.desert;
}

// ---------------------------------------------------------------------------

function downtown(b) {
  b.ground('asphalt');
  b.setBounds(-62, 62, -62, 62);
  // Sidewalks along the avenue and cross street.
  for (const s of [-1, 1]) {
    b.box(0, 0, s * 8.5, 124, 0.15, 3, 'concrete', false);
    b.box(s * 8.5, 0, 0, 3, 0.15, 124, 'concrete', false);
  }
  // Plaza monument.
  b.box(0, 0, 0, 5, 0.6, 5, 'concreteDark');
  b.box(0, 0.6, 0, 1.6, 4, 1.6, 'concrete');
  b.box(0, 4.6, 0, 1.0, 1.2, 1.0, 'metalDark');
  // City blocks: four quadrants with towers and alleys.
  const q = (sx, sz) => {
    const bx = sx * 22, bz = sz * 22;
    b.building({ x: bx - sx * 6, z: bz - sz * 3, w: 16, d: 10, floors: 3, mat: sx > 0 ? 'brick' : 'concrete', floorMat: 'tiles', ruined: sx * sz < 0,
      doors: [{ side: sz > 0 ? 's' : 'n', at: -3 }, { side: sx > 0 ? 'w' : 'e', at: sz > 0 ? 2 : -2 }], roofAccess: sx * sz > 0 });
    b.building({ x: bx + sx * 14, z: bz + sz * 12, w: 12, d: 12, floors: 2, mat: sx > 0 ? 'concrete' : 'brickRed', floorMat: 'wood',
      doors: [{ side: sz > 0 ? 's' : 'n', at: 0 }, { side: sx > 0 ? 'w' : 'e', at: 3 }], ruined: sx * sz > 0 });
    b.building({ x: bx - sx * 8, z: bz + sz * 16, w: 10, d: 8, floors: 1, mat: 'plaster',
      doors: [{ side: sz > 0 ? 's' : 'n', at: 0 }, { side: sx > 0 ? 'e' : 'w', at: 0 }] });
    b.rubble(bx + sx * 6, bz - sz * 2, 2.5);
    b.crateStack(bx + sx * 4, bz + sz * 6, 2, 1.0);
  };
  q(1, 1); q(-1, 1); q(1, -1); q(-1, -1);
  // Street clutter.
  b.car(-30, -3, 'x', 'carRed', true); b.car(-14, 3.5, 'x', 'carBlue');
  b.car(20, -3.5, 'x', 'carWhite', true); b.car(38, 3, 'x', 'carRed');
  b.car(3.5, -30, 'z', 'carWhite'); b.car(-3, 24, 'z', 'carBlue', true); b.car(3, 44, 'z', 'carRed', true);
  // Bus.
  b.box(-44, 0.4, 3, 11, 2.6, 2.6, 'burnt'); b.world.add(-49.5, 0, 1.7, -38.5, 3, 4.3, 'metal');
  b.barrier(-24, 0, 4, 'z'); b.barrier(26, 0, 4, 'z'); b.barrier(0, -22, 4, 'x'); b.barrier(0, 26, 4, 'x');
  b.sandbags(-8, -5, 3, 'z'); b.sandbags(8, 5, 3, 'z'); b.sandbags(5, -8, 3, 'x'); b.sandbags(-5, 8, 3, 'x');
  b.rubble(-52, -5, 3); b.rubble(50, 5, 3); b.rubble(12, -50, 3); b.rubble(-12, 52, 3);
  b.container(46, 0, -20, 'z', 'contGrey');
  for (const [x, z] of [[-20, -9], [20, 9], [-20, 9], [20, -9], [9, 30], [-9, -30], [9, -45], [-9, 45]]) b.lamp(x, z, 6, false);
  b.light(0, 6, 0, 0xffc890, 40, 26);

  for (let i = -3; i <= 3; i++) b.spawn('a', -57, i * 2.5, -Math.PI / 2);
  for (let i = -3; i <= 3; i++) b.spawn('b', 57, i * 2.5, Math.PI / 2);
  for (const [x, z] of [[-50, -50], [50, -50], [-50, 50], [50, 50], [0, -55], [0, 55], [-30, 0], [30, 0], [0, 30], [0, -30], [-22, -22], [22, 22], [22, -22], [-22, 22]]) b.spawn('ffa', x, z);
  b.dom('A', -36, 0); b.dom('B', 0, 4); b.dom('C', 36, 0);
  b.point('start', -57, 0); b.point('plaza', 0, 0); b.point('tower', 16, 19, 6.6); b.point('east', 50, 0);
  b.point('ne', 30, 30); b.point('exfil', 0, 55); b.point('sw', -30, -30);
  b.patrol('avenue', [[-40, 0], [40, 0]]);
  b.patrol('cross', [[0, -40], [0, 40]]);
  return MAP_INFO.downtown;
}

// ---------------------------------------------------------------------------

function snowfall(b) {
  b.ground('snow');
  b.setBounds(-72, 72, -72, 72);
  // Mountain walls.
  b.cliff(-80, -80, 80, -72, 16, 'rockDark'); b.cliff(-80, 72, 80, 80, 16, 'rockDark');
  b.cliff(-80, -72, -72, 72, 16, 'rockDark'); b.cliff(72, -72, 80, 72, 16, 'rockDark');
  b.patch(0, 0, 10, 120, 'asphalt');
  // Hangar (big open structure).
  const hx = -22, hz = 10;
  b.box(hx, 0, hz - 9, 22, 8, 0.4, 'hangar');
  b.box(hx - 11, 0, hz, 0.4, 8, 18, 'hangar');
  b.box(hx + 11, 0, hz + 3, 0.4, 8, 12, 'hangar');
  b.box(hx, 8, hz, 23, 0.5, 18.6, 'hangar');
  b.truck(hx - 4, hz - 3, 'x', 'olive'); b.crateStack(hx + 4, hz + 2, 3); b.barrel(hx + 7, hz - 6, 'olive'); b.barrel(hx + 7.7, hz - 5.4, 'olive');
  b.box(hx - 6, 0, hz + 5, 4, 1.2, 2, 'metalDark');
  // Radar building with dome.
  b.building({ x: 22, z: 20, w: 12, d: 12, floors: 2, mat: 'concrete', floorMat: 'panel', roofAccess: true, doors: [{ side: 's', at: -2 }, { side: 'w', at: 3 }] });
  b.box(22 - 3, 6.6, 20 + 3, 0.6, 2.5, 0.6, 'metal');
  b.mesh(new THREE.SphereGeometry(3.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 'panel', 25, 6.6, 17);
  b.world.add(22.5, 6.6, 14.5, 27.5, 9.4, 19.5, 'metal');
  // Bunkers.
  b.building({ x: 25, z: -18, w: 10, d: 7, mat: 'concreteDark', windows: false, doors: [{ side: 'n', at: 0 }, { side: 'w', at: 1 }], roof: true });
  b.building({ x: -20, z: -24, w: 8, d: 8, mat: 'concreteDark', windows: true, doors: [{ side: 'e', at: 1.5 }, { side: 'n', at: 0 }] });
  b.building({ x: 0, z: 40, w: 14, d: 7, mat: 'woodDark', floorMat: 'wood', doors: [{ side: 's', at: 0 }, { side: 'e', at: 1 }] });
  // Fuel tanks.
  for (const [x, z] of [[45, -40], [52, -40], [45, -33]]) {
    b.mesh(new THREE.CylinderGeometry(2.6, 2.6, 6, 16), 'metal', x, 3, z);
    b.world.add(x - 2.6, 0, z - 2.6, x + 2.6, 6, z + 2.6, 'metal');
  }
  // Perimeter fences & sandbag positions.
  // Perimeter fences: a guarded gate in the middle and a cut gap in the wire on each flank.
  for (const fz of [-50, 55]) {
    for (const [a, c] of [[-40, -26.3], [-24.7, -3.6], [3.6, 24.7], [26.3, 40]]) b.fenceLine(a, fz, c, fz);
    for (const gx of [-3.6, 3.6]) b.box(gx, 0, fz, 0.3, 2.6, 0.3, 'metalDark'); // gate posts
    b.box(-3.4, 0, fz + (fz < 0 ? 1.8 : -1.8), 0.06, 2.2, 3.4, 'metalDark', false); // gate leaf swung open
    b.box(0, 2.4, fz, 7.2, 0.12, 0.12, 'hazard', false); // overhead sign bar
    for (const gx of [-25.5, 25.5]) {
      b.box(gx - 0.75, 0, fz, 0.1, 2.2, 0.1, 'metalDark', false);
      b.box(gx + 0.75, 0, fz, 0.1, 1.6, 0.1, 'metalDark', false, 0);
      b.debris(gx, fz + (fz < 0 ? -0.8 : 0.8), 3, 0.4);
    }
  }
  [[-25.5, -50], [25.5, -50], [0, -50], [-25.5, 55], [25.5, 55], [0, 55]].forEach(([gx, gz], i) => b.point(`fenceGap${i}`, gx, gz));
  b.box(-6.5, 0, -47, 2.2, 2.6, 2.2, 'concreteDark'); // gate booth
  b.box(-6.5, 2.6, -47, 2.6, 0.15, 2.6, 'metalDark', false);
  b.box(4.6, 1.0, -50.6, 0.15, 0.15, 3.6, 'hazard', false); // raised boom barrier
  b.sandbags(-6, -12, 4, 'x'); b.sandbags(6, -12, 4, 'x'); b.sandbags(0, 12, 5, 'x');
  b.sandbags(-40, 0, 4, 'z'); b.sandbags(42, 2, 4, 'z');
  b.barrier(-4, -35, 4, 'x'); b.barrier(5, 28, 4, 'x');
  b.container(-45, 0, -30, 'x', 'contBlue'); b.container(-45, 2.6, -30, 'x', 'contGrey');
  b.container(40, 0, 40, 'z', 'contRed');
  b.tower(-35, 40); b.tower(35, -55 + 5);
  // Treelines on the flanks.
  const r = b.rng;
  for (let i = 0; i < 70; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (48 + r() * 20), z = -65 + r() * 130;
    b.pine(x, z, 6 + r() * 5, true);
  }
  for (let i = 0; i < 18; i++) {
    const x = -40 + r() * 80, z = (r() < 0.5 ? -1 : 1) * (58 + r() * 10);
    b.pine(x, z, 6 + r() * 4, true);
  }
  for (const [x, z, s] of [[-55, -20, 3], [55, 15, 3.5], [10, -60, 3], [-15, 62, 3], [-30, -55, 2.5], [30, 60, 2.5]]) b.rock(x, z, s, 'rock');
  b.lamp(-8, 0, 6, true, 0xcfe0ff, 25); b.lamp(10, 26, 6, true, 0xcfe0ff, 25);

  for (let i = -3; i <= 3; i++) b.spawn('a', i * 4, -62, Math.PI);
  for (let i = -3; i <= 3; i++) b.spawn('b', i * 4, 64, 0);
  for (const [x, z] of [[-55, -55], [55, -55], [-55, 55], [55, 55], [-22, 10], [22, 20], [25, -18], [-20, -24], [0, 40], [0, 0], [45, 0], [-45, 15], [0, -40]]) b.spawn('ffa', x, z);
  b.dom('A', -20, 8); b.dom('B', 0, 0); b.dom('C', 24, -10);
  b.point('start', 0, -64); b.point('radar', 22, 20); b.point('radarRoof', 20, 21, 6.6); b.point('hangar', -22, 10);
  b.point('bunker', 25, -18); b.point('lodge', 0, 40); b.point('exfil', -50, 60); b.point('fuel', 45, -36);
  b.patrol('perimeter', [[-35, -45], [35, -45], [40, 45], [-38, 45]]);
  b.patrol('center', [[-10, -5], [12, -5], [12, 15], [-10, 15]]);
  return MAP_INFO.snowfall;
}


// ---------------------------------------------------------------------------

function blacksite(b) {
  b.ground('tiles');
  b.world.indoor = true;
  const S = 42;
  b.setBounds(-S, S, -S, S, 5, 'panelDark');
  const H = 4.6;
  // Ceiling (with a raised atrium in the middle).
  const A = 10; // atrium half size
  b.boxMinMax(-S, H, -S, S, H + 0.5, -A, 'panelDark');
  b.boxMinMax(-S, H, A, S, H + 0.5, S, 'panelDark');
  b.boxMinMax(-S, H, -A, -A, H + 0.5, A, 'panelDark');
  b.boxMinMax(A, H, -A, S, H + 0.5, A, 'panelDark');
  b.boxMinMax(-A, 10, -A, A, 10.5, A, 'panelDark');
  // Atrium rim above the corridors.
  b.boxMinMax(-A, H, -A - 0.3, A, 10, -A, 'panel');
  b.boxMinMax(-A, H, A, A, 10, A + 0.3, 'panel');
  b.boxMinMax(-A - 0.3, H, -A, -A, 10, A, 'panel');
  b.boxMinMax(A, H, -A, A + 0.3, 10, A, 'panel');
  // Rooms: [x0, z0, x1, z1, doors[{side, at}] ]
  const room = (x0, z0, x1, z1, doors, mat = 'panel') => {
    const t = 0.3;
    const ops = { n: [], s: [], e: [], w: [] };
    for (const d of doors) ops[d.side].push({ at: d.at, w: d.w ?? 2.2, bottom: 0, top: 2.8 });
    b.wall('x', x0, x1, z0 + t / 2, 0, H, t, mat, ops.s);
    b.wall('x', x0, x1, z1 - t / 2, 0, H, t, mat, ops.n);
    b.wall('z', z0 + t, z1 - t, x0 + t / 2, 0, H, t, mat, ops.w);
    b.wall('z', z0 + t, z1 - t, x1 - t / 2, 0, H, t, mat, ops.e);
    // Light strip.
    b.boxMinMax((x0 + x1) / 2 - 0.15, H - 0.06, z0 + 1, (x0 + x1) / 2 + 0.15, H, z1 - 1, 'lightPanel', false);
  };
  // NW server room.
  room(-38, 14, -16, 38, [{ side: 's', at: -24 }, { side: 'e', at: 26 }, { side: 's', at: -30 }]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    b.box(-33 + i * 4.5, 0, 22 + j * 8, 1.0, 2.4, 5, 'black');
    b.boxMinMax(-33 + i * 4.5 - 0.52, 0.4, 22 + j * 8 - 2.4, -33 + i * 4.5 - 0.5, 2.2, 22 + j * 8 + 2.4, 'screen', false);
  }
  // NE lab.
  room(16, 14, 38, 38, [{ side: 's', at: 22 }, { side: 'w', at: 26 }, { side: 's', at: 32 }]);
  b.table(22, 24); b.table(22, 30); b.table(30, 24); b.table(30, 30);
  b.box(34, 0, 34, 3, 2.2, 2, 'metal'); b.box(20, 0, 35.5, 4, 1.0, 1.5, 'metalDark');
  b.mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.5, 16, 1, true), 'glass', 26, 1.75, 27);
  // SW armory.
  room(-38, -38, -16, -14, [{ side: 'n', at: -24 }, { side: 'e', at: -26 }, { side: 'n', at: -32 }]);
  for (let i = 0; i < 3; i++) b.box(-34 + i * 6, 0, -30, 4, 2, 0.8, 'metalDark');
  b.crateStack(-24, -20, 3, 1.1); b.crate(-35, -20, 1.1, 0, 'olive');
  // SE control room.
  room(16, -38, 38, -14, [{ side: 'n', at: 22 }, { side: 'w', at: -26 }, { side: 'n', at: 32 }]);
  b.box(27, 0, -30, 12, 1.0, 1.4, 'black');
  b.boxMinMax(21.2, 1.0, -30.4, 32.8, 2.2, -30.3, 'screenBlue', false);
  b.box(22, 0, -20, 2, 1.1, 2, 'black'); b.box(32, 0, -20, 2, 1.1, 2, 'black');
  // Containment cells (north centre).
  room(-12, 22, 12, 38, [{ side: 's', at: 0, w: 3 }]);
  for (let i = -1; i <= 1; i++) {
    b.box(i * 7, 0, 33, 0.3, H, 9.4, 'panel');
  }
  for (let i = 0; i < 4; i++) b.boxMinMax(-10.5 + i * 7 - 3, 0, 28.2, -10.5 + i * 7 - 0.5, H, 28.4, 'metalDark', true);
  // South maintenance hall.
  room(-12, -38, 12, -22, [{ side: 'n', at: -6 }, { side: 'n', at: 6 }]);
  b.box(-6, 0, -32, 3, 3, 3, 'metal'); b.box(6, 0, -32, 3, 3, 3, 'metal');
  b.mesh(new THREE.CylinderGeometry(0.4, 0.4, 24, 10), 'metalDark', 0, 3.8, -36, 0, 0, Math.PI / 2);
  // Atrium centrepiece: the reactor plinth + cover.
  b.box(0, 0, 0, 4, 1.2, 4, 'metalDark');
  b.mesh(new THREE.CylinderGeometry(0.9, 1.3, 5.5, 16), 'panel', 0, 1.2 + 2.75, 0);
  b.mesh(new THREE.CylinderGeometry(0.6, 0.6, 4, 16), 'lightPanel', 0, 6, 0);
  b.world.add(-1.3, 1.2, -1.3, 1.3, 7, 1.3, 'metal');
  b.box(-6, 0, -6, 2.4, 1.1, 0.6, 'metal'); b.box(6, 0, 6, 2.4, 1.1, 0.6, 'metal');
  b.box(-6, 0, 6, 0.6, 1.1, 2.4, 'metal'); b.box(6, 0, -6, 0.6, 1.1, 2.4, 'metal');
  // Corridor clutter.
  b.crate(-13, 0, 1.0, 0, 'olive'); b.crate(13.5, 4, 1.0, 0, 'olive'); b.box(0, 0, 16, 3, 1.1, 0.8, 'metalDark');
  b.box(-26, 0, 2, 0.8, 1.2, 3, 'metalDark'); b.box(26, 0, -2, 0.8, 1.2, 3, 'metalDark');
  b.box(-36, 0, 0, 0.8, 1.2, 3.4, 'metalDark'); b.crateStack(-33, -7, 2, 1.1); b.crateStack(-33, 7, 2, 1.1); // west-end cover
  b.box(36, 0, 0, 0.8, 1.2, 3.4, 'metalDark');
  b.box(0, 0, -16, 3, 1.1, 0.8, 'metalDark');
  b.boxMinMax(-40, 0.5, -0.3, -40 + 0.1, 3, 0.3, 'hazard', false);
  // Hazard bands on the floor at junctions.
  for (const [x, z] of [[-12, 0], [12, 0], [0, -12], [0, 12]]) b.patch(x, z, 2.6, 2.6, 'hazard', 0.025);
  // Lights.
  b.light(0, 8, 0, 0xbfe0ff, 60, 28);
  b.light(-27, 4, 26, 0x66ffaa, 18, 16); b.light(27, 4, 26, 0xdde8ff, 22, 16);
  b.light(-27, 4, -26, 0xffd0a0, 18, 16); b.light(27, 4, -26, 0x88bbff, 20, 16);
  b.light(-28, 4, 0, 0xff4040, 14, 14); b.light(28, 4, 0, 0xdde8ff, 14, 14); b.light(0, 4, -30, 0xffc080, 16, 14);
  for (const [x, z] of [[-28, 0], [28, 0], [0, -28], [0, 28]]) b.boxMinMax(x - 0.15, H - 0.06, z - 3, x + 0.15, H, z + 3, x < 0 && z === 0 ? 'lightRed' : 'lightPanel', false);

  for (let i = -2; i <= 2; i++) b.spawn('a', -39, -2 + i * 1.6 + 0.1, -Math.PI / 2);
  for (let i = -2; i <= 2; i++) b.spawn('b', 39, i * 1.6, Math.PI / 2);
  for (const [x, z] of [[-27, 30], [27, 30], [-27, -26], [27, -26], [0, 30], [0, -30], [-36, 0], [36, 0], [-14, 10], [14, -10], [0, 18]]) b.spawn('ffa', x, z);
  b.dom('A', -27, 26); b.dom('B', 0, 6); b.dom('C', 27, -26);
  b.point('start', -39, 0); b.point('servers', -27, 26); b.point('lab', 27, 26); b.point('control', 27, -26);
  b.point('armory', -27, -26); b.point('atrium', 0, 6); b.point('cells', 0, 30); b.point('exfil', 38, 0);
  b.patrol('ring', [[-14, -14], [14, -14], [14, 14], [-14, 14]]);
  return MAP_INFO.blacksite;
}

// ---------------------------------------------------------------------------

function harbor(b) {
  b.ground('concrete');
  b.setBounds(-72, 72, -66, 46);
  // Quay edge + water.
  b.box(0, 0, 46.5, 160, 0.6, 1, 'concreteDark', false);
  for (let x = -66; x <= 66; x += 8) b.box(x, 0.6, 45.6, 0.5, 0.5, 0.5, 'metalDark', false);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshStandardMaterial({ color: 0x0d1d26, roughness: 0.15, metalness: 0.7 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.2, 147);
  b.root.add(water);
  // Cargo ship moored at the quay (visual mass).
  b.box(0, -1, 58, 120, 12, 18, 'steelBlue', false);
  b.box(-40, 11, 58, 14, 10, 14, 'carWhite', false);
  for (let i = 0; i < 8; i++) b.container(-20 + i * 7, 11, 55 + (i % 2) * 3, 'z', ['contRed', 'contBlue', 'contGreen', 'contOrange'][i % 4]);
  b.patch(0, 30, 140, 10, 'asphalt');
  b.patch(-8, -10, 8, 110, 'asphalt');
  // Gantry cranes over the quay.
  b.crane(-30, 40, 'z'); b.crane(25, 40, 'z');
  // Container yard: lanes of stacks.
  const colors = ['contRed', 'contBlue', 'contGreen', 'contOrange', 'contGrey'];
  const r = b.rng;
  for (let row = 0; row < 4; row++) {
    const z = 18 - row * 9;
    for (let col = 0; col < 6; col++) {
      const x = 8 + col * 8;
      if ((row === 1 && col === 2) || (row === 2 && col === 4)) continue; // open pockets
      const h = 1 + Math.floor(r() * 3);
      for (let k = 0; k < h; k++) b.container(x, k * 2.6, z, 'x', colors[Math.floor(r() * colors.length)]);
    }
  }
  for (let row = 0; row < 3; row++) {
    const x = -24 - row * 9;
    for (let col = 0; col < 3; col++) {
      const z = 18 - col * 9;
      if (row === 1 && col === 1) continue;
      const h = 1 + Math.floor(r() * 2);
      for (let k = 0; k < h; k++) b.container(x, k * 2.6, z, 'z', colors[Math.floor(r() * colors.length)]);
    }
  }
  // Warehouses (south).
  b.building({ x: -30, z: -40, w: 24, d: 14, floors: 1, fh: 7, mat: 'hangar', floorMat: 'concrete', windowSpacing: 5,
    doors: [{ side: 'n', at: -6, w: 4 }, { side: 'n', at: 6, w: 4 }, { side: 'e', at: 2, w: 3 }, { side: 's', at: 0, w: 3 }], stairs: false, props: false });
  b.crateStack(-36, -42, 3); b.crateStack(-24, -38, 3); b.container(-30, 0, -44, 'x', 'contGrey'); b.box(-40, 0, -36, 2, 1.6, 1.2, 'metalDark');
  b.building({ x: 28, z: -42, w: 22, d: 14, floors: 1, fh: 7, mat: 'hangar', floorMat: 'concrete', windowSpacing: 5,
    doors: [{ side: 'n', at: 4, w: 4 }, { side: 'w', at: 0, w: 3 }, { side: 's', at: -4, w: 3 }], stairs: false, props: false });
  b.crateStack(22, -44, 3); b.crateStack(33, -40, 2); b.truck(30, -46, 'x', 'contBlue');
  // Port office (2 floors with roof).
  b.building({ x: 0, z: -22, w: 12, d: 9, floors: 2, mat: 'brick', floorMat: 'tiles', roofAccess: true, doors: [{ side: 'n', at: 2 }, { side: 'w', at: 2 }] });
  // Yard clutter.
  b.truck(-6, 30, 'x', 'contRed'); b.truck(40, 30, 'x', 'olive');
  b.barrel(-12, 24, 'contOrange'); b.barrel(-12.6, 24.5, 'contOrange'); b.barrel(-11.6, 25, 'contOrange');
  b.crateStack(-8, 8, 2); b.crateStack(-2, -4, 2); b.barrier(-8, -55, 4, 'x'); b.barrier(10, -56, 4, 'x');
  b.box(55, 0, 0, 2.2, 2.2, 3.5, 'contOrange'); // forklift-ish
  b.sandbags(-14, -8, 4, 'z'); b.sandbags(62, 18, 4, 'z'); b.sandbags(-62, 0, 5, 'z');
  for (const [x, z] of [[-50, 28], [-20, 28], [10, 28], [40, 28], [60, -20], [-60, -20], [0, -50]]) b.lamp(x, z, 7, true, 0xffc880, 28);

  for (let i = -3; i <= 3; i++) b.spawn('a', -66, i * 4 + 4, -Math.PI / 2);
  for (let i = -3; i <= 3; i++) b.spawn('b', 66, i * 4 - 4, Math.PI / 2);
  for (const [x, z] of [[-60, 30], [60, 30], [-55, -55], [55, -55], [-30, -40], [28, -42], [0, -22], [20, 5], [-24, 4], [0, 35], [-45, 10], [45, -10], [0, 0]]) b.spawn('ffa', x, z);
  b.dom('A', -30, -36); b.dom('B', 24, 9); b.dom('C', 0, 36);
  b.point('start', -66, -30); b.point('office', 0, -22); b.point('officeTop', -2, -22, 3.3); b.point('yard', 24, 9);
  b.point('warehouseW', -30, -40); b.point('warehouseE', 28, -42); b.point('quay', 0, 38); b.point('shipCrane', 25, 38);
  b.point('exfil', -66, 38);
  b.patrol('quay', [[-50, 36], [50, 36]]);
  b.patrol('yard', [[4, 22], [52, 22], [52, -10], [4, -10]]);
  b.patrol('south', [[-45, -28], [45, -28]]);
  return MAP_INFO.harbor;
}

const BUILDERS = { desert, downtown, snowfall, blacksite, harbor };

export function buildMap(id, builder) {
  const info = BUILDERS[id](builder);
  dressMap(id, builder);
  builder.finalize();
  return info;
}
