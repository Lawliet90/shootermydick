// GameState: the single home for round/match/economy/objective state.
// Modes: 'comp' (competitive 5v5, Terrorists vs Police, plant/defuse) and
// 'dm' (deathmatch, free-for-all, respawns, first to 20 kills / 5:00).
// Competitive phases: menu → buy → live → roundEnd → buy … → matchEnd
// Deathmatch phases: menu → live (respawns) → matchEnd
export function createGame() {
  const g = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    mode: 'comp', // 'comp' | 'dm'
    paused: false,
    round: 1,
    wins: { vanguard: 0, jackal: 0 },
    timer: 120,
    buyTimer: 35,
    money: 800,
    kills: 0, deaths: 0,
    planted: false,
    plantSite: null, // 'alpha' | 'beta'
    fuse: 0,         // seconds left on the planted charge
    plantBeepT: 0,
    carrierId: -1,
    roundReason: '',
    roundWinner: null,
    matchWinner: null,
    time: 0, // total sim time (s), drives cooldowns
    muted: false,
    // Deathmatch state: kills per agent id ('player' + bot ids), match timer.
    dmKills: {},
    dmTimer: 300,
    dmTarget: 20,
    dmWinner: null,
  };

  function startMatch(mode = 'comp') {
    g.mode = mode;
    g.round = 1;
    g.wins.vanguard = 0; g.wins.jackal = 0;
    g.money = 800; g.kills = 0; g.deaths = 0;
    g.matchWinner = null;
    g.planted = false; g.plantSite = null; g.fuse = 0;
    g.dmKills = {}; g.dmTimer = 300; g.dmWinner = null;
    if (mode === 'dm') {
      // Deathmatch opens on the loadout screen (30 s, everything free);
      // the round itself starts from the buy-phase branch in main.js.
      g.phase = 'buy';
      g.buyTimer = 30;
    } else {
      startBuy(35);
    }
  }
  // Competitive buy phase: 35 s before round 1, 15 s between rounds.
  function startBuy(duration = 15) {
    g.phase = 'buy';
    g.buyTimer = duration;
    g.planted = false; g.plantSite = null; g.fuse = 0;
    g.roundWinner = null; g.roundReason = '';
  }
  function startRound() {
    g.phase = 'live';
    g.timer = 120;
    g.planted = false; g.plantSite = null; g.fuse = 0;
  }
  function endRound(winner, reason) {
    if (g.phase === 'roundEnd' || g.phase === 'matchEnd') return null;
    g.roundWinner = winner;
    g.roundReason = reason;
    g.wins[winner] += 1;
    const won = winner === 'vanguard';
    g.money += won ? 300 : 150;
    if (g.wins.vanguard >= 5 || g.wins.jackal >= 5 || g.round >= 9) {
      g.phase = 'matchEnd';
      g.matchWinner = g.wins.vanguard > g.wins.jackal ? 'vanguard' : 'jackal';
      return 'match';
    }
    g.phase = 'roundEnd';
    g.round += 1;
    return 'round';
  }
  function awardKill() { g.kills += 1; g.money += 300; }
  function awardPlant() { g.money += 300; }
  function onPlanted(site) {
    g.planted = true; g.plantSite = site; g.fuse = 45; g.phase = 'live';
  }
  function spend(cost) {
    if (g.money < cost) return false;
    g.money -= cost;
    return true;
  }
  // Deathmatch: record a kill for an agent id; returns 'player' | bot id |
  // 'time' when the match ends, else null.
  function dmAward(killerId) {
    g.dmKills[killerId] = (g.dmKills[killerId] || 0) + 1;
    if (killerId === 'player') { g.kills += 1; }
    if (g.dmKills[killerId] >= g.dmTarget) {
      g.dmWinner = killerId;
      g.phase = 'matchEnd';
      g.matchWinner = killerId === 'player' ? 'vanguard' : 'jackal';
      return killerId;
    }
    return null;
  }
  function dmEndOnTime() {
    // Highest kills wins; the player wins ties (they fought the whole yard).
    let best = 'player'; let bestK = g.dmKills.player || 0;
    for (const [id, k] of Object.entries(g.dmKills)) {
      if (k > bestK) { best = id; bestK = k; }
    }
    g.dmWinner = best;
    g.phase = 'matchEnd';
    g.matchWinner = best === 'player' ? 'vanguard' : 'jackal';
    return best;
  }
  return { g, startMatch, startBuy, startRound, endRound, awardKill, awardPlant, onPlanted, spend, dmAward, dmEndOnTime };
}
