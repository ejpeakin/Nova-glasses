// Collect every spoken line in the game, by speaker, in a stable order.
import fs from 'fs';
// Run from tools/voice with a copy of src/campaign/Story.js saved as story.mjs.
import { MISSIONS } from './story.mjs';
const src = (p) => fs.readFileSync('/home/user/ejnickgameoftheyear/' + p, 'utf8');
const out = []; // { speaker, text, where }
const add = (speaker, text, where) => {
  if (!text) return;
  const sp = String(speaker).toUpperCase();
  if (sp === 'YOUR JOB') return;
  if (out.some((l) => l.speaker === sp && l.text === text)) return;
  out.push({ speaker: sp, text, where });
};
// Opening film narration.
const film = src('src/campaign/StoryFilm.js');
const L = film.slice(film.indexOf('const LINES = {'), film.indexOf('};', film.indexOf('const LINES = {')) + 2);
const LINES = eval('(' + L.replace('const LINES = ', '') .replace(/;\s*$/, '') + ')');
for (const [shot, ls] of Object.entries(LINES)) for (const [, t] of ls) add('NARRATOR', t, `film:${shot}`);
// Missions.
for (const m of MISSIONS) {
  const w = m.id;
  for (const l of m.briefing ?? []) add(l.who, l.text, `${w}:briefing`);
  for (const l of m.insertion?.lines ? Object.values(m.insertion.lines).flat() : []) if (l?.who) add(l.who, l.text, `${w}:insertion`);
  for (const l of m.van?.lines ?? []) add(l.who, l.text, `${w}:van`);
  (m.objectives ?? []).forEach((o, i) => {
    for (const l of o.say ?? []) add(l.who, l.text, `${w}:obj${i}`);
    for (const l of o.doneSay ?? []) add(l.who, l.text, `${w}:obj${i}:done`);
    for (const sh of o.shots ?? []) for (const l of sh.say ?? []) add(l.who, l.text, `${w}:obj${i}:clip`);
  });
  for (const s of m.cqb?.startle ?? []) if (s.say) add('CIVILIAN', s.say, `${w}:cqb`);
  for (const s of m.cqb?.surrender ?? []) add(s.who ?? 'SUSPECT', s.line ?? "Don't shoot! Don't shoot! I give up!", `${w}:cqb`);
  for (const l of m.outro ?? []) add(l.who, l.text, `${w}:outro`);
}
// Lines written in code: hud.say([{ who: 'X', text: 'Y' }]) in modes.
for (const f of ['src/modes/CampaignMode.js', 'src/modes/CloseQuarters.js', 'src/modes/Insertion.js', 'src/modes/VanInsertion.js']) {
  const s = src(f);
  for (const m of s.matchAll(/who:\s*'([A-Z ]+)'\s*,\s*text:\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1], m[2].replace(/\\'/g, "'"), f);
  const lead = s.match(/const lines = \[((?:'(?:[^'\\]|\\.)*',?\s*)+)\]/);
  if (lead && f.includes('CampaignMode')) for (const m of lead[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) add('REYES', m[1].replace(/\\'/g, "'"), 'lead:slow');
}
// Squad radio: your orders and their replies; HQ on a solo net.
const comms = src('src/player/Comms.js');
for (const m of comms.matchAll(/say: \[([^\]]*)\], reply: \[([^\]]*)\]/g)) {
  for (const t of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) add('WRAITH', t[1], 'comms:order');
  for (const t of m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)) add('SQUAD', t[1], 'comms:reply');
}
for (const t of ["Hold fire! Weapons tight.", "Weapons free!"]) add('WRAITH', t, 'comms:order');
for (const t of ['Weapons tight.', 'Holding fire.', 'Copy, on your shot.', 'Weapons free!', 'Copy, weapons free!', 'Engaging!']) add('SQUAD', t, 'comms:reply');
for (const t of ["Negative, Orion. You're on your own out there.", "No friendlies on this net. You're solo."]) add('WATCHTOWER', t, 'comms:solo');
// Battle callouts.
for (const t of ['Contact front!', 'Reloading!', 'Changing mags!', 'Cover me, reloading!', 'Frag out!']) add('SQUAD', t, 'callout');
for (const t of ['Contact!', 'There! Enemy!', 'Intruder!', 'Reloading!', 'Cover me!', 'Changing mag!', 'Granata!', 'GRENADE!', 'Man down!', 'Body here!', 'We have a man down!']) add('ENEMY', t, 'callout');
fs.writeFileSync('lines.json', JSON.stringify(out, null, 1));
const by = {};
for (const l of out) (by[l.speaker] ??= { n: 0, c: 0 }), by[l.speaker].n++, by[l.speaker].c += l.text.length;
console.log(out.length, 'lines', out.reduce((a, l) => a + l.text.length, 0), 'chars');
console.log(Object.entries(by).sort((a, b) => b[1].c - a[1].c).map(([k, v]) => `${k}:${v.n}/${v.c}`).join('  '));
