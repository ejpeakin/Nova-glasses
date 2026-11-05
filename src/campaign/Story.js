// FIELD OF HONOR: US ARMY SPECIAL FORCES — campaign script.
//
// The story in one breath: HALCYON is a ring of US satellites that can drop steel
// rods from orbit onto any target on Earth. To fire it you need three things: the
// HALCYON KEY (a suitcase-sized control unit), the LAUNCH CODES (known only to the
// engineer who built it, Dr. Lena Hart) and an UPLINK DISH that can reach the
// satellites. The private army MERIDIAN steals the key; Task Force ORION takes the
// other two pieces away from them one by one, then gets the key back.
//
// Every mission has: summary (one line, menu), recap ("the story so far"), goal
// ("your job"), briefing (radio lines), and an outro that leads into the next one.
//
// Units: [x, z] or [x, y, z] map positions; groups spawn at mission start unless
// spawnOn is set to an objective id (spawned when that objective begins).

export const CHARACTERS = {
  COLE: { name: 'Sgt. Elias "Wraith" Cole', role: 'You — Task Force ORION pointman' },
  REYES: { name: 'Capt. Mara Reyes', role: 'ORION team leader' },
  HATCH: { name: 'Sgt. Dmitri "Hatch" Sorokin', role: 'Breacher, demolitions' },
  TEX: { name: 'Cpl. Jonah "Tex" Hale', role: 'Marksman, signals' },
  WATCHTOWER: { name: 'Col. Ade Okafor — "Watchtower"', role: 'Mission control' },
  HART: { name: 'Dr. Lena Hart', role: 'Engineer who built HALCYON' },
  VASKO: { name: 'Anton Vasko', role: 'Founder of MERIDIAN' },
  KESSLER: { name: 'Kessler "The Butcher" Grau', role: 'MERIDIAN field commander' },
  BRANDT: { name: 'Oskar Brandt', role: 'Arms dealer, HALCYON\'s would-be buyer' },
};

export const PROLOGUE = [
  'HALCYON is a ring of American satellites that can drop steel rods from orbit onto any target on Earth. No warning. No defence.',
  'It only obeys one thing: the HALCYON KEY, a control unit the size of a suitcase. With the launch codes and a big enough dish, whoever holds it can strike any city.',
  'Eleven days ago, the convoy carrying the key was ambushed. Forty-one soldiers and engineers died. The key vanished, and so did the engineer who built it, Dr. Lena Hart.',
  'The attackers were MERIDIAN: a private army of former special forces, run by a man named Anton Vasko who wants to sell HALCYON\'s power to the highest bidder.',
  'Task Force ORION has been activated: four US Army Special Forces operators who officially do not exist. Find the key. Stop MERIDIAN. Bring Vasko in.',
  'You are Sergeant Elias "Wraith" Cole.',
  'FIELD OF HONOR: US ARMY SPECIAL FORCES.',
];

// Squad weapons: everyone on the backup team carries the RK-74 (the AK-47 pattern rifle).
const SQUAD_RH = [
  { name: 'Reyes', weapon: 'rk74' },
  { name: 'Hatch', weapon: 'rk74' },
];
const SQUAD_FULL = [
  { name: 'Reyes', weapon: 'rk74' },
  { name: 'Hatch', weapon: 'rk74' },
  { name: 'Tex', weapon: 'rk74' },
];

export const MISSIONS = [
  // ------------------------------------------------------------------ 1
  {
    id: 'm1', title: 'Black Water', map: 'harbor', lighting: 'night', weather: 'rain',
    location: 'PORT KAVAL — BLACK SEA COAST', time: 'DAY 1 — 02:14 LOCAL',
    summary: 'Find the stolen HALCYON key. Sneak into the harbor alone, steal the shipping records and put a tracker on the container carrying it.',
    recap: 'MERIDIAN stole the HALCYON key eleven days ago. Tonight they are smuggling something heavy through the harbor at Port Kaval.',
    goal: 'Go in alone and unseen. Find out which container holds the key, and tag it with a tracker so we can follow it.',
    loadout: { primary: 'wasp', secondary: 'p11', lethal: 'frag', tactical: 'flash', attachments: { wasp: { muzzle: 'suppressor', optic: 'reflex' }, p11: { muzzle: 'suppressor' } } },
    loadoutNote: 'Spy kit: rappel rope (T at a roof edge). A suppressed SR-7 is cached on the west warehouse roof.',
    start: { pos: [-64, 10], yaw: -0.6 },
    squad: [],
    stealth: true,
    alarmGroup: 'response',
    caches: [{ weapon: 'specter', pos: [-27, 7, -37], attachments: { muzzle: 'suppressor', optic: 'sniper8' } }],
    // Exterior fire stairs up the west warehouse's west wall to its roof.
    build(b) {
      const n = 26, rise = 7.5 / n, run = 0.45;
      for (let i = 0; i < n; i++) b.box(-42.95, 0, -33.2 - i * run, 1.3, (i + 1) * rise, run, 'metalDark');
      b.box(-42.95, 0, -33.2 - n * run - 0.4, 1.3, 7.5, 1.2, 'metalDark'); // top landing, level with the parapet
      for (let i = 0; i < n; i += 3) {
        b.box(-43.62, (i + 1) * rise, -33.2 - i * run, 0.05, 1.0, 0.05, 'metal', false); // railing posts
        b.box(-43.62, (i + 1) * rise + 0.95, -33.2 - (i + 1.5) * run, 0.05, 0.05, run * 3, 'metal', false); // rail
      }
    },
    briefing: [
      { who: 'WATCHTOWER', text: 'Wraith, Watchtower. MERIDIAN is moving something heavy through Port Kaval tonight. We think it is the HALCYON key.' },
      { who: 'WATCHTOWER', text: 'The harbor office has the shipping records. They will tell us which container it is in. Then you tag that container so we can follow it.' },
      { who: 'WATCHTOWER', text: 'You go in alone. No squad, no air, no flag. If you are caught, ORION was never here.' },
      { who: 'REYES', text: 'I\'ll be on the boat with eyes on your feed. Stay off the ground. Rooftops are yours.' },
    ],
    groups: {
      south: { units: [{ pos: [-30, -28], patrol: 'south' }, { pos: [20, -28], patrol: 'south' }] },
      wh: { units: [{ pos: [-36, -38] }, { pos: [-26, -42] }, { pos: [-22, -36] }] },
      office: { units: [{ pos: [-3, -21] }, { pos: [3, -24] }] },
      officeRoof: { units: [{ pos: [-1, 6.6, -22], stationary: true, weapon: 'hx30' }] },
      yard: { units: [{ pos: [10, 22], patrol: 'yard' }, { pos: [24, 9] }, { pos: [32, -2] }] },
      quay: { units: [{ pos: [-10, 38], patrol: 'quay' }, { pos: [12, 36] }, { pos: [30, 38] }, { pos: [36, 34] }] },
      response: { spawnOn: 'alarm', hunter: true, units: [{ pos: [60, -12], weapon: 'rk74' }, { pos: [62, -4] }, { pos: [60, 4], weapon: 'breaker' }, { pos: [58, 12] }, { pos: [56, -20], weapon: 'rk74' }] },
    },
    objectives: [
      { type: 'goto', text: 'Climb the fire stairs onto the west warehouse roof', target: [-30, 7, -40], radius: 11, minY: 6, hints: [[-42.9, -34, 'STAIRS']],
        say: [{ who: 'REYES', text: 'Patrol on the south road. Stay in the shadows. Fire stairs on the warehouse\'s west wall will get you up top.' }] },
      { type: 'cutscene', shots: [
        { orbit: [0, 3.5, -22], radius: 17, height: 7, a0: -0.7, a1: 0.35, dur: 4.5,
          say: [{ who: 'WATCHTOWER', text: 'Harbor master\'s office. The manifest is on the ground-floor terminal. Two guards inside.' }] },
        { from: [-28, 8.6, -38.5], to: [-27.5, 8.4, -37.5], look: [-1, 7.4, -22], dur: 3.5,
          say: [{ who: 'REYES', text: 'Shooter on the office roof. A friend left you a rifle up there. Suppressed. Use it.' }] },
      ] },
      { type: 'eliminate', text: 'Take out the rooftop shooter from the warehouse', groups: ['officeRoof'],
        say: [{ who: 'REYES', text: 'Rifle\'s by the roof edge. Aim at him to tag him, then one quiet shot.' }] },
      { type: 'goto', text: 'Rappel down the east wall and get to the office', target: [-8.5, -20], radius: 3.5,
        say: [{ who: 'REYES', text: 'Clear. Rope\'s on your rig. Walk to the east edge of the roof, press T and go down the wall.' }] },
      { type: 'interact', text: 'Get inside and download the shipping manifest', target: [-3, 0, -20], label: 'download the shipping manifest', duration: 4,
        say: [{ who: 'REYES', text: 'West door. Two inside. Take them from behind with V. No noise.' }],
        doneSay: [{ who: 'WATCHTOWER', text: 'Manifest received. Container K-77, berth two... Wraith, you tripped a silent alarm.' }],
        onComplete: ['alarm'] },
      { type: 'cutscene', shots: [
        { from: [46, 5, -16], to: [44, 4, -8], look: [60, 1.2, -4], dur: 3.5,
          say: [{ who: 'WATCHTOWER', text: 'Response team at the east gate. Five, maybe more, coming in fast.' }] },
        { orbit: [0, 2.5, -22], radius: 13, height: 4, a0: 1.2, a1: 2.0, dur: 3,
          say: [{ who: 'REYES', text: 'They\'re coming to you. Get high, pick your shots, and keep moving.' }] },
      ] },
      { type: 'eliminate', text: 'Survive the response team', groups: ['response', 'office'],
        say: [{ who: 'REYES', text: 'Hold the office. They have to cross open ground to reach you. Make them pay for it.' }] },
      { type: 'interact', text: 'Plant the tracker on container K-77', target: [24, 0, 34], label: 'plant the tracker', duration: 3,
        say: [{ who: 'REYES', text: 'K-77 is under the east crane. Tag it and we are gone.' }] },
      { type: 'cutscene', shots: [
        { orbit: [25, 6, 38], radius: 20, height: 9, a0: 2.6, a1: 3.4, dur: 4.5,
          say: [{ who: 'WATCHTOWER', text: 'Tracker is live. K-77 is moving. Good work, Wraith.' }] },
        { from: [-50, 2.2, 30], to: [-58, 1.8, 36], look: [-66, 1, 40], dur: 3,
          say: [{ who: 'REYES', text: 'Boat\'s at the west quay. Lights off. Come home.' }] },
      ] },
      { type: 'extract', text: 'Reach the boat at the west quay', target: [-62, 38], radius: 6 },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'K-77 was flown inland to a MERIDIAN outpost in the Al-Rashid desert. Satellite photos show Dr. Lena Hart there, alive, under guard.' },
      { who: 'REYES', text: 'The key is useless without her launch codes. If we get Hart back, they can never fire it. We go in at first light.' },
    ],
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'm2', title: 'Dust Devil', map: 'desert', lighting: 'desert', weather: 'dust',
    location: 'AL-RASHID BASIN', time: 'DAY 3 — 14:40 LOCAL',
    summary: 'Rescue Dr. Lena Hart, the engineer who knows the launch codes, from a fortified MERIDIAN outpost in the desert.',
    recap: 'The tracker led to a MERIDIAN outpost in the Al-Rashid desert. Dr. Lena Hart, who built HALCYON and knows its launch codes, is held there.',
    goal: 'Fly in with the squad, storm the compound, cut Hart free and hold out until the helicopter can take her home.',
    loadout: { primary: 'vx4', secondary: 'p11', lethal: 'frag', tactical: 'smoke', attachments: { vx4: { optic: 'holo', underbarrel: 'vgrip' } } },
    start: { pos: [-60, -62], yaw: Math.PI },
    squad: SQUAD_FULL,
    insertion: { lz: [-60, -63], from: [-0.4, -1], hover: 13,
      lines: { approach: { who: 'PILOT', text: 'Thirty seconds! Compound is hot, expect fire from the towers!' }, ropes: { who: 'REYES', text: 'Ropes! Go, go, go!' } } },
    briefing: [
      { who: 'WATCHTOWER', text: 'Dr. Lena Hart built HALCYON. She is the only person alive who knows its launch codes, and MERIDIAN is holding her at this outpost.' },
      { who: 'WATCHTOWER', text: 'Without her the stolen key is a box of wires. With her, they can fire it. Get her out.' },
      { who: 'TEX', text: 'Two towers on the south wall. I\'ll call them out, but you\'ll want to keep your head down on the approach.' },
    ],
    groups: {
      outer: { units: [{ pos: [-8, -36] }, { pos: [8, -35] }, { pos: [-15, -47] }, { pos: [12, -44] }, { pos: [0, -40], weapon: 'rk74' }] },
      towers: { units: [{ pos: [-25, 5.2, -25], stationary: true, role: 'sniper' }, { pos: [25, 5.2, -25], stationary: true, role: 'sniper' }] },
      court: { units: [{ pos: [-6, -12] }, { pos: [6, -11], weapon: 'rk74' }, { pos: [-12, -5] }, { pos: [12, -2], weapon: 'breaker' }, { pos: [-9, 13] }, { pos: [10, 12] }, { pos: [-18, 10], weapon: 'juggernaut' }] },
      hq: { spawnOn: 2, units: [{ pos: [-3, 0] }, { pos: [4, 5], weapon: 'havoc' }, { pos: [3, 3.3, 3], weapon: 'rk74' }] },
      reinf1: { spawnOn: 3, hunter: true, units: [{ pos: [-5, 60] }, { pos: [5, 60], weapon: 'rk74' }, { pos: [-20, 58] }, { pos: [20, 58], weapon: 'wasp' }] },
      reinf2: { spawnOn: 'wave2', hunter: true, units: [{ pos: [55, 0] }, { pos: [55, 6], weapon: 'rk74' }, { pos: [-50, 0] }, { pos: [-50, 8], weapon: 'juggernaut', role: 'heavy' }, { pos: [0, 62] }] },
    },
    objectives: [
      { type: 'goto', text: 'Breach the south gate', target: [0, -31], radius: 6,
        say: [{ who: 'REYES', text: 'Smoke the gate if those towers get a bead on you. ORION, push!' }] },
      { type: 'eliminate', text: 'Clear the compound', groups: ['outer', 'court', 'towers'],
        say: [{ who: 'HATCH', text: 'Contact, courtyard! They\'re dug in behind the sandbags.' }] },
      { type: 'cutscene', shots: [
        { orbit: [0, 3, 2], radius: 18, height: 9, a0: 2.5, a1: 3.3, dur: 4,
          say: [{ who: 'REYES', text: 'Compound\'s ours. Hart is inside the HQ, and they\'ll have a gun on her.' }] },
        { from: [-7, 2.2, -15], to: [-5.5, 2, -11], look: [-4, 1.4, 5], dur: 3,
          say: [{ who: 'HATCH', text: 'South door. Quick and quiet, Wraith. Don\'t give them time to think.' }] },
      ] },
      { type: 'interact', text: 'Rescue Dr. Hart inside the HQ', target: [-4, 0, 5], label: 'cut Dr. Hart free', duration: 3,
        say: [{ who: 'TEX', text: 'Thermal shows a body in the HQ, ground floor. More hostiles upstairs.' }],
        doneSay: [{ who: 'HART', text: 'You\'re American? Thank God. Listen: Vasko is selling a strike. One shot, to a buyer, as a demonstration.' }, { who: 'REYES', text: 'Tell us on the helo, Doctor. Now we hold.' }] },
      { type: 'cutscene', shots: [
        { from: [2, 12, 18], to: [0, 10, 26], look: [0, 1, 58], dur: 3.5, spawn: ['reinf1'],
          say: [{ who: 'WATCHTOWER', text: 'Technicals inbound from the north road. Your bird is four minutes out. Dig in.' }] },
      ] },
      { type: 'defend', text: 'Defend the HQ until the helicopter arrives', target: [0, 2], radius: 16, time: 80, waves: [{ at: 35, spawn: 'wave2' }],
        say: [{ who: 'WATCHTOWER', text: 'Helo is ninety seconds out. Hostiles converging from the north and east.' }] },
      { type: 'extract', text: 'Board the helicopter at the west LZ', target: [-45, 30], radius: 6,
        say: [{ who: 'REYES', text: 'Bird\'s down on the west side! Go!' }] },
    ],
    outro: [
      { who: 'HART', text: 'The buyer is meeting MERIDIAN in Vel Harat. Vasko will show him the key and take the money there.' },
      { who: 'REYES', text: 'Then that is where we go. If we break up the sale, nobody gets their demonstration.' },
    ],
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'm3', title: 'Concrete Jungle', map: 'downtown', lighting: 'overcast', weather: 'ash',
    location: 'VEL HARAT — FINANCIAL DISTRICT', time: 'DAY 4 — 07:05 LOCAL',
    summary: 'MERIDIAN has taken the city of Vel Harat to protect the sale. Blow up their two anti-aircraft guns so our gunships can get in.',
    recap: 'Hart told us MERIDIAN is selling a HALCYON strike to a buyer in the city of Vel Harat. MERIDIAN has taken the city to protect the deal.',
    goal: 'Their anti-aircraft guns keep our helicopters out. Destroy both guns, then hold the central plaza until the gunships arrive.',
    loadout: { primary: 'rk74', secondary: 'raptor', lethal: 'semtex', tactical: 'flash', attachments: { rk74: { optic: 'reflex', muzzle: 'compensator' } } },
    start: { pos: [-58, 2], yaw: -Math.PI / 2 },
    squad: SQUAD_FULL,
    insertion: { lz: [-58, 2], from: [-1, 0.15], hover: 12,
      lines: { approach: { who: 'PILOT', text: 'Coming in low over the avenue. AA is still up, so this is a quick drop!' }, ropes: { who: 'HATCH', text: 'Ropes out! Move it, Wraith!' } } },
    smoke: [[-30, -3], [20, -3.5], [-44, 3], [-3, 24]],
    briefing: [
      { who: 'WATCHTOWER', text: 'MERIDIAN has locked down Vel Harat for the sale. Two anti-aircraft guns cover the city, so our helicopters cannot get close.' },
      { who: 'WATCHTOWER', text: 'Plant charges on both guns. Then the gunships can come in, and you hold the central plaza for pickup.' },
      { who: 'HATCH', text: 'Charges are prepped. Get me to the guns and I\'ll do the rest. Actually — you do the rest. I\'ll watch.' },
    ],
    groups: {
      ave: { units: [{ pos: [-28, -3] }, { pos: [-24, 4], weapon: 'rk74' }, { pos: [-18, 3] }, { pos: [-12, 5], weapon: 'breaker' }, { pos: [-16, -6] }] },
      plaza: { units: [{ pos: [-5, 8] }, { pos: [5, -8], weapon: 'juggernaut' }, { pos: [8, 5] }, { pos: [-8, -5], weapon: 'rk74' }, { pos: [3, -3] }] },
      sw: { units: [{ pos: [-24, -30] }, { pos: [-20, -28], weapon: 'wasp' }, { pos: [-28, -26] }, { pos: [-16, 9.9, -19], stationary: true, role: 'sniper' }] },
      ne: { spawnOn: 3, units: [{ pos: [20, 28] }, { pos: [28, 26], weapon: 'rk74' }, { pos: [30, 22] }, { pos: [16, 9.9, 19], stationary: true, role: 'sniper' }, { pos: [26, 34], weapon: 'havoc' }] },
      hold1: { spawnOn: 4, hunter: true, units: [{ pos: [55, 0] }, { pos: [55, 4], weapon: 'rk74' }, { pos: [0, 55] }, { pos: [4, 55], weapon: 'wasp' }] },
      hold2: { spawnOn: 'wave2', hunter: true, units: [{ pos: [0, -55], weapon: 'juggernaut', role: 'heavy' }, { pos: [-4, -55] }, { pos: [55, -4] }, { pos: [50, 6], weapon: 'breaker' }, { pos: [-55, 5] }] },
    },
    objectives: [
      { type: 'goto', text: 'Push up the avenue to the plaza', target: [-14, 0], radius: 7,
        say: [{ who: 'REYES', text: 'Stay off the center of the street. Use the cars.' }] },
      { type: 'eliminate', text: 'Clear the plaza', groups: ['ave', 'plaza'] },
      { type: 'cutscene', shots: [
        { orbit: [-26, 2, -28], radius: 15, height: 8, a0: 0.5, a1: 1.3, dur: 4,
          say: [{ who: 'TEX', text: 'South-west battery. Crew of three, and they\'ve got a spotter up high.' }] },
        { from: [-24, 3, -10], to: [-23, 3.4, -12], look: [-16, 10.6, -19], dur: 3,
          say: [{ who: 'TEX', text: 'Sniper on that roof. Stay out of his line of sight until you\'re close.' }] },
      ] },
      { type: 'interact', text: 'Destroy the south-west AA battery', target: [-26, 0, -28], label: 'plant C4 on the AA battery', duration: 3, aa: true,
        say: [{ who: 'TEX', text: 'Sniper on the tower roof, south-west. Watch the high windows.' }],
        doneSay: [{ who: 'HATCH', text: 'Charge set... and boom. One down!' }] },
      { type: 'interact', text: 'Destroy the north-east AA battery', target: [24, 0, 31], label: 'plant C4 on the AA battery', duration: 3, aa: true,
        doneSay: [{ who: 'WATCHTOWER', text: 'Both batteries down. Gunships inbound in sixty seconds. Hold that plaza.' }] },
      { type: 'defend', text: 'Hold the plaza until the gunships arrive', target: [0, 4], radius: 14, time: 65, waves: [{ at: 25, spawn: 'wave2' }] },
      { type: 'extract', text: 'Reach the extraction point north', target: [0, 54], radius: 6 },
    ],
    outro: [
      { who: 'TEX', text: 'The buyer slipped out in the fighting. Arms dealer, name of Oskar Brandt.' },
      { who: 'WATCHTOWER', text: 'We have his phone. He meets MERIDIAN again tonight, in the city plaza. Bring him in and he will tell us where they mean to fire it from.' },
    ],
  },
  // ------------------------------------------------------------------ Night Market
  {
    id: 'm3b', title: 'Night Market', map: 'downtown', lighting: 'night', weather: 'rain',
    location: 'VEL HARAT — CITY PLAZA', time: 'DAY 4 — 23:10 LOCAL',
    summary: 'The buyer slipped away in the battle. Find him at his midnight meeting in the plaza, take his bodyguards out quietly and arrest him.',
    recap: 'The battle for Vel Harat broke up the sale, but the buyer, an arms dealer called Oskar Brandt, got away. Tonight he meets MERIDIAN again in the city plaza.',
    goal: 'Get close without raising the alarm, remove his bodyguards, arrest Brandt and make him tell us where MERIDIAN will fire HALCYON from.',
    loadout: { primary: 'wasp', secondary: 'p11', lethal: 'frag', tactical: 'smoke', attachments: { wasp: { muzzle: 'suppressor', optic: 'reflex' }, p11: { muzzle: 'suppressor' } } },
    loadoutNote: 'Quiet kit: suppressed MP-9 and P-11. Reyes is with you, suppressed. Tex is on a rooftop with a rifle.',
    kitHint: 'Crouch to move quietly  ·  V from behind: silent takedown  ·  aim at enemies to tag them  ·  Y: squad radio',
    start: { pos: [-57, 0], yaw: -Math.PI / 2 },
    squad: [{ name: 'Reyes', weapon: 'rk74', suppressed: true }],
    squadLeash: 8,
    stealth: true,
    alarmGroup: 'response',
    // Brandt himself, standing by the monument with his escort.
    civilians: [{ id: 'brandt', pos: [2.5, 7.5], yaw: Math.PI, pose: 'side', stand: true, faction: 'suit' }],
    briefing: [
      { who: 'WATCHTOWER', text: 'Oskar Brandt is an arms dealer. He is the buyer Vasko was selling the HALCYON strike to, and he knows where they plan to fire it from.' },
      { who: 'WATCHTOWER', text: 'He meets a MERIDIAN contact in the city plaza at midnight, with three bodyguards. We want him alive.' },
      { who: 'TEX', text: 'I\'ll be on a rooftop with eyes on the plaza. One sentry walks the avenue, another the cross street. Quiet is the whole job.' },
    ],
    groups: {
      lookouts: { units: [{ pos: [-30, 0], patrol: 'avenue' }, { pos: [0, -30], patrol: 'cross' }] },
      escort: { units: [{ pos: [-3, 7] }, { pos: [5, 9.5], weapon: 'breaker' }, { pos: [5.5, 4], weapon: 'wasp' }, { pos: [8, 6.5], weapon: 'rk74' }] },
      response: { spawnOn: 'alarm', hunter: true, units: [{ pos: [50, 0], weapon: 'rk74' }, { pos: [0, 55] }, { pos: [40, 10] }, { pos: [0, -55], weapon: 'breaker' }] },
      van: { spawnOn: 'van', hunter: true, units: [{ pos: [50, 0] }, { pos: [40, 10], weapon: 'rk74' }, { pos: [0, -55] }, { pos: [30, 0], weapon: 'juggernaut', role: 'heavy' }, { pos: [-30, 0] }] },
    },
    objectives: [
      { type: 'goto', text: 'Move up the avenue toward the plaza, out of sight', target: [-24, 2], radius: 4,
        say: [{ who: 'REYES', text: '(whisper) Stay low and in the shadows. I\'m on your shoulder.' }] },
      { type: 'eliminate', text: 'Take out the two sentries quietly', groups: ['lookouts'],
        say: [{ who: 'TEX', text: 'Sentry on the avenue, another on the cross street. From behind, or one suppressed round. No noise.' }] },
      { type: 'cutscene', shots: [
        { orbit: [2, 2, 6], radius: 15, height: 6, a0: 2.6, a1: 3.4, dur: 4.5,
          say: [{ who: 'TEX', text: 'There\'s Brandt, grey suit, by the monument. Three bodyguards and a MERIDIAN contact. Nobody touches Brandt.' }] },
      ] },
      { type: 'eliminate', text: 'Remove Brandt\'s bodyguards — keep Brandt alive', groups: ['escort'],
        say: [{ who: 'REYES', text: '(whisper) Bodyguards first. Brandt does not leave this plaza.' }] },
      { type: 'interact', text: 'Arrest Oskar Brandt', target: [2.5, 0, 7.5], label: 'arrest Oskar Brandt', duration: 3, act: 'detain', modelFrom: 'brandt',
        say: [{ who: 'BRANDT', text: 'Don\'t shoot! I\'m only a businessman!' }],
        doneSay: [{ who: 'BRANDT', text: 'All right! They will fire it from the mountains. Radar Station 9, in the Korvask range. The dish there can reach the satellites.' }, { who: 'WATCHTOWER', text: 'Got every word. Van is coming to you, and MERIDIAN heard the shooting. Hold the plaza.' }] },
      { type: 'defend', id: 'van', text: 'Hold the plaza until the van arrives', target: [0, 4], radius: 12, time: 50 },
      { type: 'extract', text: 'Get Brandt to the van at the north end', target: [0, 54], radius: 5,
        say: [{ who: 'REYES', text: 'Van is at the north end of the cross street. Go!' }] },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'Brandt confirmed it: MERIDIAN will send the launch order through the old radar dish at Radar Station 9, in the Korvask mountains.' },
      { who: 'REYES', text: 'Then we take the dish away from them. Tex, pack your rifle. We are going up the mountain.' },
    ],
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'm4', title: 'White Silence', map: 'snowfall', lighting: 'snow', weather: 'snow',
    location: 'KORVASK MOUNTAINS — RADAR STATION 9', time: 'DAY 6 — 05:50 LOCAL',
    summary: 'Take MERIDIAN\'s satellite dish away from them. Snipe from the ridge, sneak into the mountain radar station, tap its dish and kill the enforcer Rook.',
    recap: 'Oskar Brandt, the buyer, told us MERIDIAN will send the launch order through the big dish at Radar Station 9, in the Korvask mountains.',
    goal: 'Sneak in, splice our own line into the dish on the roof so they lose it and we can trace who is using it, then deal with their enforcer, Rook.',
    loadout: { primary: 'longbow', secondary: 'wasp', lethal: 'c4', tactical: 'smoke', attachments: { longbow: { muzzle: 'suppressor' }, wasp: { muzzle: 'suppressor' } } },
    loadoutNote: 'Secondary: MP-9 Wasp (suppressed). Spy kit: rappel rope (T at a roof edge).',
    start: { pos: [-45, 6.7, -61.5], yaw: -0.95 },
    squad: [],
    stealth: true,
    alarmGroup: 'alarm',
    // A rock outcrop over the south approach: your sniper perch.
    build(b) {
      b.box(-44, 0, -60, 10, 4.5, 8, 'rock');
      b.box(-45, 4.5, -61.5, 6, 2.2, 5, 'rock');
      b.box(-38.2, 0, -57.5, 2.2, 1.6, 2.4, 'rock');
      b.box(-47.5, 0, -55.4, 3, 2.2, 1.6, 'rock');
      b.rock(-41, -56, 1.2, 'rock', false); b.rock(-49.5, -64, 1.4, 'rock', false);
    },
    briefing: [
      { who: 'WATCHTOWER', text: 'Every forty minutes, the dish at Radar Station 9 calls up to HALCYON\'s satellites. MERIDIAN is testing it for the launch.' },
      { who: 'WATCHTOWER', text: 'Splice into it and the dish is ours. And whoever is on the other end of that line, we will see them.' },
      { who: 'TEX', text: 'I\'m on the far ridge with a spotter scope. You\'re the gun, Wraith. Whiteout\'s our friend: they can\'t see far, but neither can we.' },
      { who: 'WATCHTOWER', text: 'MERIDIAN enforcer "Rook" is on site. Heavy armor. Do not engage him on the ground.' },
    ],
    groups: {
      perim: { units: [{ pos: [-30, -45], patrol: 'perimeter' }, { pos: [30, -45], patrol: 'perimeter' }] },
      gate: { units: [{ pos: [-5, -38] }, { pos: [6, -37] }] },
      towerE: { units: [{ pos: [35, 5.2, -50], stationary: true, role: 'sniper' }] },
      towerW: { units: [{ pos: [-35, 5.2, 40], stationary: true, role: 'sniper' }] },
      center: { units: [{ pos: [-10, -5], patrol: 'center' }, { pos: [0, 13] }, { pos: [-6, -11] }, { pos: [7, -11], weapon: 'rk74' }] },
      bunker: { units: [{ pos: [25, -11] }, { pos: [23, -18] }, { pos: [28, -16], weapon: 'breaker' }] },
      radar: { units: [{ pos: [19, 17] }, { pos: [25, 23], weapon: 'wasp' }] },
      alarm: { spawnOn: 'alarm', hunter: true, units: [{ pos: [0, 42] }, { pos: [4, 42], weapon: 'rk74' }, { pos: [-40, 0] }, { pos: [42, 2] }] },
      rook: { units: [{ pos: [-22, 14], role: 'boss', name: 'Rook', health: 1300, weapon: 'juggernaut' }, { pos: [-26, 8], weapon: 'rk74' }, { pos: [-18, 6], weapon: 'breaker' }], spawnOn: 'never' },
    },
    objectives: [
      { type: 'eliminate', text: 'From the ridge, take out the tower sniper and the gate guards', groups: ['towerE', 'gate'],
        say: [{ who: 'TEX', text: 'East tower first. Hold your scope on him to tag him, and breathe out before you shoot.' }, { who: 'TEX', text: 'Then the two at the gate. Suppressor\'s on, so they won\'t know where it came from.' }] },
      { type: 'cutscene', shots: [
        { orbit: [22, 5, 20], radius: 20, height: 9, a0: -0.4, a1: 0.5, dur: 4.5,
          say: [{ who: 'WATCHTOWER', text: 'The uplink antenna is on the radar building roof. Splice it from up there.' }] },
        { from: [-6, 3.5, -6], to: [-10, 3.2, -4], look: [-22, 2, 9], dur: 3.5,
          say: [{ who: 'TEX', text: 'Hangar\'s full of Rook\'s people. Stay out of the open. Use the buildings.' }] },
      ] },
      { type: 'goto', text: 'Get down off the ridge and through the wire', target: [0, -42], radius: 8,
        hints: [[-25.5, -50, 'GAP'], [25.5, -50, 'GAP']],
        say: [{ who: 'TEX', text: 'Walk to the south edge of the rock and press T to rappel down. Then the gate, a gap in the wire, or just climb the fence.' }] },
      { type: 'goto', text: 'Get onto the radar building roof', target: [20, 6.6, 21], radius: 5, minY: 5.8,
        say: [{ who: 'TEX', text: 'Stairs inside go up to the roof. Two inside. Take them quietly.' }] },
      { type: 'interact', text: 'Splice into the uplink antenna', target: [19.3, 6.6, 22.1], label: 'splice the uplink antenna', duration: 5,
        doneSay: [{ who: 'WATCHTOWER', text: 'We have the dish. Tracing the line now... Wait. Heavy signature leaving the hangar. That is Rook.' }],
        onComplete: ['alarm'] },
      { type: 'cutscene', shots: [
        { from: [-12, 2.2, -6], to: [-14, 2.6, -4], look: [-22, 1.8, 12], dur: 3.5, spawn: ['rook'],
          say: [{ who: 'TEX', text: 'There he is. He knows where you are. He\'s coming straight at you.' }] },
        { orbit: [20, 7.5, 21], radius: 9, height: 3, a0: 3.6, a1: 4.4, dur: 3,
          say: [{ who: 'TEX', text: 'Keep the high ground and aim for the head. The armor stops everything else.' }] },
      ] },
      { type: 'boss', text: 'Eliminate Rook', group: 'rook', bossName: 'ROOK' },
      { type: 'extract', text: 'Exfil to the northwest treeline', target: [-48, 58], radius: 7,
        say: [{ who: 'TEX', text: 'Rook is down. Let\'s not be here when his friends arrive.' }] },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'The line from the dish runs to Facility 6: a secret lab sixty metres underground. That is where MERIDIAN\'s engineers are working on the key.' },
      { who: 'TEX', text: 'And Rook was carrying a keycard for it. Somebody on the inside has been helping them.' },
    ],
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'm5', title: 'Deep Cover', map: 'blacksite', lighting: 'indoor', weather: 'none',
    location: 'FACILITY 6 — 60 METRES BELOW GROUND', time: 'DAY 7 — 23:30 LOCAL',
    summary: 'Get into Facility 6, the secret lab working on the key. Hack its servers to find MERIDIAN\'s inside helper, and take their copy of the launch codes.',
    recap: 'The dish led us to Facility 6, an underground lab where MERIDIAN works on the key. Rook\'s keycard opens it. Someone on the inside is helping them.',
    goal: 'Hack the server room to find out who the inside helper is, pull the drive with MERIDIAN\'s copy of the launch codes, and get out by the lift.',
    loadout: { primary: 'viper', secondary: 'p11', lethal: 'frag', tactical: 'flash', attachments: { viper: { optic: 'holo', underbarrel: 'laser' } } },
    start: { pos: [-39.5, 0], yaw: -Math.PI / 2 },
    squad: SQUAD_RH,
    briefing: [
      { who: 'WATCHTOWER', text: 'Rook\'s keycard opens Facility 6. MERIDIAN has a copy of the launch codes down there, on a drive in the lab.' },
      { who: 'HART', text: '(from the safe house) The server room records everyone who touched HALCYON. If someone inside helped Vasko, their name will be there.' },
      { who: 'REYES', text: 'Tight corridors. Flashbangs before every door. Let\'s go.' },
    ],
    groups: {
      west: { units: [{ pos: [-17, 4] }, { pos: [-15, -5], weapon: 'wasp' }, { pos: [-19, 9] }] },
      servers: { units: [{ pos: [-30, 20] }, { pos: [-24, 32], weapon: 'breaker' }, { pos: [-35, 31] }] },
      atrium: { units: [{ pos: [-4, 6] }, { pos: [5, -5], weapon: 'juggernaut' }, { pos: [6, 6] }, { pos: [-6, -6], weapon: 'rk74' }, { pos: [0, -15] }] },
      lab: { units: [{ pos: [22, 20] }, { pos: [31, 33], weapon: 'havoc' }, { pos: [26, 18] }] },
      control: { units: [{ pos: [22, -20] }, { pos: [31, -31] }, { pos: [34, -22], weapon: 'wasp' }] },
      wave1: { spawnOn: 4, hunter: true, units: [{ pos: [0, 12] }, { pos: [4, 12], weapon: 'breaker' }, { pos: [-4, -12] }, { pos: [0, -30], weapon: 'rk74' }] },
      wave2: { spawnOn: 'wave2', hunter: true, units: [{ pos: [-27, -26], weapon: 'juggernaut', role: 'heavy' }, { pos: [-24, -20] }, { pos: [0, 30] }, { pos: [4, 30], weapon: 'wasp' }] },
    },
    objectives: [
      { type: 'goto', text: 'Breach the server room', target: [-27, 11], radius: 5 },
      { type: 'interact', text: 'Hack the server cluster', target: [-27, 0, 26], label: 'hack the server cluster', duration: 6,
        say: [{ who: 'REYES', text: 'Wraith, get on that terminal. We\'ve got your back.' }],
        doneSay: [{ who: 'WATCHTOWER', text: 'Logs coming through... The person who handed MERIDIAN the key was... Dr. Lena Hart. Her kidnapping was staged.' }, { who: 'REYES', text: 'She has been working with Vasko all along. Grab that drive before she wipes it.' }] },
      { type: 'interact', text: 'Pull the drive with the launch codes in the lab', target: [27, 0, 30], label: 'pull the launch-code drive', duration: 3,
        say: [{ who: 'HATCH', text: 'Lab\'s across the atrium. It\'s going to be loud.' }] },
      { type: 'interact', text: 'Override the lift lock in the control room', target: [27, 0, -28], label: 'override the lift lock', duration: 4 },
      { type: 'defend', text: 'Hold the control room while the lift arrives', target: [27, -26], radius: 11, time: 60, waves: [{ at: 25, spawn: 'wave2' }],
        say: [{ who: 'WATCHTOWER', text: 'Lift is sixty seconds out. They know you\'re there.' }] },
      { type: 'extract', text: 'Reach the east service lift', target: [37, 0], radius: 4 },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'Hart is gone. A MERIDIAN team broke her out of our safe house an hour ago. Her convoy is racing south across the Al-Rashid desert.' },
      { who: 'REYES', text: 'She still knows the codes, and she is going back to the key. We chase her tonight.' },
    ],
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'm6', title: 'Broken Arrow', map: 'desert', lighting: 'night', weather: 'dust',
    location: 'AL-RASHID BASIN — CRASH SITE', time: 'DAY 8 — 03:12 LOCAL',
    summary: 'Shot down chasing Hart across the desert. Pull Captain Reyes out of the wreck and survive until the rescue helicopter comes at dawn.',
    recap: 'Hart was the traitor all along, and she escaped. Chasing her convoy across the desert at night, our helicopter Raven 2-1 was hit by a missile.',
    goal: 'Get Captain Reyes out of the wreck, then hold the crash site against MERIDIAN until the rescue helicopter arrives at dawn.',
    loadout: { primary: 'juggernaut', secondary: 'raptor', lethal: 'frag', tactical: 'stim', attachments: { juggernaut: { optic: 'holo' } } },
    start: { pos: [-34, -64], yaw: Math.PI * 0.8 },
    squad: [{ name: 'Hatch', weapon: 'rk74' }],
    crash: [-50, -46],
    smoke: [[-50, -46]],
    briefing: [
      { who: 'WATCHTOWER', text: 'Raven Two-One is down. A missile from Hart\'s convoy. I say again, Raven Two-One is down. ORION, report.' },
      { who: 'HATCH', text: 'Wraith... you alive? Reyes is still in the wreck. We have to get her out.' },
      { who: 'WATCHTOWER', text: 'Every MERIDIAN unit in the desert saw that fireball. The rescue bird can only reach you at dawn. Hold on until then.' },
    ],
    groups: {
      scouts: { units: [{ pos: [-44, -40] }, { pos: [-52, -34], weapon: 'wasp' }, { pos: [-60, -42] }] },
      w1: { spawnOn: 2, hunter: true, units: [{ pos: [-15, -20] }, { pos: [-10, -45], weapon: 'rk74' }, { pos: [-30, -10] }, { pos: [-62, -10], weapon: 'breaker' }, { pos: [-20, -60] }] },
      w2: { spawnOn: 'wave2', hunter: true, units: [{ pos: [0, -40], weapon: 'juggernaut', role: 'heavy' }, { pos: [-10, -10] }, { pos: [-50, 5], weapon: 'rk74' }, { pos: [-65, -25] }, { pos: [-20, -5], weapon: 'havoc' }, { pos: [5, -55] }] },
      w3: { spawnOn: 'wave3', hunter: true, units: [{ pos: [-30, 0], weapon: 'juggernaut', role: 'heavy' }, { pos: [-5, -25], weapon: 'rk74' }, { pos: [-60, 10] }, { pos: [10, -45], weapon: 'wasp' }, { pos: [-40, 5] }, { pos: [-25, -65], weapon: 'breaker' }] },
    },
    objectives: [
      { type: 'eliminate', text: 'Clear the scouts near the wreck', groups: ['scouts'],
        say: [{ who: 'HATCH', text: 'Scouts are already picking through the wreck. Drop them!' }] },
      { type: 'interact', text: 'Pull Captain Reyes from the wreck', target: [-49, 0, -43], label: 'pull Reyes from the wreck', duration: 4,
        doneSay: [{ who: 'REYES', text: 'Took you long enough. Leg\'s busted. Hand me a rifle — I can still shoot.' }], onComplete: ['joinReyes'] },
      { type: 'cutscene', shots: [
        { orbit: [-48, 2, -45], radius: 14, height: 7, a0: 0.2, a1: 1.1, dur: 4.5,
          say: [{ who: 'REYES', text: 'Dawn is two hours out. They\'ll come at us from every side. Make every round count.' }] },
      ] },
      { type: 'defend', text: 'Survive until the dawn rescue arrives', target: [-48, -45], radius: 18, time: 140,
        waves: [{ at: 45, spawn: 'wave2' }, { at: 95, spawn: 'wave3' }],
        say: [{ who: 'WATCHTOWER', text: 'Multiple technicals inbound. Dig in, ORION. Use your flashlight sparingly — they\'ll see it.' }] },
      { type: 'extract', text: 'Get to the rescue helo', target: [-22, -58], radius: 6,
        say: [{ who: 'WATCHTOWER', text: 'Sunrise. Rescue bird on station south-east. Go!' }] },
    ],
    lightingAfter: 'dawn',
    outro: [
      { who: 'WATCHTOWER', text: 'Hart got away. Her convoy stopped for the night at a village east of the outpost, and the launcher that hit Raven Two-One is still there.' },
      { who: 'REYES', text: 'My leg is done. Hatch, Tex, Wraith: put that launcher in the ground and find out where she went.' },
    ],
  },
  // ------------------------------------------------------------------ Sandstorm
  {
    id: 'm6b', title: 'Sandstorm', map: 'desert', lighting: 'desert', weather: 'dust',
    location: 'AL-RASHID BASIN — EAST VILLAGE', time: 'DAY 8 — 11:30 LOCAL',
    summary: 'Hit the desert village where Hart\'s convoy stopped. Destroy the missile launcher that shot down Raven 2-1 and steal the convoy\'s route.',
    recap: 'We survived the crash, but Hart got away. Her convoy stopped overnight at a village east of the outpost, and left the missile launcher that shot us down.',
    goal: 'Use the sandstorm to get close, blow up the launcher so our helicopters can fly again, and download the convoy\'s route from their command laptop.',
    loadout: { primary: 'rk74', secondary: 'raptor', lethal: 'semtex', tactical: 'smoke', attachments: { rk74: { optic: 'acog', muzzle: 'compensator' } } },
    loadoutNote: 'Reyes is at the medical tent with a broken leg. Hatch and Tex are with you.',
    start: { pos: [30, -55], yaw: Math.PI },
    squad: [{ name: 'Hatch', weapon: 'rk74' }, { name: 'Tex', weapon: 'rk74' }],
    briefing: [
      { who: 'WATCHTOWER', text: 'Hart\'s convoy stopped for the night at a village east of the outpost. They left the missile launcher that hit Raven Two-One there.' },
      { who: 'WATCHTOWER', text: 'While that launcher is up, nothing of ours can fly in this desert. And their command laptop will have the convoy\'s route.' },
      { who: 'HATCH', text: 'Storm\'s coming in. They won\'t see us until we\'re on top of them. Neither will we, so stay close.' },
    ],
    groups: {
      outskirts: { units: [{ pos: [38, -30] }, { pos: [58, -24], weapon: 'wasp' }, { pos: [52, -20] }] },
      camp: { units: [{ pos: [44, 4] }, { pos: [50, 6], weapon: 'rk74' }, { pos: [54, 10] }, { pos: [38, 14], weapon: 'juggernaut', role: 'heavy' }, { pos: [58, 2] }] },
      counter: { spawnOn: 'counter', hunter: true, units: [{ pos: [60, 50] }, { pos: [20, 40], weapon: 'rk74' }, { pos: [62, 20], weapon: 'breaker' }, { pos: [25, 50] }, { pos: [40, 55], weapon: 'rk74' }] },
      counter2: { spawnOn: 'counter2', hunter: true, units: [{ pos: [60, 50], weapon: 'juggernaut', role: 'heavy' }, { pos: [20, 40] }, { pos: [62, 20], weapon: 'wasp' }] },
    },
    objectives: [
      { type: 'goto', text: 'Move up to the village under cover of the storm', target: [52, -20], radius: 5,
        say: [{ who: 'TEX', text: 'Three on the south edge of the village. Close in slow. Let the dust hide us.' }] },
      { type: 'eliminate', text: 'Clear the south edge of the village', groups: ['outskirts'] },
      { type: 'cutscene', shots: [
        { orbit: [46, 2, 4], radius: 16, height: 8, a0: 3.6, a1: 4.4, dur: 4.5,
          say: [{ who: 'TEX', text: 'There it is, by the well. Truck-mounted launcher. That is what killed Raven Two-One.' }] },
      ] },
      { type: 'eliminate', text: 'Clear the camp', groups: ['camp'],
        say: [{ who: 'HATCH', text: 'Heavy gunner by the north wall. Hit him from cover, don\'t trade with him in the open.' }] },
      { type: 'interact', text: 'Destroy the missile launcher', target: [40, 0, 8], label: 'plant C4 on the missile launcher', duration: 3, aa: true,
        doneSay: [{ who: 'HATCH', text: 'Charge is on. Back up... and down she goes. Skies are open.' }] },
      { type: 'interact', text: 'Download the convoy\'s route from the command laptop', target: [56, 0, -2], label: 'download the convoy route', duration: 5,
        doneSay: [{ who: 'WATCHTOWER', text: 'Route coming through. Hart\'s convoy is heading for Port Kaval. She is putting the key on a ship.' }, { who: 'TEX', text: 'Contacts! Trucks coming in from the north!' }] },
      { type: 'defend', id: 'counter', text: 'Hold the village against the counter-attack', target: [48, 2], radius: 16, time: 70, waves: [{ at: 35, spawn: 'counter2' }] },
      { type: 'extract', text: 'Reach the helicopter at the south LZ', target: [60, -50], radius: 6,
        say: [{ who: 'WATCHTOWER', text: 'Helicopter is on the ground south of the village. Go!' }] },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'The route ends at berth two, Port Kaval. The cargo ship Meridian Star is waiting there, and MERIDIAN\'s field commander, Kessler, is guarding it.' },
      { who: 'REYES', text: '(from the medical tent) Kessler. He\'s mine.' },
      { who: 'HATCH', text: 'Captain, you can barely walk.' },
      { who: 'REYES', text: 'Then he\'s Wraith\'s.' },
    ],
  },
  // ------------------------------------------------------------------ 6c
  {
    id: 'm6c', title: 'Hard Breach', map: 'downtown', lighting: 'overcast', weather: 'none',
    location: 'PORT KAVAL — OLD TOWN', time: 'DAY 15 — 06:20 LOCAL',
    summary: 'Raid MERIDIAN\'s shipping office: blow the front door, clear it floor by floor, arrest the cell leader, free their hostages and take the files that say which ship carries the key.',
    recap: 'The convoy\'s route ends in Port Kaval\'s old town, at an office block MERIDIAN uses to run everything that moves through the port. Two dock workers who saw too much are held on the top floor.',
    goal: 'Go in hard and fast before they burn their files: breach the front door, clear the ground floor, arrest the cell leader, clear the top floor and free the hostages, then copy the files.',
    loadout: { primary: 'vx4', secondary: 'p11', lethal: 'frag', tactical: 'flash', attachments: { vx4: { optic: 'holo', underbarrel: 'vgrip' } } },
    loadoutNote: 'Entry kit: breaching charge for the door, flashbangs for the rooms. Hatch and Tex stack with you.',
    kitHint: 'G: throw a flashbang into the room before you go in  ·  hold E: place the charge, cuff, cut ties, copy files  ·  Y: squad radio',
    start: { pos: [-42, -7], yaw: -Math.PI / 2 },
    squad: [{ name: 'Hatch', weapon: 'rk74' }, { name: 'Tex', weapon: 'rk74' }],
    squadLeash: 9,
    alarmTimer: 75,
    timerText: 'HOSTAGES',
    timerFail: ['The hostages were executed.', 'Once the door blows the clock is running. Flash the rooms and keep moving.'],
    // MERIDIAN's office: the concrete block on the south-west corner (x -24..-8, z -24..-14),
    // three floors, front door on the north side. Partitions make a lobby, a side
    // room, a back office and the stair hall; upstairs, the room the hostages are in.
    doors: { front: { x: -19, z: -14.15, w: 1.7, h: 2.35, axis: 'x', out: 1 } },
    civilians: [
      { id: 'leader', pos: [-22.4, -22.3], yaw: Math.PI * 0.8, pose: 'head', stand: true, faction: 'suit' },
      { pos: [-22.6, 3.3, -16.2], yaw: Math.PI * 0.6 },
      { pos: [-21.2, 3.3, -15.6], yaw: -Math.PI * 0.7 },
    ],
    build(b) {
      b.keepClear(-24, -24, -8, -14);
      const h = 3.0, t = 0.15, up = 3.3;
      // Ground floor.
      b.wall('x', -23.85, -8.15, -18, 0, h, t, 'plaster', [{ at: -20, w: 1.1, top: 2.2 }, { at: -9.7, w: 1.6, top: 2.2 }]);
      b.wall('z', -17.85, -14.15, -14, 0, h, t, 'plaster', [{ at: -16, w: 1.1, top: 2.2 }]);
      b.wall('z', -23.85, -18.15, -16, 0, h, t, 'plaster', [{ at: -21.5, w: 1.0, top: 2.2 }]);
      // Lobby: reception desk, sofa; side room: table and chairs; back office: desk, cabinets, a server rack.
      b.box(-21.5, 0, -15.2, 2.0, 1.05, 0.6, 'woodDark');
      b.box(-23.2, 0, -16.9, 0.8, 0.8, 1.9, 'fabric');
      b.box(-11, 0, -16, 1.8, 0.76, 1.0, 'wood');
      b.box(-22.4, 0, -20.6, 1.6, 0.76, 0.8, 'wood');
      b.box(-17.2, 0, -23.4, 1.4, 1.3, 0.5, 'metalDark');
      b.box(-18.7, 0, -23.4, 0.6, 2.0, 0.7, 'metalDark');
      b.box(-13.5, 0, -23.3, 1.2, 1.0, 0.8, 'wood');
      // Top floor: the hostage room (west) and a hall to the stairs.
      b.wall('z', -23.85, -14.15, -15, up, h, t, 'plaster', [{ at: -17.2, w: 1.1, top: 2.2 }]);
      b.box(-20.6, up, -21.8, 1.9, 0.3, 1.0, 'fabric');
      b.box(-18.5, up, -17.4, 1.0, 0.76, 0.7, 'wood');
      b.box(-11.5, up, -15.2, 1.6, 0.76, 0.8, 'wood');
      // Lights inside; the team van on the avenue.
      b.light(-19.5, 2.7, -16.0, 0xfff0d8, 7, 9);
      b.light(-20.0, 2.7, -21.0, 0xffe0b8, 6, 8);
      b.light(-11.5, 2.7, -20.5, 0xfff0d8, 5, 8);
      b.light(-19.5, 6.0, -19.0, 0xffd0a0, 6, 9);
      b.car(-33, -10.5, 'x', 'carWhite');
      b.patrol('office', [[-27, -11.5], [-10, -11.5]]);
    },
    briefing: [
      { who: 'WATCHTOWER', text: 'The convoy\'s route ends at this office block in Port Kaval\'s old town. MERIDIAN\'s logistics cell runs the port from in there.' },
      { who: 'WATCHTOWER', text: 'They hold two dock workers on the top floor, and they will burn their files the moment they hear us. We need those files.' },
      { who: 'HATCH', text: 'No quiet way in. I put a charge on the front door, it goes, we flash and flood. Ground floor with me, then up the stairs.' },
    ],
    groups: {
      street: { units: [{ pos: [-21, -11.8] }, { pos: [-14, -11.5], patrol: 'office', weapon: 'wasp' }] },
      // Barricaded inside: they hold their rooms.
      ground: { units: [{ pos: [-21.5, -16.6], stationary: true }, { pos: [-17.2, -15.4], weapon: 'wasp', stationary: true }, { pos: [-11.2, -17.0], weapon: 'breaker', stationary: true }, { pos: [-19.5, -22.2], stationary: true }, { pos: [-12.5, -21.5], weapon: 'rk74', stationary: true }] },
      upstairs: { units: [{ pos: [-19.2, 3.3, -19.5], weapon: 'wasp' }, { pos: [-17.0, 3.3, -22.6], weapon: 'rk74' }, { pos: [-11.5, 3.3, -17.0] }] },
      response: { spawnOn: 'files', hunter: true, units: [{ pos: [-50, 0], weapon: 'rk74' }, { pos: [0, -40] }, { pos: [-30, 10], weapon: 'breaker' }, { pos: [10, -25] }, { pos: [-45, -30], weapon: 'rk74' }] },
    },
    objectives: [
      { type: 'goto', text: 'Move up behind the van', target: [-30, -9], radius: 3,
        say: [{ who: 'HATCH', text: 'That\'s the place. Two on the street. Drop them, then we stack on the front door.' }] },
      { type: 'eliminate', text: 'Drop the two sentries on the street', groups: ['street'],
        say: [{ who: 'TEX', text: 'One by the door, one walking the front. Take them.' }] },
      { type: 'goto', text: 'Stack on the front door', target: [-19.3, -12.7], radius: 1.0,
        stack: [[-20.7, -12.5], [-21.4, -12.3]], stackYaw: 0,
        say: [{ who: 'HATCH', text: 'Stacked. Charge goes on the door, then everybody back against the wall.' }] },
      { type: 'interact', text: 'Place the breaching charge on the door', target: [-19, 0, -14.6], label: 'place the breaching charge', duration: 3, act: 'c4', door: 'front', breach: true,
        doneSay: [{ who: 'HATCH', text: 'BREACHING!' }] },
      { type: 'eliminate', text: 'Clear the ground floor', groups: ['ground'], squadFollow: true,
        say: [{ who: 'TEX', text: 'Door\'s gone! Flash the lobby, then the rooms. Go, go, go!' }] },
      { type: 'interact', text: 'Arrest the cell leader in the back office', target: [-22.4, 0, -22.3], label: 'arrest the cell leader', duration: 3, act: 'detain', modelFrom: 'leader',
        say: [{ who: 'LEADER', text: 'Don\'t shoot! I give up! I only move the paperwork!' }],
        doneSay: [{ who: 'HATCH', text: 'Cuffed. Hostages are upstairs. Tex and I hold the stairs, Wraith, top floor is yours. Flash the room.' }] },
      { type: 'eliminate', text: 'Clear the top floor — don\'t hit the hostages', groups: ['upstairs'] },
      { type: 'interact', text: 'Cut the hostages free', target: [-22, 3.3, -18.8], label: 'cut the hostages free', duration: 3, freeCivilians: true, stopTimer: true,
        doneSay: [{ who: 'TEX', text: 'Hostages are safe. Now the files, before anyone else shows up.' }] },
      { type: 'interact', text: 'Copy the shipping files from the office laptop', target: [-22.4, 0, -20.6], label: 'copy the shipping files', duration: 6, act: 'hack', onComplete: ['files'],
        doneSay: [{ who: 'WATCHTOWER', text: 'Got them. MERIDIAN is loading the key onto a freighter called the Meridian Star. More of them are coming your way.' }] },
      { type: 'defend', id: 'hold', text: 'Hold the building until the files are sent', target: [-16, -16], radius: 10, time: 40 },
      { type: 'extract', text: 'Get everyone to the van', target: [-33, -8], radius: 4,
        say: [{ who: 'HATCH', text: 'Files are out. Hostages and prisoner to the van. Move!' }] },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'The files name the ship: the Meridian Star, loading at the Port Kaval docks tomorrow night, guarded by their commander, Kessler.' },
      { who: 'HATCH', text: 'Then that\'s where the key is. Good breach, Wraith.' },
    ],
  },
  // ------------------------------------------------------------------ 7
  {
    id: 'm7', title: 'Iron Tide', map: 'harbor', lighting: 'dusk', weather: 'none',
    location: 'PORT KAVAL — BERTH TWO', time: 'DAY 9 — 19:20 LOCAL',
    summary: 'The key is being loaded onto a ship. Fight through the docks, kill MERIDIAN\'s commander Kessler and take the HALCYON key back.',
    recap: 'The files from the shipping office named the ship: MERIDIAN is loading the HALCYON key onto the cargo ship Meridian Star at Port Kaval, guarded by their commander, Kessler.',
    goal: 'Fight through the container yard before the ship sails, kill Kessler on the quay and take the key back.',
    loadout: { primary: 'hx30', secondary: 'raptor', lethal: 'frag', tactical: 'flash', attachments: { hx30: { optic: 'acog', underbarrel: 'vgrip' } } },
    start: { pos: [-64, -12], yaw: -Math.PI / 2 },
    squad: [{ name: 'Hatch', weapon: 'rk74' }, { name: 'Tex', weapon: 'rk74' }],
    insertion: { lz: [-64, -12], from: [-1, -0.1], hover: 12,
      lines: { approach: { who: 'PILOT', text: 'Port Kaval in thirty. Last ride, gentlemen.' }, ropes: { who: 'HATCH', text: 'Ropes out! Let\'s finish this!' } } },
    smoke: [[-6, 30], [40, 30]],
    briefing: [
      { who: 'WATCHTOWER', text: 'The cargo ship Meridian Star sails in forty minutes, and the HALCYON key is in a crate on the quay beside it.' },
      { who: 'WATCHTOWER', text: 'Kessler Grau, "The Butcher", commands the dock. Kill him, take the key, end this.' },
      { who: 'TEX', text: 'I\'ll set up on the office roof. You two go through the yard.' },
    ],
    groups: {
      wh: { units: [{ pos: [-34, -38], weapon: 'rk74' }, { pos: [-24, -40] }, { pos: [-40, -30] }] },
      wstack: { units: [{ pos: [-33, 4] }, { pos: [-28, 12], weapon: 'breaker' }, { pos: [-40, 18] }, { pos: [-20, 0], weapon: 'rk74' }] },
      yard1: { units: [{ pos: [16, 9] }, { pos: [24, 9], weapon: 'juggernaut' }, { pos: [40, 0] }, { pos: [44, 14], weapon: 'wasp' }, { pos: [12, -4] }] },
      office: { units: [{ pos: [-2, -20] }, { pos: [0, 6.6, -22], stationary: true, role: 'sniper' }] },
      quay: { spawnOn: 3, units: [{ pos: [25, 36], role: 'boss', name: 'Kessler', health: 1700, weapon: 'havoc' }, { pos: [18, 38], weapon: 'rk74' }, { pos: [32, 36] }, { pos: [10, 40], weapon: 'juggernaut' }, { pos: [-6, 38] }] },
      quayW: { spawnOn: 'wave2', hunter: true, units: [{ pos: [-50, 36] }, { pos: [-44, 38], weapon: 'rk74' }, { pos: [55, 36], weapon: 'breaker' }] },
    },
    objectives: [
      { type: 'goto', text: 'Fight into the west container stacks', target: [-22, -10], radius: 8,
        say: [{ who: 'HATCH', text: 'Warehouse on the left is crawling. Keep moving!' }] },
      { type: 'eliminate', text: 'Clear the container yard', groups: ['wstack', 'yard1', 'office'],
        say: [{ who: 'TEX', text: 'In position. I\'ve got eyes on the yard — I\'ll thin them out.' }] },
      { type: 'goto', text: 'Reach the quay', target: [0, 32], radius: 7 },
      { type: 'cutscene', shots: [
        { from: [6, 5, 22], to: [10, 4, 26], look: [25, 1.8, 36], dur: 4, spawn: ['quay'],
          say: [{ who: 'WATCHTOWER', text: 'That\'s Kessler on the quay. Body armor, auto-shotgun. He doesn\'t retreat.' }] },
        { orbit: [25, 2, 36], radius: 10, height: 3, a0: 2.9, a1: 3.6, dur: 3,
          say: [{ who: 'REYES', text: 'Climb the stacks and hit him from above. Don\'t let him get close.' }] },
      ] },
      { type: 'boss', text: 'Kill Kessler Grau', group: 'quay', bossName: 'KESSLER "THE BUTCHER" GRAU', waves: [{ at: 20, spawn: 'wave2' }],
        say: [{ who: 'KESSLER', text: 'ORION! I buried better soldiers than you in that desert. Come and get your box.' }] },
      { type: 'interact', text: 'Take the HALCYON key from its crate', target: [24, 0, 38], label: 'take the HALCYON key', act: 'core', duration: 4,
        doneSay: [{ who: 'WATCHTOWER', text: 'Wraith... that is a fake. Lead weights, no electronics. The ship was bait to pull us away.' }, { who: 'REYES', text: 'Then where is the real key?' }, { who: 'WATCHTOWER', text: 'Under Facility 6. A sealed launch vault, three floors below the labs you raided, with its own dish. Hart and Vasko are there. They fire in ten minutes.' }] },
      { type: 'extract', text: 'Get to the boat at the west pier', target: [-62, 36], radius: 6 },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'The key on the dock was a fake, and the ship was bait to pull us away. The real key never left Facility 6: it is in a sealed launch vault three floors below the labs you raided, with Hart and Vasko.' },
      { who: 'WATCHTOWER', text: 'The vault is behind blast doors, and their power comes from a station in the Korvask mountains. Cut it and the doors fail open.' },
      { who: 'REYES', text: 'Then we cut it, tonight. Hatch, Tex, Wraith: back up the mountain.' },
    ],
  },
  // ------------------------------------------------------------------ Blackout
  {
    id: 'm7b', title: 'Blackout', map: 'snowfall', lighting: 'night', weather: 'snow',
    location: 'KORVASK MOUNTAINS — POWER STATION', time: 'DAY 9 — 21:40 LOCAL',
    summary: 'The launch vault under Facility 6 is sealed by blast doors. Blow up the mountain power station that feeds them, so the doors fail open.',
    recap: 'The key on the ship was a fake. The real key is in a launch vault under Facility 6, behind blast doors powered from a station in the Korvask mountains.',
    goal: 'Sneak up to the power station, blow up both transformers and shut off the backup generator. When the power dies, the vault doors fail open.',
    loadout: { primary: 'hx30', secondary: 'p11', lethal: 'c4', tactical: 'smoke', attachments: { hx30: { optic: 'thermal', muzzle: 'suppressor' }, p11: { muzzle: 'suppressor' } } },
    loadoutNote: 'Thermal sight for the snow. Hatch and Tex are with you, suppressed.',
    start: { pos: [-55, -30], yaw: -Math.PI / 2 },
    squad: [{ name: 'Hatch', weapon: 'rk74', suppressed: true }, { name: 'Tex', weapon: 'rk74', suppressed: true }],
    squadLeash: 10,
    stealth: true,
    alarmGroup: 'alarm',
    briefing: [
      { who: 'WATCHTOWER', text: 'The vault under Facility 6 is sealed behind blast doors. The doors run on power from this station, down in the Korvask valley.' },
      { who: 'WATCHTOWER', text: 'Two transformers outside, a backup generator inside. Kill all three and the doors fail open. Reyes is waiting at the shaft with everyone we have.' },
      { who: 'TEX', text: 'Snow\'s thick tonight. Thermal sight will see them before they see us.' },
    ],
    groups: {
      patrol: { units: [{ pos: [-20, -30] }, { pos: [0, -30], weapon: 'wasp' }] },
      station: { units: [{ pos: [16, -17] }, { pos: [34, -17], weapon: 'rk74' }, { pos: [25, -10] }, { pos: [10, -10] }] },
      alarm: { spawnOn: 'alarm', hunter: true, units: [{ pos: [-22, 10], weapon: 'rk74' }, { pos: [-18, 14] }, { pos: [0, 40] }, { pos: [22, 20], weapon: 'juggernaut', role: 'heavy' }, { pos: [-48, 58], weapon: 'breaker' }] },
    },
    objectives: [
      { type: 'eliminate', text: 'Take out the valley patrol without a sound', groups: ['patrol'],
        say: [{ who: 'TEX', text: 'Two walking the valley floor. Take them quietly, or the whole station wakes up.' }] },
      { type: 'goto', text: 'Get to the power station', target: [10, -10], radius: 4 },
      { type: 'cutscene', shots: [
        { orbit: [25, 3, -14], radius: 15, height: 7, a0: 2.8, a1: 3.6, dur: 4.5,
          say: [{ who: 'HATCH', text: 'Two transformers either side of the station, generator inside. Guards on all three.' }] },
      ] },
      { type: 'eliminate', text: 'Clear the station guards', groups: ['station'] },
      { type: 'interact', text: 'Blow up transformer A', target: [17, 0, -11], label: 'plant C4 on transformer A', duration: 3, transformer: true,
        doneSay: [{ who: 'HATCH', text: 'A is cooking. One more.' }] },
      { type: 'interact', text: 'Blow up transformer B', target: [32, 0, -11], label: 'plant C4 on transformer B', duration: 3, transformer: true,
        doneSay: [{ who: 'WATCHTOWER', text: 'Both transformers are down. Backup generator just kicked in, and every guard on that mountain saw the flash. Kill the generator.' }],
        onComplete: ['alarm'] },
      { type: 'interact', text: 'Shut down the backup generator inside the station', target: [25, 0, -17], label: 'shut down the backup generator', duration: 4,
        doneSay: [{ who: 'WATCHTOWER', text: 'Facility 6 just went dark. The vault doors are failing open.' }] },
      { type: 'defend', text: 'Hold the station until the doors are fully open', target: [25, -12], radius: 14, time: 45 },
      { type: 'extract', text: 'Exfil to the treeline', target: [-48, 58], radius: 7 },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'The doors are open. Hart\'s launch window opens in under an hour, and Vasko is down there with her.' },
      { who: 'REYES', text: 'Everyone we have. Everything we have. We go down into that vault tonight.' },
    ],
  },
  // ------------------------------------------------------------------ 8
  {
    id: 'm8', title: 'Zero Hour', map: 'blacksite', lighting: 'indoor', weather: 'none',
    location: 'FACILITY 6 — LAUNCH VAULT, SUB-LEVEL NINE', time: 'DAY 9 — 23:51 LOCAL',
    summary: 'HALCYON fires in ten minutes. Shut down the three terminals that talk to the satellites, defeat Vasko\'s guardian and arrest Vasko himself.',
    recap: 'With the mountain power cut, the vault doors under Facility 6 are open. Inside, Hart and Vasko are minutes from firing HALCYON with the real key.',
    goal: 'Before the countdown hits zero, shut down the three terminals that send the launch order. Then defeat Goliath and arrest Anton Vasko.',
    loadout: { primary: 'vx4', secondary: 'raptor', lethal: 'semtex', tactical: 'flash', attachments: { vx4: { optic: 'acog', muzzle: 'compensator', underbarrel: 'vgrip', magazine: 'extended' } } },
    start: { pos: [-39.5, 0], yaw: -Math.PI / 2 },
    squad: SQUAD_FULL,
    timer: 600,
    timerText: 'HALCYON LAUNCH',
    briefing: [
      { who: 'WATCHTOWER', text: 'HALCYON is warming up. The launch order goes up through three terminals: in the servers, the lab and the control room. Shut down all three and the satellites never hear it.' },
      { who: 'VASKO', text: '(intercepted) You are late, Captain. In ten minutes the world will learn what balance really means.' },
      { who: 'REYES', text: 'Ten minutes is plenty. ORION — this is it. We go now.' },
    ],
    groups: {
      west: { units: [{ pos: [-17, 4], weapon: 'rk74' }, { pos: [-15, -5] }, { pos: [-19, 9], weapon: 'breaker' }, { pos: [-18, -10] }] },
      atrium: { units: [{ pos: [-4, 6], weapon: 'juggernaut' }, { pos: [5, -5] }, { pos: [6, 6], weapon: 'rk74' }, { pos: [-6, -6] }, { pos: [0, -15], weapon: 'havoc' }, { pos: [0, 15] }] },
      servers: { spawnOn: 2, units: [{ pos: [-30, 20] }, { pos: [-24, 32], weapon: 'breaker' }, { pos: [-35, 31], weapon: 'rk74' }] },
      lab: { spawnOn: 3, units: [{ pos: [22, 20] }, { pos: [31, 33], weapon: 'havoc' }, { pos: [26, 18], role: 'heavy', weapon: 'juggernaut' }, { pos: [34, 22] }] },
      control: { spawnOn: 4, units: [{ pos: [22, -20] }, { pos: [31, -31], weapon: 'rk74' }, { pos: [34, -22], weapon: 'wasp' }, { pos: [24, -34], role: 'heavy', weapon: 'juggernaut' }] },
      goliath: { spawnOn: 5, units: [{ pos: [0, 28], role: 'boss', name: 'Goliath', health: 2200, weapon: 'juggernaut' }, { pos: [-6, 18], weapon: 'rk74' }, { pos: [6, 18], weapon: 'havoc' }] },
    },
    objectives: [
      { type: 'goto', text: 'Push to the central atrium', target: [-14, 0], radius: 5 },
      { type: 'eliminate', text: 'Clear the atrium', groups: ['west', 'atrium'] },
      { type: 'interact', text: 'Kill uplink terminal A (servers)', target: [-27, 0, 26], label: 'shut down terminal A', duration: 4,
        doneSay: [{ who: 'TEX', text: 'Terminal A offline. Two to go.' }] },
      { type: 'interact', text: 'Kill uplink terminal B (lab)', target: [27, 0, 30], label: 'shut down terminal B', duration: 4,
        doneSay: [{ who: 'HART', text: '(over PA) You don\'t understand what you\'re stopping! Nobody would ever start a war again!' }] },
      { type: 'interact', text: 'Kill uplink terminal C (control)', target: [27, 0, -28], label: 'shut down terminal C', duration: 4,
        doneSay: [{ who: 'WATCHTOWER', text: 'All three terminals are down. The satellites cannot hear them. Wait... massive heat signature in the containment wing.' }, { who: 'VASKO', text: 'Goliath. Show them.' }] },
      { type: 'cutscene', shots: [
        { from: [0, 2.6, 12], to: [0, 2.4, 15], look: [0, 1.8, 28], dur: 3.5, spawn: ['goliath'],
          say: [{ who: 'WATCHTOWER', text: 'Massive heat signature in the vault. Vasko kept his guardian on a leash. It just came off.' }] },
      ] },
      { type: 'boss', text: 'Defeat Goliath', group: 'goliath', bossName: 'GOLIATH',
        say: [{ who: 'REYES', text: 'That armor\'s rated for fifty-cal. Hit the joints! Semtex, flashbangs, everything!' }] },
      { type: 'interact', text: 'Detain Anton Vasko', target: [9.5, 0, 33], label: 'detain Anton Vasko', duration: 3, vasko: true,
        say: [{ who: 'HATCH', text: 'Cell three. He\'s hiding in a cage he built for someone else.' }],
        doneSay: [{ who: 'VASKO', text: 'You think this ends with me? Balance always returns, Sergeant.' }, { who: 'REYES', text: 'Not today. Watchtower — mission complete. Package secured.' }] },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'The HALCYON satellites were steered safely into the Pacific at 0400. The key is in our hands. Anton Vasko is in custody.' },
      { who: 'WATCHTOWER', text: 'But Dr. Lena Hart got out through a service tunnel, with a laptop holding the last copy of the launch codes. Three weeks later, we found her.' },
      { who: 'REYES', text: 'She is hiding in Vel Harat, with what is left of MERIDIAN. Then we go and get her. Quietly.' },
    ],
  },
  // ------------------------------------------------------------------ 9
  {
    id: 'm9', title: 'Quiet Hours', map: 'downtown', lighting: 'night', weather: 'none',
    location: 'VEL HARAT — OLD QUARTER', time: 'DAY 31 — 03:40 LOCAL',
    summary: 'Capture Dr. Hart, the last person who could ever rebuild HALCYON, in a quiet night raid on her hideout. Save the hostages she is hiding behind.',
    recap: 'Vasko is in custody and the satellites are gone. Only Dr. Hart is left, with the last copy of the launch codes, hiding in a Vel Harat apartment block.',
    goal: 'Raid her hideout without making a sound: stack on the door, pick the lock, clear it room by room, free the hostages and arrest Hart.',
    loadout: { primary: 'viper', secondary: 'p11', lethal: 'frag', tactical: 'flash', attachments: { viper: { muzzle: 'suppressor', optic: 'holo', underbarrel: 'laser' }, p11: { muzzle: 'suppressor' } } },
    loadoutNote: 'Quiet kit: suppressed K-45 Viper and P-11, lock picks, flashbangs for the rooms. The squad carries suppressed weapons too. Nobody hears your team\'s shots, and one headshot drops a man.',
    kitHint: 'Crouch to move quietly  ·  V from behind: silent takedown  ·  Y: squad radio  ·  hold E: pick the lock, cut ties, cuff',
    start: { pos: [6.7, 33.4], yaw: 0 },
    // In by van down the cross street, lights off, to the kerb a block north of the
    // safehouse; out of the side door and down the wall to the corner.
    van: {
      path: [[5.2, 70], [5.2, 52], [5.0, 41], [4.8, 33]],
      exit: [6.7, 33.4], exitYaw: 0,
      spots: [[7.7, 30.6], [6.2, 27.6], [7.7, 24.6]],
      lines: [
        { t: 0.8, who: 'REYES', text: '(low) Lights off from here. One block.' },
        { t: 4.8, who: 'HATCH', text: 'Street\'s dead. Two on her door, one walking the block.' },
        { t: 9.2, who: 'REYES', text: 'This is us. Out the side, spread out on the wall, and slow.' },
      ],
    },
    squad: [
      { name: 'Reyes', weapon: 'rk74', suppressed: true },
      { name: 'Hatch', weapon: 'rk74', suppressed: true },
      { name: 'Tex', weapon: 'rk74', suppressed: true },
    ],
    stealth: true,
    silentShots: true, // the team's gunfire makes no noise the enemy can hear
    headshotKills: true, // any headshot on an enemy kills him outright
    squadLeash: 7,
    alarmGroup: 'response',
    alarmTimer: 60,
    timerText: 'HOSTAGES',
    timerFail: ['The hostages were executed.', 'They heard ORION coming. Crouch, stay suppressed and take them from behind.'],
    // The safehouse: the ground floor of the brick block on the north-east corner,
    // partitioned into a hallway, a bedroom where the hostages are held and an office.
    doors: { south: { x: 13, z: 14.15, w: 1.7, h: 2.35, axis: 'x', out: -1 } },
    civilians: [{ pos: [9.5, 23.0], yaw: Math.PI * 0.85 }, { pos: [11.6, 23.1], yaw: -Math.PI * 0.85 }],
    build(b) {
      b.keepClear(8, 14, 24, 24);
      const h = 3.05, t = 0.15;
      b.wall('x', 8.3, 23.7, 18.8, 0, h, t, 'plaster', [{ at: 11.2, w: 1.1, top: 2.2 }, { at: 19.5, w: 1.1, top: 2.2 }]);
      b.wall('z', 18.95, 23.7, 15.8, 0, h, t, 'plaster', [{ at: 21.3, w: 1.0, top: 2.2 }]);
      b.box(8.15, 0, 21, 0.5, 2.4, 1.8, 'woodDark'); // back door, barricaded from inside
      // Hallway: living area and kitchen.
      b.box(10.2, 0, 15.0, 2.2, 0.8, 0.85, 'fabric');
      b.box(10.2, 0, 16.4, 1.2, 0.45, 0.6, 'wood');
      b.box(17.4, 0, 16.6, 1.8, 0.76, 1.0, 'wood');
      b.box(16.3, 0, 16.6, 0.45, 0.9, 0.45, 'woodDark');
      b.box(18.5, 0, 16.6, 0.45, 0.9, 0.45, 'woodDark');
      b.box(21.6, 0, 18.35, 1.6, 0.92, 0.6, 'tiles');
      b.box(8.6, 0, 17.0, 0.5, 1.8, 1.4, 'woodDark');
      // Bedroom: beds and a wardrobe.
      b.box(13.6, 0, 22.7, 1.8, 0.55, 1.9, 'fabric');
      b.box(8.7, 0, 19.6, 0.6, 2.0, 1.2, 'woodDark');
      // Office: desk and filing cabinets.
      b.box(21.0, 0, 23.0, 1.8, 0.76, 0.8, 'wood');
      b.box(23.2, 0, 19.6, 0.5, 1.3, 0.9, 'metalDark');
      b.box(23.2, 0, 20.6, 0.5, 1.3, 0.9, 'metalDark');
      // Low warm lamps inside, and the team van.
      b.light(12, 2.8, 16.5, 0xffc890, 7, 9);
      b.light(11.5, 2.8, 21.5, 0xffb070, 5, 7);
      b.light(19.5, 2.8, 21.5, 0xfff0d0, 6, 8);
      b.world.add(3.8, 0, 30.35, 5.8, 2.35, 35.65, 'metal'); // the team van, parked at the kerb
      b.patrol('safehouse', [[6, 11.2], [22, 11.2]]);
    },
    briefing: [
      { who: 'WATCHTOWER', text: 'Dr. Lena Hart is hiding on the ground floor of the brick block on the north-east corner. Her laptop has the last copy of the launch codes.' },
      { who: 'WATCHTOWER', text: 'They are holding the building\'s tenants as a shield. If they hear you coming, the hostages die.' },
      { who: 'REYES', text: 'Suppressed weapons, lock picks, hand signals. We clear it room by room and nobody on that street wakes up.' },
    ],
    groups: {
      street: { units: [{ pos: [12.2, 11.6] }, { pos: [18, 11.2], patrol: 'safehouse' }] },
      hall: { units: [{ pos: [17.6, 15.4] }, { pos: [21.0, 16.2], weapon: 'wasp' }] },
      bedroom: { units: [{ pos: [13.8, 20.1] }, { pos: [10.1, 20.0], weapon: 'rk74' }] },
      office: { units: [{ pos: [17.3, 22.8], weapon: 'breaker' }] },
      response: { spawnOn: 'alarm', hunter: true, units: [{ pos: [44, 10], weapon: 'rk74' }, { pos: [40, -8] }, { pos: [-14, 12] }, { pos: [20, 40] }, { pos: [32, 28], weapon: 'breaker' }] },
    },
    objectives: [
      { type: 'goto', text: 'Move up to the corner of the block — quietly', target: [2, 12.5], radius: 2.5,
        say: [{ who: 'REYES', text: 'Comms quiet from here. Hand signals. Wraith, you have point. Crouch and keep it slow.' }] },
      { type: 'eliminate', text: 'Take down the two sentries without a sound', groups: ['street'],
        say: [{ who: 'HATCH', text: 'Two on the door, one walking the block. From behind, or one suppressed round each.' }] },
      { type: 'goto', text: 'Stack up on the south door', target: [13.2, 13.2], radius: 1.0,
        stack: [[11.7, 13.5], [11.1, 13.3], [10.5, 13.5]], stackYaw: -Math.PI / 2,
        say: [{ who: 'TEX', text: '(whisper) Stacked on the door. It\'s locked. Your call.' }] },
      { type: 'interact', text: 'Pick the lock', target: [13.6, 0, 13.6], label: 'pick the lock', duration: 5, door: 'south',
        doneSay: [{ who: 'REYES', text: '(whisper) We\'re in. Slow is smooth. Two in the hall.' }] },
      { type: 'eliminate', text: 'Clear the hallway', groups: ['hall'], squadFollow: true,
        say: [{ who: 'HATCH', text: '(whisper) Left man\'s yours. I\'ve got the kitchen.' }] },
      { type: 'goto', text: 'Stack on the bedroom door', target: [11.2, 17.9], radius: 0.9,
        stack: [[10.2, 18.15], [9.6, 18.15], [12.3, 18.15]], stackYaw: Math.PI,
        say: [{ who: 'REYES', text: '(whisper) Hostages are in there with two guards. Flash it or go in quiet. On you.' }] },
      { type: 'eliminate', text: 'Clear the bedroom — don\'t hit the hostages', groups: ['bedroom'], squadFollow: true },
      { type: 'interact', text: 'Cut the hostages free', target: [10.6, 0, 21.9], label: 'cut the hostages free', duration: 3, freeCivilians: true, stopTimer: true,
        doneSay: [{ who: 'HOSTAGE', text: 'Thank you... thank you. She is in the office. She has a gun.' }, { who: 'TEX', text: 'Stay down. You\'re safe now.' }] },
      { type: 'eliminate', text: 'Clear the office', groups: ['office'],
        say: [{ who: 'REYES', text: '(whisper) One bodyguard and Hart. I want her breathing.' }] },
      { type: 'interact', text: 'Detain Dr. Lena Hart', target: [19.6, 0, 21.6], label: 'detain Dr. Hart', duration: 3, detainee: 'civilian',
        say: [{ who: 'HART', text: 'Don\'t shoot! I\'m not armed. I\'m not armed!' }],
        doneSay: [{ who: 'HART', text: 'You have no idea what you have just done.' }, { who: 'REYES', text: 'We\'ll talk about it on the plane, Doctor. Hatch, she\'s yours.' }] },
      { type: 'extract', text: 'Get back to the van', target: [6.8, 32.6], radius: 3.5,
        say: [{ who: 'WATCHTOWER', text: 'Street is still asleep. Clean work, ORION. Bring them home.' }] },
    ],
    outro: [
      { who: 'WATCHTOWER', text: 'Dr. Lena Hart is in custody. The last copy of the launch codes was on her laptop. It no longer exists. HALCYON is finished.' },
      { who: 'WATCHTOWER', text: 'Eleven tenants walked out of that building at dawn. None of them will ever know who you were.' },
      { who: 'REYES', text: 'Task Force ORION was never activated. None of this happened. Good work, Wraith.' },
    ],
    finale: true,
  },
];
