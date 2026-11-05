import fs from 'fs';
const lines = JSON.parse(fs.readFileSync('lines.json', 'utf8'));
const META = {
  NARRATOR: { role: 'Opening film narrator', voice: 'Deep, measured American man in his 50s. Documentary narrator: slow, grave, no drama.' },
  WATCHTOWER: { role: 'Mission control (radio)', voice: 'Calm, clipped woman in her 40s, neutral American. Steady over the radio even when things go wrong.' },
  REYES: { role: 'ORION team leader', voice: 'Gravelly Latino-American man in his 40s. Quiet authority; low and close when sneaking.' },
  HATCH: { role: 'ORION breacher', voice: 'Dry, laconic American man in his 30s. Slightly sardonic, very calm.' },
  TEX: { role: 'ORION rifleman', voice: 'Texan man in his 30s. Loud, energetic drawl.' },
  WRAITH: { role: 'You (squad orders)', voice: 'Terse American man in his 30s. Short, firm commands.' },
  SQUAD: { role: 'Squadmates answering your orders', voice: 'Use Hatch\'s voice again (or any squadmate). Quick radio replies.' },
  PILOT: { role: 'Helicopter pilot (intercom)', voice: 'Calm American man, pilot on the intercom. Even and professional.' },
  HART: { role: 'Dr. Lena Hart', voice: 'Cold, precise woman in her 50s with a Northern European accent (Danish or Dutch).' },
  VASKO: { role: 'Anton Vasko, MERIDIAN founder', voice: 'Eastern European man in his 50s. Smooth, quiet menace.' },
  KESSLER: { role: 'Kessler, MERIDIAN commander', voice: 'German-accented man in his 50s. Hard and clipped.' },
  BRANDT: { role: 'Brandt, a nervous businessman', voice: 'Middle-aged man with a Swiss-German accent. Nervous, sweating.' },
  LEADER: { role: 'MERIDIAN cell leader, surrendering', voice: 'Frightened middle-aged man, Eastern European accent.' },
  TECHNICIAN: { role: 'Hart\'s technician, fake surrender', voice: 'Panicked man in his 30s, Eastern European accent.' },
  CIVILIAN: { role: 'Tenants in the final mission', voice: 'Terrified local tenant (man or woman), light Eastern European accent.' },
  ENEMY: { role: 'MERIDIAN fighters (shouts)', voice: 'Rough Eastern European man shouting in combat.' },
};
const ORDER = ['NARRATOR', 'WATCHTOWER', 'REYES', 'HATCH', 'TEX', 'WRAITH', 'SQUAD', 'PILOT', 'HART', 'VASKO', 'KESSLER', 'BRANDT', 'LEADER', 'TECHNICIAN', 'CIVILIAN', 'ENEMY'];
const BREAK = ' <break time="1.5s" />';
const LIMIT = 2400;
// Stage directions like "(whisper)" are not read out.
const clean = (t) => t.replace(/^\((whisper|low|whispers|quietly)\)\s*/i, '').replace(/\s*\((whisper|low)\)\s*/gi, ' ').trim();
const speakers = [];
let total = 0;
for (const sp of ORDER) {
  const ls = lines.filter((l) => l.speaker === sp);
  if (!ls.length) continue;
  const parts = [];
  let cur = [];
  let len = 0;
  for (const l of ls) {
    const t = clean(l.text);
    if (cur.length && len + t.length + BREAK.length > LIMIT) { parts.push(cur); cur = []; len = 0; }
    cur.push({ text: t, original: l.text, where: l.where, whisper: /\((whisper|low)\)/i.test(l.text) });
    len += t.length + BREAK.length;
  }
  if (cur.length) parts.push(cur);
  const slug = sp.toLowerCase();
  const outParts = parts.map((p, i) => {
    const script = p.map((l) => l.text).join(BREAK + '\n');
    total += script.length;
    return { file: `${slug}-${i + 1}.mp3`, lines: p, script, chars: script.length };
  });
  speakers.push({ speaker: sp, ...META[sp], lines: ls.length, parts: outParts });
}
const unknown = [...new Set(lines.map((l) => l.speaker))].filter((s) => !ORDER.includes(s));
if (unknown.length) console.log('UNMAPPED SPEAKERS', unknown);
const out = { version: 1, break: '1.5s', model: 'Eleven Multilingual v2', totalChars: total, files: speakers.reduce((a, s) => a + s.parts.length, 0), lines: lines.length, speakers };
fs.writeFileSync('script.json', JSON.stringify(out, null, 1));
console.log('files', out.files, 'chars', total, 'lines', out.lines);
console.log(speakers.map((s) => `${s.speaker}:${s.parts.map((p) => p.chars).join('+')}`).join('  '));
