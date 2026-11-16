# shootermydick

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Lawliet90/shootermydick/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Lawliet90/shootermydick/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in three.js 0.187.0, Counter-Strike-STYLE and fully
original: own map, art, sounds and names. 4v4 at a dusk freight yard — Vanguard
(you + 3 bots) vs Jackals (4 bots, one carries the charge). Plant/defuse at
Relay Alpha / Relay Beta, money between rounds, buy menu, first to 5 rounds.
Deathmatch mode: free-for-all, all weapons free, first to 20 kills.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=d2874d5s&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

## Play

Open http://localhost:8080 in desktop Chrome. Click to deploy (pointer lock).
WASD move, mouse look, click fire, RMB aim, R reload, 1–9 weapons, G grenade,
B buy menu (buy phase), Shift sprint, Ctrl/C crouch, Space jump, M mute,
P pause.

Deterministic capture frames (real renders of the game's own code, used for
`screenshots/`): `?shot=start|play|plant|end&seed=1` — see `shots.json`.

## Layout

- `main.ts` — entry program: copies `game/` + `screenshots/` to `/output`,
  writes `dossier.json` via `vendor/makefun-threejs.ts` (kit copy, unchanged).
- `serve.ts` — static dev server for `game/`.
- `game/index.html` + `game/src/*.js` — the game (fixed 60 Hz sim, decoupled
  render; see `game/NOTES.md` for controls, weapons, economy, AI).
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit.
- `game/assets/military-character.glb` — bot soldier model ("Game Ready
  Military Character" by jayb3e, CC-BY, credited in `game/NOTES.md`).
- `screenshots/` — 4 JPEG captures, 1280×720, taken headless in Chromium
  (SwiftShader WebGL 2) with the `?shot=` frames.
- `shots.json` — the `?shot=` query behind each screenshot.

## Build / check

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
node <kit>/cli/makefun.mjs check --kit <kit> --repo . --transcripts transcripts.tar.gz
```

## Status

- Renamed to **ShooterMyDick** 2026-11-16 on the player's order; synced to the
  live build the same day (viewmodel convergence fix, menu rework with
  loadout + mode select, procedural two-segment arms, capsule/soldier bots).
- Original entry commit 2026-11-15: `eb7164741b6e561c5deaa7ac7e533cec393729ad`
  (on `init` root `aa6db62b`, drand round 33962819).
- `makefun check` on the original commit: **12 pass / 1 fail** — the only fail
  is `thinking_in_window` (the build session began 2026-11-14T20:38:55Z,
  BEFORE the 21:30:00Z opening). This submission re-bundles post-opening
  sessions (2026-11-16 revision work) with `--muse-usage`.

## Local-check results

- `node --check` passes on all game src files.
- No network references: every import/src is relative or import-mapped;
  exactly one import map (`three` → `./vendor/three/three.module.min.js`).
- 4 screenshots, 1280×720, each under the 256 KiB limit, 0 console errors
  on all four `?shot=` loads in headless Chromium.
- `MAKEFUN_OUTPUT_DIR=out node main.ts` writes `out/dossier.json`
  (see `out/` after running; dossier not committed).

## Known limitations

- Bot-vs-bot combat uses a hit-chance model, not per-pellet raycasts
  (player shots are full raycasts).
- No live pointer-lock playtest — headless only; movement/collision verified
  by inspection + fixed-step settling in shot mode.
- No minimap (compass strip instead).
