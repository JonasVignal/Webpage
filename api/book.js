const B = require('./_blog');
const { ROOMS, EtbError, sleep, etb, fetchAvailability, cancelBooking, validDate } = require('./_etb');

// Guest mobile as digits incl. country code (easyTable wants an integer). Bare 8-digit numbers are Danish.
function parseMobile(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 8) d = '45' + d;
  return /^\d{8,15}$/.test(d) ? Number(d) : null;
}

// Dates from easyTable come as 'YYYY-MM-DDT…' or 'MM/DD/YYYY'; return 'YYYY-MM-DD'.
function normDate(d) {
  const t = String(d || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : t;
}

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/**
 * POST /api/book
 * { items: [{ room, date, time, persons, pps }], customer: { name, phone, email, comment, company, cvr }, promo, lang }
 * Creates one easyTable booking per item. All-or-nothing: with several items it uses easyTable's batch endpoint
 * (atomic roll-back); without batch permission it books one by one and cancels what it made if one fails.
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
    // Each booking gets its own note with the price per person (the price the guest saw on the website).
    const dkk = (n) => Math.round(n).toLocaleString('da-DK');
    // The price comes from the stored weekday prices, never from the browser.
    const PRICES = await B.readPrices().catch(() => B.DEFAULT_PRICES);
    const noteFor = (it) => {
      const pps = Number(PRICES[new Date(it.date + 'T12:00:00Z').getUTCDay()]);
      const hasPrice = Number.isFinite(pps) && pps > 0 && pps < 5000;
      return [
        clean(c.comment, 500),
        c.cvr ? 'CVR: ' + clean(c.cvr, 20) : '',
        hasPrice ? `Pris: ${dkk(pps)} kr. pr. person (${Number(it.persons)} pers. = ${dkk(pps * Number(it.persons))} kr.)` : '',
        items.length > 1 ? `Del af samlet booking (${items.length} spil).` : ''
      ].filter(Boolean).join('\r\n');
    };
    const language = b.lang === 'en' ? 'EN' : 'DA';

    // Several games at once: one atomic batch call (all created, or none). Needs the extra
    // "batch" permission on the API key – without it we fall back to creating them one by one.
    let usedBatch = false;
    if (items.length > 1) {
      try {
        const out = await etb('/v2/bookings/batch', {
          method: 'POST',
          body: {
            rollBackPolicy: true,
            customer: [{
              mobile, name, email, company, language,
              emailNotifications: 1, smsNotifications: 0,
              bookings: items.map((it, idx) => ({
                date: it.date,
                arrival: it.time,
                persons: Number(it.persons),
                bookingType: ROOMS[it.room].type,
                autoTable: true,
                ignorePayment: idx > 0 ? 1 : 0, // only the first room needs the card
                guestNote: noteFor(it),
                comment: b.promo ? 'Rabatkode: ' + clean(b.promo, 50) : undefined
              }))
            }]
          }
        });
        if (out && out.errors && out.errors.length) {
          console.error('batch rejected', JSON.stringify(out.errors).slice(0, 300));
          return res.status(409).json({ error: 'conflict', created: 0, rolledBack: 0 });
        }
        // Map results back to what was asked for (same order as sent; match on date + time).
        const pool = (out && out.bookings) || [];
        for (const it of items) {
          const i = pool.findIndex((r) => normDate(r.date) === it.date && String(r.arrival).slice(0, 5) === it.time);
          const hit = i >= 0 ? pool.splice(i, 1)[0] : null;
          if (!hit) throw new EtbError(502, 'Bookingsystemet gav et uventet svar.');
          created.push({ room: it.room, date: it.date, time: it.time, persons: Number(it.persons), bookingId: hit.bookingID, paymentUrl: hit.paymentURL || null });
        }
        usedBatch = true;
      } catch (e) {
        const noPermission = e instanceof EtbError && (e.upstream === 401 || e.upstream === 403);
        if (!noPermission) throw e;
        created.length = 0; // fall through to one-by-one below
      }
    }

    if (!usedBatch) {
      for (const it of items) {
        if (created.length) await sleep(400);
        const body = {
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
            guestNote: noteFor(it),
            reference: b.promo ? clean(b.promo, 50) : undefined
        };
        // Only the first room needs the card; the others skip payment so the guest confirms once.
        if (created.length) body.ignorePayment = 1;
        let booking;
        try {
          booking = await etb('/v2/bookings', { method: 'POST', body });
        } catch (e) {
          // If the API key may not skip payment, book normally (that room will then ask for its own card).
          if (!(created.length && e instanceof EtbError && (e.upstream === 401 || e.upstream === 403))) throw e;
          console.error('ignorePayment not permitted – booking with payment');
          delete body.ignorePayment;
          booking = await etb('/v2/bookings', { method: 'POST', body });
        }
        created.push({ room: it.room, date: it.date, time: it.time, persons: Number(it.persons), bookingId: booking.bookingID, paymentUrl: booking.paymentURL || null });
      }
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
