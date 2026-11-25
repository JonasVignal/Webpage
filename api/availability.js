const { EtbError, getAvailability, validDate, parsePersons } = require('./_etb');

// GET /api/availability?room=Vikings&date=2026-12-05&persons=4
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { room, date } = req.query;
    const persons = parsePersons(req.query.persons);
    if (!room || !validDate(date) || !persons) {
      return res.status(400).json({ error: 'Ugyldige oplysninger.' });
    }
    const result = await getAvailability(room, date, persons);
    // Don't leak internal booking type IDs to the browser.
    res.status(200).json({
      open: result.open,
      times: result.times.map(({ time, payment }) => ({ time, payment })),
      booked: result.booked
    });
  } catch (e) {
    const status = e instanceof EtbError ? e.status : 500;
    res.status(status).json({ error: e instanceof EtbError ? e.message : 'Der opstod en fejl.' });
  }
};
