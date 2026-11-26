const B = require('./_blog');

// Public: GET /api/prices  ->  { pps: { "0": 240, ..., "6": 329 } }  (price per player by weekday, 0 = Sunday)
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control', 'max-age=10');
  try {
    return res.status(200).json({ pps: await B.readPrices() });
  } catch (e) {
    console.error('prices api error', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ pps: B.DEFAULT_PRICES });
  }
};
