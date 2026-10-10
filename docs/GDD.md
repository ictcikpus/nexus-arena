# NEXUS ARENA — Game Design Document

**Versi:** 1.0 MVP  
**Genre:** 3D obstacle racing multiplayer  
**Pemain:** 2–8 per room  
**Target:** browser PC/laptop dan HP  
**Visual:** stylized procedural 3D  
**Model biaya:** Rp0 dengan paket gratis, tanpa SLA

## Premis

Delapan pelari bersaing melewati arena futuristik berisi dinding rintangan, celah platform, dan checkpoint. Pemenang ditentukan berdasarkan waktu finis yang divalidasi server.

## Core loop

1. Masukkan nama dan warna.
2. Quick Match atau buat/gabung room privat menggunakan kode.
3. Klik Siap; countdown berjalan ketika minimal dua pemain siap.
4. Berlari, melompat melewati penghalang dan celah.
5. Jika jatuh, respawn pada checkpoint terakhir dengan penalti.
6. Server mengunci hasil, seluruh client menampilkan peringkat.
7. Rematch atau kembali ke menu.

## Kontrol

- PC: WASD/arrow, Space untuk jump, Shift untuk sprint, Esc untuk kembali ke menu.
- Mobile: joystick virtual, tombol jump, tombol sprint.

## Arena MVP

- Track modular dengan beberapa bagian platform dan dua gap utama.
- Beberapa barikade dengan bukaan berpindah arah.
- Checkpoint sesudah setiap gap.
- Finis di ujung lintasan.
- Semua geometri utama dibuat melalui Three.js; tidak ada aset berbayar/external model.

## Aturan

- Room berisi maksimal delapan pemain.
- Countdown tiga detik.
- Durasi target maksimal 180 detik.
- Gerakan dan event finis ditentukan server.
- Jatuh menambah penalti 2.5 detik dan memindahkan pemain ke checkpoint terakhir.
- Hasil: pemain yang finis disortir menurut waktu finis + penalti; sisanya menurut progress.

## UI/UX

Main menu, quick match, create/join room, lobby, HUD, results, status server dan pesan error. UI adaptif untuk layar kecil dan tombol sentuh yang mudah dijangkau.

## Di luar cakupan MVP

Akun permanen, database cloud, leaderboard global, voice chat, store kosmetik, anticheat lanjutan dan banyak arena.

## Kriteria penerimaan

- Delapan pemain dapat masuk room yang sama.
- Pemain kesembilan ditolak.
- Posisi, checkpoint dan hasil tersinkron.
- Input keyboard dan sentuh berfungsi.
- Frontend ber-HTTPS dapat membuka koneksi aman ke backend.
- Koneksi terputus ditangani dengan pesan yang jelas.
