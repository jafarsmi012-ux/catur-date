/**
 * GET /api/config → info konfigurasi (tanpa rahasia).
 * Ditaruh di api/config.js supaya otomatis jadi serverless function di Vercel,
 * dan tetap tersedia di server lokal Express (server.js me-require file ini).
 */
module.exports = (req, res) => {
  res.json({
    sdkAppId: Number(process.env.SDKAPPID || 0) || null,
    online: Boolean(process.env.SDKAPPID && process.env.SECRETKEY),
  });
};
