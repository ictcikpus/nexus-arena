# NEXUS ARENA — Cloudflare Edition

NEXUS ARENA adalah game obstacle racing 3D multiplayer berbasis browser. Edisi ini menggunakan **Cloudflare Workers + Durable Objects** agar frontend dan server room berjalan di satu proyek tanpa layanan Node.js hosting pihak ketiga yang meminta informasi pembayaran.

## Fitur MVP

- Arena 3D stylized dibuat secara procedural dengan Three.js.
- Quick Match dan room privat dengan kode.
- Maksimal 8 pemain per room.
- Keyboard dan kontrol sentuh dasar.
- Gerakan, lompatan, sprint, rintangan, celah, checkpoint, respawn, timer, hasil, dan rematch.
- Server menghitung gerakan dan memvalidasi hasil pertandingan.
- Satu URL `*.workers.dev` untuk game browser dan endpoint WebSocket.
- Durable Objects menggunakan SQLite storage backend sesuai dukungan paket Workers Free.

## Deploy tanpa menjalankan game secara lokal

1. Buat repository `nexus-arena` di GitHub dan unggah isi ZIP ini ke root repository (bukan ZIP sebagai satu file).
2. Buka Cloudflare Dashboard: <https://dash.cloudflare.com/>. Daftar/login dan pilih paket Workers Free; jangan pilih paket berbayar.
3. Pastikan root repository memiliki `wrangler.jsonc`, `package.json`, `worker/`, `client/`, dan `docs/`.
4. Di Cloudflare Dashboard buka **Workers & Pages → Create → Workers → Connect to Git** (nama menu dapat sedikit berubah), hubungkan GitHub, lalu pilih repository `nexus-arena`.
5. Atur build command menjadi `npm run build` dan deploy command menjadi `npx wrangler deploy`. Root directory harus root repository, bukan `client/` atau `worker/`.
6. Simpan konfigurasi dan jalankan deploy. Cloudflare akan menginstal dependensi, membangun client Vite, menerbitkan aset statis, lalu mendaftarkan Durable Objects dari `wrangler.jsonc`.
7. Pastikan deployment berhasil. Buka URL Worker yang diberikan, lalu buka `/health`. Respons harus menampilkan JSON `ok: true`.
8. Buka URL Worker utama untuk bermain. Quick Match membuat/mencari room publik; Buat Room Privat membuat kode yang bisa dibagikan kepada teman.

## Build command

```bash
npm run build
```

## Deploy command

```bash
npx wrangler deploy
```

Keduanya dijalankan oleh build/deploy pipeline Cloudflare. Anda tidak perlu menjalankan game di komputer pribadi.

## Catatan biaya

Cloudflare menyediakan paket Workers Free dan kuota harian untuk Durable Objects. Dokumentasi menyebut batas gratis termasuk 100.000 request/hari dan 13.000 GB-s durasi/hari; WebSocket messages juga dihitung menurut aturan kuota khusus. Jika kuota gratis habis, operasi yang melebihi kuota dapat gagal sampai kuota direset. Pantau pemakaian di dashboard dan jangan mengaktifkan paket berbayar jika targetnya Rp0. Batas layanan dapat berubah.

Dokumentasi: <https://developers.cloudflare.com/durable-objects/platform/pricing/> dan <https://developers.cloudflare.com/durable-objects/best-practices/websockets/>.

## Troubleshooting

- **Build gagal:** buka tab Build logs di Cloudflare; biasanya root directory/build command belum benar atau dependency install gagal.
- **`/health` tidak ditemukan:** pastikan URL membuka Worker yang benar dan file `wrangler.jsonc` berada di root repository.
- **WebSocket gagal:** pastikan build/deploy terakhir sudah selesai dan buka Console browser untuk melihat error koneksi.
- **Room code tidak ditemukan:** buat kode baru; kode harus persis 6 karakter dan room harus masih menunggu pemain.
- **Kuota tercapai:** tunggu reset harian atau turunkan frekuensi/test traffic. Jangan beralih ke paket berbayar jika tidak ingin membayar.
- **Workers Builds meminta konfigurasi tambahan:** pastikan root directory repository kosong/root, build command `npm run build`, deploy command `npx wrangler deploy`, lalu biarkan konfigurasi binding Durable Objects ditangani `wrangler.jsonc`.

## Penting

Ini adalah MVP. Source sudah disiapkan untuk Cloudflare runtime, tetapi tidak bisa mengklaim deployment publik berhasil sebelum proyek dihubungkan ke akun Cloudflare Anda dan log cloud menunjukkan deploy sukses. Perlu pengujian nyata pada URL publik, terutama dua browser, reconnect, dan room penuh.
