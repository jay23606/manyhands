# Manyhands

A small world, shaped together. A minimalist isometric god-game prototype for the browser and home screen.

**[Play Manyhands](https://jay23606.github.io/manyhands/)**

## Play

- Left-click or drag to apply the selected power; Raise is selected initially.
- Right-click or drag always lowers terrain.
- Hold Space and drag (or middle-drag) to pan; scroll to zoom; `0` recenters.
- On mobile, choose Raise/Lower and paint with one finger. Two fingers pan and pinch to zoom.
- Keys `1`–`6` select Raise, Lower, Forest, Settle, Shrine, and Bless.
- Level land upgrades huts into cottages, manors, and citadels. Larger homes grow faster; full homes send visible settlers along walkable paths to clear level ground. More followers and shrines generate more faith.
- Sculpt directly beneath buildings. They move with the ground; lowering them into the sea floods them.

The initial island works immediately, without an account or backend. It saves on this device and pauses when the tab is hidden. Clearing browser storage deletes that local island.

## Shared worlds and voice

Shared play requires a Supabase project. Until configured, **Play together** explains the setup rather than pretending other players are connected.

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. Enable anonymous sign-ins in Supabase Authentication.
3. Put the project URL and **publishable/anon key** in GitHub repository **Settings → Secrets and variables → Actions → Variables** as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run the **Publish Manyhands** workflow again. Alternatively, enter the public values in the game's connection settings for a device-local setup.
5. Enter the same island name on two devices. Island names use lowercase letters, numbers, and hyphens. A link with `?island=your-name` opens that island's join dialog.
6. Each player explicitly enables voice and grants microphone permission. Voice is island-wide and uses the existing [`@jay23606/foyer`](https://github.com/jay23606/foyer) media mesh, also used by Netquake.

Never use a Supabase service-role or secret key in the frontend. Build-time `VITE_` values are public. The database is protected by revoked direct table access, row-level security, and narrowly granted security-definer functions that validate actions and costs.

### When time runs

Active, visible clients request a step every four seconds. A database row lock and timestamp allow only one step per interval, regardless of visitor count. A step always advances **one** day; it never catches up elapsed offline time. With no visible connected clients, no steps occur. No dedicated game server, cron, or host election is required.

The client animates villagers locally; only terrain, faith, population, migrating settlers, and history are authoritative. This intentionally avoids sending per-frame movement through Supabase. Edits trigger a Realtime broadcast so other visitors can fetch the new authoritative state. Periodic ticks also repair missed broadcasts.

### Voice connectivity

STUN is configured by default. Some mobile/carrier/corporate networks require TURN. Optional build configuration:

```text
VITE_TURN_URL=turn:your-relay.example:3478
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

These credentials reach the browser even if supplied through GitHub Secrets. Use restricted, short-lived TURN credentials for a public deployment; a credential-issuing endpoint is not included. Voice is a peer mesh, so this prototype is intended for small groups, not unlimited simultaneous microphones. Public island names are not access controls; moderation and authenticated private signaling are future hardening work.

## PWA

Install from the browser's install menu, or Safari → Share → Add to Home Screen on iOS. The build generates a versioned service worker that precaches the complete local app shell and icons. Solo play works offline after the first successful load; shared edits and voice require connectivity. Updates offer an explicit reload instead of interrupting a session. Remote fonts are optional; system fonts work offline.

## Development

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite is a build/dev tool only. `dist/` is plain static output, compatible with GitHub Pages subpaths. The GitHub Actions workflow tests, builds, and publishes it. Set Pages to **GitHub Actions** as its source.

```text
src/world.js        pure local simulation and action rules
src/render.js       Canvas renderer, human sprites, camera, pointer gestures
src/network.js      Supabase authoritative-state adapter + foyer voice
src/main.js         UI and session lifecycle
src/pwa.js          installation, offline notices, update flow
src/style.css       responsive game interface
supabase/schema.sql server-side world rules and permissions
scripts/build-sw.js generated precache manifest
public/             install manifest and icons
tests/              simulation, database, and browser checks
```

Structure draws on Worktrade's modular static/PWA approach and Netquake's Vite + Supabase + foyer separation. No game code/assets were copied from Populous or Netquake.

## Validation and current scope

`npm test` exercises simulation rules and the actual SQL schema in embedded Postgres (PGlite), including table permissions, invalid edits, tick throttling, persistence across visitors, and no offline catch-up. `npm run test:browser` uses Playwright with Edge against a dev server on port 5173 for terrain interactions, mouse/touch controls, mobile layout, setup flows, and a real two-peer WebRTC audio negotiation using foyer with local signaling.

This is a playable prototype, not a complete civilization simulator: there is no rival AI, combat, rally command, diplomacy, trade, public island directory, or moderation system yet. The current progression goals introduce settlement growth, migration, and building upgrades. Without a configured Supabase project, cross-device persistence and real-network voice cannot be end-to-end verified. The SQL tests do not substitute for that deployment check.
