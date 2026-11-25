const { EtbError, getDays } = require('./_etb');

// GET /api/days?month=2026-12  ->  { days: { '2026-12-01': true, ... } }
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '')) return res.status(400).json({ error: 'Ugyldig måned.' });
    res.status(200).json({ days: await getDays(req.query.month) });
  } catch (e) {
    const status = e instanceof EtbError ? e.status : 500;
    res.status(status).json({ error: e instanceof EtbError ? e.message : 'Der opstod en fejl.' });
  }
};
