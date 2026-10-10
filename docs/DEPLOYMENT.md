# Deploy NEXUS ARENA melalui GitHub ke Cloudflare Workers (tanpa Render)

Panduan ini menghindari Render karena akun Anda menampilkan **Payment Information Required**. Proyek ini telah diubah untuk memakai Cloudflare Workers + Durable Objects, sehingga tidak lagi memerlukan Node.js service di Render.

## 1. Masukkan source ke GitHub

1. Unduh ZIP Cloudflare Edition yang disertakan pada percakapan.
2. Buat repository baru bernama `nexus-arena` di <https://github.com/new>.
3. Unggah **isi ZIP yang sudah diekstrak**, bukan file ZIP tunggal. Susunan di halaman root GitHub harus mencakup:

   ```text
   wrangler.jsonc
   package.json
   worker/
   client/
   docs/
   .github/
   ```

4. Commit source pada branch utama (`main`). Anda tidak perlu menjalankan proyek di komputer lokal.

Jika ingin memakai browser saja dan perlu mengekstrak ZIP, gunakan GitHub Codespaces untuk menyalin file ke repository. Codespaces bukan server game dan tidak harus dipakai untuk menjalankan game.

## 2. Buat deployment Worker dari repository GitHub

1. Buka <https://dash.cloudflare.com/> dan login/daftar.
2. Pastikan menggunakan paket **Workers Free**. Jangan memilih upgrade berbayar.
3. Buka **Workers & Pages**.
4. Cari tindakan **Create** lalu opsi untuk menghubungkan repository Git, misalnya **Connect to Git**. Cloudflare sesekali mengubah label menu.
5. Hubungkan akun GitHub dan beri akses hanya ke repository `nexus-arena` bila diminta.
6. Pilih repository dan branch `main`.
7. Atur konfigurasi build berikut:

   | Kolom | Isi |
   |---|---|
   | Root directory | Kosong / root repository |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |

8. Pastikan `wrangler.jsonc` terdeteksi dari root repository. File ini mendefinisikan Worker, static assets, Durable Object bindings, dan migrasi SQLite-backed Durable Objects.
9. Simpan lalu deploy. Build berjalan di infrastruktur Cloudflare.

Dokumentasi resmi: <https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/> dan <https://developers.cloudflare.com/durable-objects/get-started/>.

## 3. Periksa hasil deploy

Cloudflare akan memberikan hostname seperti `https://nexus-arena.<subdomain-akun>.workers.dev`. Hostname aktual ditentukan oleh akun Anda; jangan menyalin contoh sebagai URL aktual.

1. Buka hostname Worker.
2. Buka `https://HOST-AKTUAL/health`.
3. Respons yang diharapkan:

   ```json
   {"ok":true,"service":"nexus-arena-cloudflare","multiplayer":"durable-objects"}
   ```

4. Jika `/health` gagal, buka **Workers & Pages → Worker → Deployments/Builds → Logs** dan periksa kesalahan terbaru.
5. Setelah status deploy sukses, buka URL Worker utama. Frontend dan `/api/*` disajikan oleh Worker yang sama; tidak perlu mengisi `VITE_SERVER_URL`.

## 4. Bermain bersama teman

1. Buka Worker URL.
2. Masukkan nama pemain.
3. Klik **Buat Room Privat** dan salin kode 6 karakter.
4. Minta teman membuka URL Worker yang sama, mengisi nama, memasukkan kode, lalu memilih **Gabung Room**.
5. Minimal dua pemain harus bergabung dan menekan **Saya Siap** untuk memulai pertandingan.
6. Untuk bermain dari HP, gunakan browser modern dengan WebGL dan koneksi internet yang stabil.

## 5. Jika menu Connect to Git tidak terlihat

Cloudflare memperbarui dashboard secara berkala. Buka dokumentasi integrasi GitHub untuk Workers Builds: <https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/>. Pastikan Anda membuat **Worker dengan Git integration**, bukan hanya proyek Pages statis yang tidak memiliki script Durable Objects.

## 6. Jika deploy/build gagal

- **Cannot find `wrangler.jsonc`:** root directory bukan root repository atau file tidak di-commit.
- **Durable Object binding / migration error:** pastikan `wrangler.jsonc` ada persis seperti dalam paket dan deployment dilakukan oleh `npx wrangler deploy`.
- **Cannot resolve `three`:** `npm run build` harus menjalankan instalasi `client` dan Vite build; jangan gunakan build command `npm run build` dari subfolder `client` saja.
- **Build berhasil, game tidak dapat connect:** cek `/health`, lalu tab Console browser dan Worker logs. WebSocket menggunakan path `/api/connect` pada hostname Worker yang sama.
- **Kode room tak ditemukan:** pastikan kode lengkap enam karakter, tanpa spasi; room dibuat oleh Worker aktif yang sama.
- **Kuota gratis terlampaui:** Durable Objects pada Workers Free memiliki kuota harian. Setelah kuota terlampaui, operasi terkait bisa gagal sampai reset. Jangan upgrade paket jika batas Rp0 adalah keharusan.

## 7. Biaya dan batasan

Cloudflare menyebut kuota Durable Objects Free berupa 100.000 request/hari dan 13.000 GB-s/hari (duration GB-seconds) per akun, dengan rincian khusus untuk WebSocket messages. Penggunaan yang melewati batas gratis dapat ditolak; tidak berarti game bisa dimainkan tanpa batas. Detail terbaru ada di <https://developers.cloudflare.com/durable-objects/platform/pricing/>.

Paket ini menargetkan Rp0 menggunakan layanan Free. Tidak ada jaminan uptime, latency, maupun kapasitas trafik tanpa batas. Deployment belum dianggap berhasil sampai Worker tampil aktif pada akun Anda dan room telah dicoba melalui URL publik.
