/**
 * local/server.js — server file statis untuk mencoba lokal (tanpa express).
 *
 *   node local/server.js              → http://localhost:3100
 *   PORT=8080 node local/server.js    → ganti port
 *   USE_HTTPS=1 node local/server.js  → https self-signed (untuk tes mic dari HP)
 *
 * Sejak pindah ke Trystero (P2P WebRTC) TIDAK ADA backend sama sekali:
 * chat, sinkronisasi langkah, dan voice berjalan langsung antar browser.
 * Untuk deploy cukup sajikan file proyek secara statis (Vercel / GitHub
 * Pages). `npm start` hanya kenyamanan saat mengembangkan di PC.
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3100;
const USE_HTTPS = process.env.USE_HTTPS === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serve(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 — URL tidak valid');
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 💕 — tidak ada file di ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

function localIPs() {
  const out = [];
  for (const info of Object.values(os.networkInterfaces())) {
    for (const i of info || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
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
    console.log('Sertifikat self-signed dibuat di local/certs/');
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}

const server = USE_HTTPS ? https.createServer(selfSignedCert(), serve) : http.createServer(serve);
server.listen(PORT, () => {
  const proto = USE_HTTPS ? 'https' : 'http';
  console.log('');
  console.log('  ♕ Catur Romantis (statis — tanpa backend) 💕');
  console.log(`  → ${proto}://localhost:${PORT}`);
  for (const ip of localIPs()) console.log(`  → ${proto}://${ip}:${PORT}  (buka dari HP di WiFi sama)`);
  if (!USE_HTTPS) console.log('  ℹ mic/voice butuh HTTPS atau localhost — pakai USE_HTTPS=1 untuk tes LAN');
  console.log('');
});
