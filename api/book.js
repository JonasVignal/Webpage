const { ROOMS, EtbError, sleep, etb, fetchAvailability, cancelBooking, validDate } = require('./_etb');

// Guest mobile as digits incl. country code (easyTable wants an integer). Bare 8-digit numbers are Danish.
function parseMobile(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 8) d = '45' + d;
  return /^\d{8,15}$/.test(d) ? Number(d) : null;
}

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/**
 * POST /api/book
 * { items: [{ room, date, time, persons }], customer: { name, phone, email, comment, company, cvr }, promo, lang }
 * Creates one easyTable booking per item. All-or-nothing: if one fails, the ones already created are cancelled.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const created = [];
  try {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const c = b.customer || {};
    const name = clean(c.name, 100);
    const email = clean(c.email, 150);
    const mobile = parseMobile(c.phone);
    const items = Array.isArray(b.items) ? b.items : [];

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !mobile || items.length < 1 || items.length > 12) {
      return res.status(400).json({ error: 'Tjek venligst dine oplysninger.' });
    }
    let totalPersons = 0;
    for (const it of items) {
      const room = ROOMS[it && it.room];
      const persons = Number(it && it.persons);
      if (!room || !validDate(it.date) || !/^\d{2}:\d{2}$/.test(String(it.time)) ||
          !Number.isInteger(persons) || persons < room.min || persons > room.max) {
        return res.status(400).json({ error: 'Tjek venligst dine valgte spil.' });
      }
      totalPersons += persons;
    }
    if (totalPersons > 100) return res.status(400).json({ error: 'For mange deltagere i én booking.' });

    // 1) Re-check real availability for every item (one call per date + group size).
    const cache = new Map();
    for (const it of items) {
      const k = it.date + '|' + it.persons;
      if (!cache.has(k)) {
        if (cache.size) await sleep(400);
        cache.set(k, await fetchAvailability(it.date, it.persons));
      }
      const free = ((cache.get(k) || {}).availabilityTimes || []).some(
        (a) => a.bookingType && a.bookingType.id === ROOMS[it.room].type && a.time === it.time
      );
      if (!free) {
        return res.status(409).json({ error: 'conflict', room: it.room, date: it.date, time: it.time });
      }
    }

    // 2) Create the bookings.
    const company = clean(c.company, 100) || undefined;
    const note = [
      clean(c.comment, 500),
      c.cvr ? 'CVR: ' + clean(c.cvr, 20) : '',
      items.length > 1 ? `Del af samlet booking (${items.length} spil) via hjemmesiden.` : 'Booket via hjemmesiden.'
    ].filter(Boolean).join('\r\n');
    const language = b.lang === 'en' ? 'EN' : 'DA';

    for (const it of items) {
      if (created.length) await sleep(400);
      const booking = await etb('/v2/bookings', {
        method: 'POST',
        body: {
          date: it.date,
          time: it.time,
          persons: Number(it.persons),
          typeID: ROOMS[it.room].type,
          autoTable: true,
          name,
          email,
          mobile,
          company,
          language,
          onlineBooking: 1,
          emailNotifications: 1,
          guestNote: note,
          reference: b.promo ? clean(b.promo, 50) : undefined
        }
      });
      created.push({ room: it.room, date: it.date, time: it.time, persons: Number(it.persons), bookingId: booking.bookingID, paymentUrl: booking.paymentURL || null });
    }

    res.status(200).json({ ok: true, bookings: created });
  } catch (e) {
    // Roll back anything already created so the guest isn't left with a half-made booking.
    let cancelled = 0;
    for (const bk of created) { if (await cancelBooking(bk.bookingId)) cancelled++; await sleep(400); }
    if (e instanceof EtbError) {
      const conflict = e.status === 409;
      return res.status(e.status).json({ error: conflict ? 'conflict' : e.message, rolledBack: cancelled, created: created.length });
    }
    res.status(500).json({ error: 'Der opstod en fejl.', rolledBack: cancelled, created: created.length });
  }
};
