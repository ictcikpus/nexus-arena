# Arsitektur NEXUS ARENA — Cloudflare Edition

- **Frontend**: Three.js, Vite, UI HTML/CSS. Dibangun menjadi `client/dist`.
- **Static assets**: diterbitkan melalui Workers Static Assets dari Worker yang sama.
- **RoomDirectory Durable Object**: membuat kode room, mencari public room untuk Quick Match, dan memastikan kode privat valid.
- **ArenaRoom Durable Object**: satu instance bernama untuk tiap kode room; maksimal delapan WebSocket client.
- **Game authority**: gerakan, collision rintangan, checkpoint, respawn, timer, dan hasil dihitung pada ArenaRoom.
- **Client protocol**: JSON over WebSocket untuk input dan full-state snapshots. Ini protokol milik proyek, bukan protokol Colyseus.
- **Storage**: Durable Object SQLite-backed key-value storage untuk memulihkan state room ketika object dihentikan dan diinisialisasi ulang.

## Rute

- `GET /health` — health response.
- `GET /api/resolve?mode=quick` — memilih/membuat public room.
- `GET /api/resolve?mode=create` — membuat room privat.
- `GET /api/resolve?mode=join&code=XXXXXX` — memvalidasi kode room.
- `GET /api/connect?code=XXXXXX&name=...&color=...` dengan WebSocket upgrade — menghubungkan pemain.

Semua route menggunakan hostname Worker yang sama. Karena itu frontend tidak membutuhkan setting server URL terpisah.

## Batasan

MVP ini mengirim snapshot state untuk kemudahan pengembangan. Jika jumlah pemain atau room meningkat, optimalkan snapshot/delta, input validation, telemetry, load testing, serta rate limiting. Workers Free memiliki kuota harian, jadi layanan bukan server game berkapasitas tak terbatas.
