# ♕ Catur Romantis 💕

Permainan catur untuk kamu dan pacar — berdua, langsung dari HP.
Tema romantis merah muda, responsif untuk layar ponsel, plus **chat teks** dan
**voice call (suara)** berbasis layanan Tencent Cloud (Chat/IM + TRTC).

## Fitur

- ♟️ **Catur penuh aturan** — skak, skakmat, promosi, castling, en passant,
  remis (pat / 3x pengulangan / 50 langkah / material kurang)
- 📱 **Mobile-first** — papan besar, sentuh satu ketukan untuk pilih & taruh,
  aman dari zoom tak sengaja, mendukung safe-area (notch)
- 💬 **Chat real-time** — bubble chat, kumpulan emoji cepat, badge belum-dibaca
- 🎙️ **Voice streaming** — bicara sambil main (Tencent TRTC), indikator
  "bersuara 🔊" saat pacarmu bicara
- 💌 **Kirim hati** — animasi hati melayang di layar pacarmu
- ↩️ **Undo** (online: minta izin lawan), 🤝 **tawari remis**, 🏳️ **menyerah**, 🔁 **rematch**
- 🎵 **Efek suara** ringan (langkah, makan, skak, menang, chat) tanpa file audio
- 🖤 **Mode satu HP** — main berdua di satu layar tanpa perlu apa pun
- 🔀 **Balik papan** untuk pemain hitam

## Struktur Proyek (kompatibel Vercel)

```
index.html, css/, js/, vendor/   # frontend statis (di root — konvensi Vercel)
api/config.js                    # GET /api/config
api/usersig.js                   # GET /api/usersig?user=… (tanda tangan UserSig)
api/lib/TLSAPI.js                # generator UserSig (tls-sig-api resmi Tencent)
server.js                        # server Express untuk jalan LOKAL saja
```

Endpoint API ditulis sebagai *serverless functions* Vercel (`/api/*.js`),
sekaligus dipakai ulang oleh `server.js` saat `npm start` di komputer sendiri —
satu kode, dua cara jalan.

## Menjalankan di Komputer Sendiri (opsional)

```bash
npm install
npm start
```

Buka `http://localhost:3100` (IPv4 & IPv6). Untuk main dari HP di WiFi yang
sama, buka alamat LAN yang tercetak di terminal (mis. `http://192.168.x.x:3100`).

> Port default **3100** agar tidak bentrok dengan aplikasi lain di port 3000.
> Ganti lewat `PORT` di `.env`.

## Deploy ke Vercel (rekomendasi utama)

Vercel memberi HTTPS otomatis (wajib untuk izin mikrofon/voice) dan gratis
untuk pemakaian pribadi.

1. Push kode ke GitHub:
   ```bash
   git init
   git add .
   git commit -m "catur romantis"
   git remote add origin https://github.com/USER/catur-romantis.git
   git push -u origin main
   ```
   (`.env` otomatis terkecuali oleh `.gitignore` — SECRETKEY aman.)
2. Buka [vercel.com](https://vercel.com) → **Add New → Project** → pilih repo
   tadi → **Deploy** (semua setting default sudah cocok; framework
   auto-detect "Other", build tidak diperlukan).
3. Set environment variables: **Project → Settings → Environment Variables**:
   - `SDKAPPID` = angka SDKAppID aplikasi Tencent Cloud kamu
   - `SECRETKEY` = SecretKey aplikasi
   lalu **Deployments → … → Redeploy**.
4. Buka URL hasil deploy (mis. `https://catur-romantis.vercel.app`) dari HP
   kamu dan pacarmu — isi kode kamar yang sama, tekan **Mulai 💕**, lalu 🎙️
   untuk voice.

Catatan: tier Hobby Vercel tidak punya batas waktu untuk fungsi sekali-panggil
seperti `/api/usersig` (prosesnya mikrodetik), jadi aman.

## Bagaimana dengan Cloudflare Pages?

**Kurang cocok** untuk proyek ini. Pages Functions berjalan di runtime
Cloudflare Workers, bukan Node.js — generator UserSig kami memakai
`crypto.createSign` (ECDSA) dan `zlib.deflateSync` dari Node yang tidak
tersedia di Workers. Pilihan yang tetap mungkin di ekosistem Cloudflare:

- **Cloudflare Tunnel** (bukan Pages): server Node tetap di PC rumah, dapat
  URL HTTPS publik:
  ```bash
  cloudflared tunnel --url http://localhost:3100
  ```
- **Cloudflare Workers**: memerlukan penulisan ulang signing ke WebCrypto —
  besar kemungkinan bisa, tapi di luar cakupan proyek ini.

Untuk host statis + functions Node: **Vercel** (atas), **Render**, **Railway**,
atau VPS + Nginx semuanya kompatibel tanpa perubahan kode.

## Mengaktifkan Chat & Suara (Tencent Cloud)

1. Daftar/masuk di [Tencent Cloud Console](https://console.cloud.tencent.com/).
2. Buka layanan **实时音视频 TRTC** (atau **Chat/即时通信 IM** — keduanya
   memakai `SDKAppID` yang sama) dan buat aplikasi:
   https://console.cloud.tencent.com/trtc/app/create
3. Di **应用管理** (Application Management), catat **SDKAppID** dan
   **SecretKey / 密钥**.
4. Di hosting (Vercel dsb.) set `SDKAPPID` & `SECRETKEY` sebagai environment
   variables — atau untuk jalan lokal, salin `.env.example` → `.env` lalu isi.

### Bermain terpisah (dua HP)

1. Kamu dan pacar buka URL yang sama.
2. Isi nama masing-masing, masukkan **kode kamar yang sama** (mis. `sayang`),
   tekan **Mulai 💕**.
3. Yang masuk duluan otomatis jadi **putih**; yang kedua jadi **hitam**
   (papannya otomatis dibalik).
4. Tekan 🎙️ untuk menyalakan suara.

### Catatan penting voice / mikrofon

Browser hanya mengizinkan mikrofon pada **HTTPS** atau `localhost`:

- Di Vercel/Render/Railway/VPS + Let's Encrypt: HTTPS sudah ada, voice langsung bisa.
- Jalan lokal via `http://192.168.x.x:3100` → chat jalan, **voice tidak bisa**;
  aktifkan `USE_HTTPS=1` di `.env` (server membuat sertifikat self-signed di
  `certs/`, butuh `openssl` di PATH) dan buka `https://192.168.x.x:3100`,
  terima peringatan sertifikat di HP.

### Keamanan

`SECRETKEY` **hanya ada di server** (environment variable) — browser tidak
pernah melihatnya. Frontend meminta *UserSig* (token tanda tangan, kedaluwarsa
180 hari) dari endpoint `/api/usersig`.

## Catatan Teknis

- **Sinkronisasi langkah**: setiap langkah dikirim sebagai pesan kustom
  (`TIMCustomElem`) ke grup chat `catur-<kode kamar>`; pesan memuat FEN untuk
  pemulihan bila terjadi desinkronisasi.
- **Voice**: room TRTC numerik di-hash dari kode kamar, mode RTC audio-murni,
  langganan otomatis + evaluasi volume untuk indikator bicara.
- **Tidak ada state di server** — semua lewat Tencent Cloud; server hanya
  menyajikan file statis + dua endpoint kecil.

## Skenario yang Sudah Diuji

- Mode satu HP: pilih & langkah (e2–e4), skakmat (Fool's mate) + modal hasil,
  undo, kirim hati, panel chat (kirim pesan), drawer menu, rematch.
- Server: penyajian file statis, `/api/config`, `/api/usersig` (503 bila env kosong).
