# Permintaan Server — Otomasi Marketing (versi santai, Bahasa Indonesia)

*Internal message for the supervisor. Public marketing content stays in British English.*

---

Halo Pak/Bu,

Untuk sistem otomasi marketing (yang bikin, jadwalin, dan posting konten sosmed secara otomatis setelah saya approve), kita butuh satu server yang nyala terus 24 jam. Isinya cuma dua hal: **n8n** (alat otomasi alur kerja) dan **renderer** kecil (yang bikin gambar dan video kontennya). Semua software-nya gratis dan open source.

Yang saya butuhkan:

1. **Server DigitalOcean**
   - Pakai droplet yang sudah ada kalau masih ada kapasitas. Tapi kalau bisa, lebih baik **droplet baru khusus untuk ini**, biar terpisah dari sistem perusahaan yang lain dan lebih aman.
   - Lokasi **Singapura (SGP1)**, minimal **2 vCPU / 4 GB RAM / 80 GB**, **Ubuntu 24.04**, sudah terpasang **Docker**.
   - Tolong aktifkan **backup mingguan**.

2. **Dua subdomain di linkbot.sg** (A record ke IP server):
   - `n8n.linkbot.sg`: untuk n8n dan tombol approve dari Lark
   - `renderer.linkbot.sg`: untuk renderer dan link media yang diambil Instagram

   Sertifikat HTTPS-nya otomatis dan gratis, jadi tidak perlu beli.

3. **Firewall**
   - Buka port **80 dan 443** untuk umum (supaya Lark dan Meta bisa akses).
   - Port **22 (SSH)** cukup dibuka dari IP kantor/VPN saja.
   - Port lain ditutup.

4. **Akses**
   - Satu login **SSH pakai key** (user dengan akses sudo) untuk setup.
   - Atau kalau lebih nyaman, tim IT yang jalankan perintah setup-nya. Sudah saya siapkan langkah-langkahnya, kira-kira 30 menit.

**Biaya:** kalau pakai droplet yang sudah ada, tidak ada biaya tambahan. Kalau droplet baru, cuma biaya bulanan droplet-nya saja, plus sekitar 20% untuk backup.

Detail teknis lengkapnya ada di dokumen `docs/do-server-request.md` di repo GitHub kita, kalau tim IT butuh.

Terima kasih, Pak/Bu! 🙏
