// ==========================================
// CO-OP DIFFICULTY
// Bosses get more HP, hit harder and use a SPECIAL SKILL in multiplayer.
// The tier is the number of players when the host started the game
// (it goes up if more people join later, never down).
//
//            boss HP   boss damage   special skill every
//   solo      x1.0       x1.00        (no special skill)
//   2 players x1.8       x1.20        16 s
//   3 players x2.4       x1.30        13 s
//   4 players x3.0       x1.45        10 s  (+ the strongest version)
// ==========================================

export const DIFFICULTY = {
  1: { players: 1, label: 'SOLO',      hp: 1.0, damage: 1.0,  skills: false, skillCooldown: 0,  skillLevel: 0 },
  2: { players: 2, label: '2 PLAYERS', hp: 1.8, damage: 1.2,  skills: true,  skillCooldown: 16, skillLevel: 2 },
  3: { players: 3, label: '3 PLAYERS', hp: 2.4, damage: 1.3,  skills: true,  skillCooldown: 13, skillLevel: 3 },
  4: { players: 4, label: '4 PLAYERS', hp: 3.0, damage: 1.45, skills: true,  skillCooldown: 10, skillLevel: 4 }
};

export const MAX_PLAYERS = 4;

export function difficultyFor(players) {
  const count = Math.max(1, Math.min(MAX_PLAYERS, Math.round(Number(players) || 1)));
  return DIFFICULTY[count];
}

// Short text for the lobby.
export function describeDifficulty(players) {
  const d = difficultyFor(players);
  if (!d.skills) return 'SOLO · NORMAL BOSSES';
  return `${d.label} · BOSS HP x${d.hp.toFixed(1)} · BOSS DAMAGE x${d.damage.toFixed(2)} · SPECIAL SKILL EVERY ${d.skillCooldown}s`;
}
