const { EtbError, getDays, parsePersons } = require('./_etb');

// GET /api/days?room=Vikings&month=2026-12&persons=4  ->  { days: { '2026-12-01': true, ... } }
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { room, month } = req.query;
    const persons = parsePersons(req.query.persons);
    if (!room || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') || !persons) {
      return res.status(400).json({ error: 'Ugyldige oplysninger.' });
    }
    res.status(200).json({ days: await getDays(room, month, persons) });
  } catch (e) {
    const status = e instanceof EtbError ? e.status : 500;
    res.status(status).json({ error: e instanceof EtbError ? e.message : 'Der opstod en fejl.' });
  }
};
