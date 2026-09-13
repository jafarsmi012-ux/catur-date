# ♕ Catur Romantis 💕

Permainan catur untuk kamu dan pacar — berdua, langsung dari HP (LDR beda
kota pun bisa). Tema romantis merah muda, responsif untuk layar ponsel, plus
**chat teks** dan **voice call** yang berjalan **langsung antar browser**
(P2P WebRTC, memakai pustaka [Trystero](https://github.com/dmotz/trystero)).

> **Gratis dan tanpa setup apa pun.** Tidak perlu akun cloud, API key,
> `.env`, atau server backend — cukup satu URL yang bisa dibuka berdua.

## Fitur

- ♟️ **Catur penuh aturan** — skak, skakmat, promosi, castling, en passant,
  remis (pat / 3x pengulangan / 50 langkah / material kurang)
- 📱 **Mobile-first** — papan besar, sentuh satu ketukan untuk pilih & taruh,
  aman dari zoom tak sengaja, mendukung safe-area (notch)
- 💬 **Chat real-time** — bubble chat, kumpulan emoji cepat, badge belum-dibaca
- 🎙️ **Voice streaming** — bicara sambil main (mic langsung P2P), indikator
  "bersuara 🔊" saat pacarmu bicara
- 💌 **Kirim hati** — animasi hati melayang di layar pacarmu
- ↩️ **Undo** (online: minta izin lawan), 🤝 **tawari remis**, 🏳️ **menyerah**, 🔁 **rematch**
- 🎵 **Efek suara** ringan (langkah, makan, skak, menang, chat) tanpa file audio
- 🖤 **Mode satu HP** — main berdua di satu layar tanpa perlu apa pun
- 🔀 **Balik papan** untuk pemain hitam

## Cara Main Online (dua HP, beda kota)

1. Deploy sekali saja (lihat di bawah) atau jalankan `npm start` di PC dan
   buka dari browser HP masing-masing lewat URL publik.
2. Kamu dan pacar buka **URL yang sama**.
3. Di tab **Online**: isi nama masing-masing (boleh sama, ID internal dibuat
   unik otomatis) dan **kode kamar yang sama** (mis. `sayang`) → **Masuk 💕**.
4. Yang tersambung duluan jadi **putih**, yang kedua **hitam** — papan hitam
   otomatis terbalik. Warna stabil walau salah satu me-refresh halaman
   (pemain yang permainannya masih berjalan mempertahankan warnanya).
5. Tekan 🎙️ untuk menyalakan suara; chat & ❤️ ada di drawer.

Semua traffic (langkah, chat, audio) mengalir **langsung antara dua browser**
kalian lewat WebRTC; jaringan publik Nostr hanya dipakai untuk saling
mengenalkan (pertukaran SDP terenkripsi). Karena itu:

- **Butuh HTTPS** untuk mikrofon — URL Vercel/GitHub Pages sudah HTTPS.
- Bila kedua HP berada di jaringan dengan firewall NAT yang sangat ketat,
  koneksi P2P kadang gagal tembus (jarang terjadi di seluler/4G-5G).

## Struktur Proyek (kompatibel Vercel)

```
index.html, css/, js/, vendor/   # frontend statis (di root — konvensi Vercel)
vendor/trystero.js               # pustaka P2P (hasil build, sudah di-commit)
vendor/trystero-entry.mjs        # sumber bundling (lihat "Menyusun ulang vendor")
local/server.js                  # server statis nol-dependensi untuk development
```

Tidak ada `/api/*` lagi — dulu ada (Tencent UserSig), sekarang tidak diperlukan.

## Deploy ke Vercel (rekomendasi utama)

Vercel memberi HTTPS otomatis (wajib untuk mic) dan gratis untuk pemakaian
pribadi.

1. Push kode ke GitHub (repo ini sudah punya `origin`).
2. Buka [vercel.com](https://vercel.com) → **Add New → Project** → pilih repo.
   Di **Build and Output Settings** set **Framework Preset = Other**
   (Build Command kosong, Output Directory kosong) — `vercel.json` sudah
   mengatur preset statis, jadi cukup Deploy.
3. Buka URL hasilnya dari kedua HP. Selesai — tidak ada environment variable
   yang perlu diisi.

Setiap `git push` otomatis redeploy.

## Menjalankan di Komputer Sendiri (opsional)

```bash
node local/server.js        # http://localhost:3100
```

`npm install` **tidak diperlukan** untuk ini (server nol-dependensi). Untuk
mencoba mic dari HP di WiFi yang sama: `USE_HTTPS=1 node local/server.js`
(butuh `openssl` di PATH; terima peringatan sertifikat self-signed di HP).

> Port default **3100**; ganti dengan `PORT=8080`.

## Menyusun ulang vendor (hanya bila perlu)

```bash
npm install                # devDependencies: trystero + esbuild
npm run vendor             # -> vendor/trystero.js (sudah ikut ter-commit)
```

## Catatan Teknis

- **Transport**: `js/net.js` membungkus Trystero (strategi Nostr). Satu action
  `proto` membawa semua event game sebagai JSON `{ a: aksi, from, ...data }`.
- **Sinkronisasi langkah**: tiap langkah dikirim bersama FEN papan; bila
  terjadi desinkron, FEN dipakai untuk pemulihan.
- **Warna**: saat pairing, kedua sisi menghitung
  `selfId-saya < selfId-lawan` (komplemen pasti); rejoin saat game berjalan →
  pengikut mengambil kebalikan warna yang diumumkan host lewat `hello_ack`.
- **Voice**: `getUserMedia` → `room.addStream` (audio-track tunggal),
  volume-meter AudioContext untuk indikator bicara, `removeStream` + stop
  tracks saat mati.
- **Tidak ada state server** — server hanya menyajikan file statis.

## Skenario yang Sudah Diuji

- Mode satu HP: pilih & langkah (e2–e4), skakmat (Fool's mate) + modal hasil,
  undo, kirim hati, panel chat (kirim pesan), drawer menu, rematch.
- Wiring P2P: dua tab join kamar yang sama → saling `hello`, warna putih/hitam
  komplemen, langkah tersinkron (termasuk desync-recovery via FEN).
- Server statis lokal menyajikan semua aset (200) tanpa dependensi.
