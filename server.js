/**
 * server.js — mode pengembangan lokal (Express).
 *
 * Struktur proyek mengikuti konvensi Vercel:
 *   /api/*.js  → serverless functions (dipakai Vercel)
 *   /index.html, /css, /js, /vendor → file statis
 *
 * File ini hanya dipakai saat `npm start` di komputer sendiri; di Vercel
 * (maupun hosting Node lain) tidak diperlukan sama sekali.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');
const express = require('express');

// handler serverless dipakai ulang untuk server lokal
const configHandler = require('./api/config.js');
const usersigHandler = require('./api/usersig.js');

const PORT = Number(process.env.PORT || 3100);
const USE_HTTPS = process.env.USE_HTTPS === '1';

const app = express();
app.disable('x-powered-by');

// statis dari root proyek
app.use(express.static(path.join(__dirname)));
// endpoint API sama seperti di Vercel
app.get('/api/config', (req, res) => configHandler(req, res));
app.get('/api/usersig', (req, res) => usersigHandler(req, res));

app.use((req, res) => res.status(404).send('404 💕'));

function localIPs() {
  const res = [];
  for (const info of Object.values(os.networkInterfaces())) {
    for (const i of info || []) {
      if (i.family === 'IPv4' && !i.internal) res.push(i.address);
    }
  }
  return res;
}

function selfSignedCert() {
  const dir = path.join(__dirname, 'certs');
  const key = path.join(dir, 'key.pem');
  const crt = path.join(dir, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(crt)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
      '-keyout', key, '-out', crt, '-subj', '/CN=catur-romantis',
    ]);
    console.log('Sertifikat self-signed dibuat di certs/');
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}

const server = USE_HTTPS ? https.createServer(selfSignedCert(), app) : http.createServer(app);
server.listen(PORT, () => {
  const proto = USE_HTTPS ? 'https' : 'http';
  console.log('');
  console.log('  ♕ Catur Romantis berjalan 💕');
  console.log(`  → ${proto}://localhost:${PORT}`);
  for (const ip of localIPs()) console.log(`  → ${proto}://${ip}:${PORT}  (buka dari HP)`);
  if (!process.env.SDKAPPID || !process.env.SECRETKEY) {
    console.log('');
    console.log('  ⚠ Mode SATU-HP saja. Isi SDKAPPID & SECRETKEY di .env untuk chat & suara.');
  }
  console.log('');
});
