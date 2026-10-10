# NEXUS ARENA

Game obstacle racing 3D multiplayer berbasis browser. Target MVP: maksimal 8 pemain per room, PC/laptop dan HP, tanpa aset berbayar.

## Fitur yang tersedia dalam source

- Arena 3D stylized yang dibuat secara procedural dengan Three.js.
- Room publik (Quick Match) dan room privat dengan kode room.
- Maksimal 8 pemain per room.
- Gerak, lompat, sprint, rintangan, celah, checkpoint, respawn, timer, hasil dan rematch.
- Input gameplay dikirim ke server; server menghitung pergerakan dan memvalidasi checkpoint/finis.
- Kontrol keyboard dan kontrol sentuh dasar.
- Render frontend dan server multiplayer terpisah.
- `render.yaml` untuk deployment Blueprint melalui Render yang terhubung ke GitHub.

> Catatan: paket ini merupakan MVP awal. Sebelum dipakai untuk kompetisi besar atau layanan produksi, tambahkan load test, telemetry, autentikasi, pemeriksaan keamanan, dan pengujian lintas perangkat. Paket gratis tidak menjamin uptime.

## Deploy langsung dari GitHub tanpa menjalankan game di PC

### 1. Buat repository

1. Buka https://github.com/new.
2. Isi Repository name: `nexus-arena`.
3. Pilih **Public** (atau Private jika ingin source tertutup; pastikan layanan deploy diberi akses).
4. Centang **Add a README file**, lalu klik **Create repository**.

### 2. Upload source melalui GitHub Codespaces (semua lewat browser)

GitHub web uploader tidak selalu nyaman untuk folder bertingkat. Cara yang paling pasti tanpa instalasi lokal adalah menggunakan Codespaces:

1. Unduh `nexus-arena.zip` dari percakapan ini dan simpan di komputer; jangan jalankan source secara lokal.
2. Di repository GitHub, buka **Code → Codespaces → Create codespace on main**. Jika belum ada Codespaces, pilih create.
3. Saat VS Code berbasis browser terbuka, unggah ZIP ke folder workspace lewat Explorer (klik kanan area file lalu **Upload** jika tersedia; atau seret ZIP ke Explorer).
4. Buka terminal Codespaces dan jalankan:

   ```bash
   unzip nexus-arena.zip -d /tmp/nexus-arena
   cp -a /tmp/nexus-arena/. .
   rm -rf /tmp/nexus-arena
   rm -f nexus-arena.zip
   git add .
   git commit -m "Add NEXUS ARENA multiplayer game"
   git push
   ```

5. Pastikan file `render.yaml`, folder `client/`, `server/`, dan `docs/` terlihat di root repository.
6. Stop/delete Codespace setelah selesai agar kuota bulanan tidak terpakai. Tidak perlu menjalankan `npm run dev` atau mencoba game lokal.

Alternatif: jika nyaman memakai uploader GitHub, ekstrak ZIP dan unggah folder beserta subfolder melalui **Add file → Upload files**; pastikan struktur `client/` dan `server/` tetap dipertahankan.

### 3. Buat layanan dari Blueprint

1. Buat/masuk akun di https://render.com/.
2. Klik **New → Blueprint** (pada sebagian tampilan tertulis **Blueprint** atau **Infrastructure as Code**).
3. Hubungkan akun GitHub, lalu pilih repository `nexus-arena`.
4. Render akan membaca `render.yaml`, kemudian menampilkan dua layanan: `nexus-arena-server` (Node.js Web Service) dan `nexus-arena` (Static Site).
5. Pilih paket **Free** untuk server jika pilihan itu tersedia di akun/wilayah Anda. Tinjau resource dan biaya sebelum menyetujui.
6. Klik **Apply** / **Deploy Blueprint**, lalu tunggu build awal selesai di dashboard Render. Build adalah proses deployment di cloud, bukan pengujian lokal.

### 4. Pastikan alamat backend benar

Secara default, frontend mengarah ke:

`https://nexus-arena-server.onrender.com`

Jika dashboard Render memberi alamat server yang berbeda (misalnya nama layanan diubah karena nama sudah dipakai), buka layanan Static Site `nexus-arena` → **Environment** → ubah `VITE_SERVER_URL` ke alamat HTTPS backend yang benar (contoh `https://nama-server-anda.onrender.com`) → simpan dan deploy ulang frontend. Jangan menambahkan path `/health` atau `/ws`; cukup origin HTTPS server.

Server otomatis memakai WebSocket aman (WSS) ketika client membuka koneksi dari halaman HTTPS melalui SDK Colyseus. Endpoint kesehatan tersedia di `/health`.

### 5. Bermain

1. Buka URL Static Site `nexus-arena` dari dashboard Render.
2. Masukkan nama tampilan dan pilih warna karakter.
3. Pilih **Quick Match** untuk room publik, atau **Buat Room Privat** lalu kirim kode room kepada teman.
4. Semua pemain klik **Siap**. Pertandingan dimulai ketika sedikitnya dua pemain sudah siap.
5. PC: WASD/Arrow untuk bergerak, Space untuk melompat, Shift untuk sprint, Esc untuk keluar dari pertandingan. HP: joystick kiri, tombol lompat dan sprint di kanan.

Untuk bermain dengan teman, teman harus membuka URL game yang sama, memasukkan kode room privat pada kolom gabung, lalu klik Siap.

## Catatan biaya dan keterbatasan

- Source code tersimpan di GitHub Free; frontend dan backend di-deploy melalui Render.
- Render Free Web Services dapat tidur setelah sekitar 15 menit tanpa trafik masuk. Koneksi berikutnya dapat membutuhkan cold start sekitar satu menit. Layanan gratis juga dapat restart dan tidak memberi SLA.
- Render dapat mengubah syarat, kuota, dan ketersediaan paket gratis. Selalu cek halaman harga/dashboard sebelum deploy.
- Tidak diperlukan domain khusus atau database pada MVP.
- Hosting frontend saja (misalnya GitHub Pages) tidak cukup untuk multiplayer; server Colyseus harus berjalan pada runtime yang mendukung Node.js dan WebSocket.

## Stack

- Frontend: JavaScript ES Modules, Three.js, Vite, `colyseus.js`.
- Backend: Node.js, Colyseus 0.16, `@colyseus/schema`, Express.
- Deployment: GitHub + Render Blueprint.

## Struktur

```text
client/              Three.js game client and UI
server/              Colyseus authoritative game server
server/src/rooms/    Room lifecycle and synchronized state
server/src/game/     Server-side game rules
render.yaml          Creates frontend and backend services
 docs/               GDD, architecture, deployment and testing notes
```

## Troubleshooting

- **Game says server unavailable:** buka URL `/health` pada domain server. Jika tidak menampilkan JSON status, cek **Logs** di layanan server.
- **Frontend terbuka, tetapi tidak dapat join:** pastikan environment `VITE_SERVER_URL` adalah alamat HTTPS backend yang benar dan jalankan deploy ulang frontend setelah mengubahnya.
- **Room terasa lambat pada koneksi pertama:** service gratis mungkin sedang sleep. Tunggu proses bangun selesai, lalu coba lagi.
- **Room code tidak valid:** gunakan room code yang ditampilkan oleh pembuat room; kode tidak sama dengan nama repository.
- **Build error:** buka tab Events/Logs untuk service yang gagal dan gunakan versi Node serta dependensi yang dilaporkan pada log.

## Lisensi

Kode contoh proyek dapat dimodifikasi untuk penggunaan pribadi, sekolah, dan proyek indie. Dependensi tetap tunduk pada lisensinya masing-masing. Jangan menambahkan aset pihak ketiga tanpa memeriksa lisensinya.
