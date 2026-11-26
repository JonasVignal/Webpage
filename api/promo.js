const B = require('./_blog');

// Public: GET /api/promo?code=SOMMER10  ->  { code, percent }  or 404. Light per-instance rate limit against guessing.
const hits = new Map();
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (h.length >= 30) return res.status(429).json({ error: 'rate' });
  h.push(now); hits.set(ip, h);
  try {
    const c = await B.findCode(req.query && req.query.code);
    if (!c) return res.status(404).json({ error: 'invalid' });
    return res.status(200).json({ code: c.code, percent: c.percent });
  } catch (e) {
    console.error('promo api error', e && e.message);
    return res.status(500).json({ error: 'unavailable' });
  }
};
