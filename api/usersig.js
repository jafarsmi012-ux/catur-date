/**
 * GET /api/usersig?user=<nama> → UserSig Tencent (untuk SDK TIM chat & TRTC voice).
 *
 * Catatan keamanan: SECRETKEY tidak pernah dikirim ke browser; endpoint ini
 * yang menandatangani identitas pemain. Berlaku 180 hari.
 */
const LibGenerateTestUserSig = require('./lib/LibGenerateTestUserSig.js');

const EXPIRE_SECONDS = 180 * 24 * 3600;

module.exports = (req, res) => {
  const SDKAPPID = Number(process.env.SDKAPPID || 0);
  const SECRETKEY = process.env.SECRETKEY || '';

  if (!SDKAPPID || !SECRETKEY) {
    return res.status(503).json({ error: 'SDKAPPID / SECRETKEY belum diisi (set environment variable di hosting)' });
  }
  let user = String(req.query.user || '').trim();
  user = user.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  if (!user) return res.status(400).json({ error: 'Parameter "user" kosong/tidak valid' });

  try {
    const generator = new LibGenerateTestUserSig(SDKAPPID, SECRETKEY, EXPIRE_SECONDS);
    const userSig = generator.genTestUserSig(user);
    res.json({ sdkAppId: SDKAPPID, userId: user, userSig });
  } catch (e) {
    console.error('gagal buat usersig:', e.message);
    res.status(500).json({ error: 'Gagal membuat UserSig: ' + e.message });
  }
};
