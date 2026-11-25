const { EtbError, getDay, validDate } = require('./_etb');

// GET /api/day?date=2026-12-05  ->  { open, rooms: { vik1: { times: ['10:00', ...], guarantee }, ... } }
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!validDate(req.query.date)) return res.status(400).json({ error: 'Ugyldig dato.' });
    res.status(200).json(await getDay(req.query.date));
  } catch (e) {
    const status = e instanceof EtbError ? e.status : 500;
    res.status(status).json({ error: e instanceof EtbError ? e.message : 'Der opstod en fejl.' });
  }
};
