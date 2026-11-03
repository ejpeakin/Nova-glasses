// Career ranks (by total XP) and which weapons each rank unlocks in the armory.

export const RANKS = [
  [0, 'Private'], [1500, 'Private First Class'], [4000, 'Corporal'], [8000, 'Sergeant'], [14000, 'Staff Sergeant'],
  [22000, 'Sergeant First Class'], [32000, 'Master Sergeant'], [45000, 'Second Lieutenant'], [60000, 'First Lieutenant'],
  [80000, 'Captain'], [105000, 'Major'], [135000, 'Lieutenant Colonel'], [170000, 'Colonel'],
];

export function rankOf(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const cur = RANKS[i], next = RANKS[i + 1];
  return { index: i + 1, name: cur[1], progress: next ? (xp - cur[0]) / (next[0] - cur[0]) : 1, next: next ? next[0] : null };
}

/** Name and XP needed for a 1-based rank. */
export const rankInfo = (index) => ({ index, name: RANKS[index - 1][1], xp: RANKS[index - 1][0] });

/**
 * Rank needed to draw each weapon from the armory. Standard-issue arms are open
 * to everyone; the heavier hitters come with rank. A mission's issued kit is
 * always available whatever your rank.
 */
export const WEAPON_RANK = {
  vx4: 1, wasp: 1, breaker: 1, p11: 1,
  viper: 2,
  rk74: 3, raptor: 3,
  hx30: 4,
  havoc: 5,
  specter: 6,
  juggernaut: 7,
  longbow: 8,
};
