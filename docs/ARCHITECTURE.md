# Architecture — NEXUS ARENA

## Components

- **Client:** Vite + Three.js + `colyseus.js`. Menggambar scene, menerima input, membuat UI dan menginterpolasi pemain lain.
- **Game server:** Node.js + Colyseus. Room menyimpan state pemain, fase pertandingan, timer, input terkini dan hasil.
- **Hosting:** Render Blueprint creates one free Node Web Service and one free Static Site (subject to plan availability and platform quotas).

## Authority

Client sends movement intentions (`x`, `z`, `jump`, `sprint`, sequence). Server clamps and rate-limits values, simulates movement, collisions, gaps, checkpoints, falls and finish events. Client-supplied positions and finish times are never accepted as authoritative facts.

## Protocol

- `input`: client -> server; movement axes, jump/sprint booleans and monotonically increasing sequence number.
- `ready`: client -> server; ready toggle.
- `rematch`: client -> server; request another match after results.
- `respawn`: server -> relevant client; notification after fall reset.
- Synchronized state: phase, elapsed time, countdown and map of player display state.

## Room types

- `arena`: public matchmaking through `joinOrCreate`.
- `private_arena`: room creation and joining by room ID; not part of quick-match pool.

Both have an eight-client maximum.

## Known MVP limitations

- No permanent accounts or durable statistics.
- Free host may sleep/restart; disconnected players are removed, not seamlessly resumed.
- Input is basic server-authoritative but not a hardened anti-cheat implementation.
- The procedural collision layout is intentionally simple. Improve collision shapes and performance after real device tests.
