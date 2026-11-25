const { EtbError, etb, getAvailability, validDate, parsePersons } = require('./_etb');

// Guest mobile as digits incl. country code (easyTable wants an integer). Bare 8-digit numbers are Danish.
function parseMobile(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 8) d = '45' + d;
  return /^\d{8,15}$/.test(d) ? Number(d) : null;
}

// POST /api/book  { room, date, time, persons, name, phone, email, promo? }
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const persons = parsePersons(b.persons);
    const name = String(b.name || '').trim().slice(0, 100);
    const email = String(b.email || '').trim().slice(0, 150);
    const mobile = parseMobile(b.phone);
    const time = String(b.time || '');

    if (!b.room || !validDate(b.date) || !/^\d{2}:\d{2}$/.test(time) || !persons || !name ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !mobile) {
      return res.status(400).json({ error: 'Tjek venligst dine oplysninger.' });
    }

    // Re-check availability right before booking – the slot may have been taken meanwhile.
    const avail = await getAvailability(b.room, b.date, persons);
    const slot = avail.times.find((t) => t.time === time);
    if (!slot) {
      return res.status(409).json({ error: 'Det valgte tidspunkt er desværre ikke ledigt længere. Vælg venligst et andet.' });
    }

    const booking = await etb('/v2/bookings', {
      method: 'POST',
      body: {
        date: b.date,
        time,
        persons,
        typeID: slot.typeId,
        autoTable: true,
        name,
        email,
        mobile,
        language: 'DA',
        onlineBooking: 1,
        emailNotifications: 1,
        guestNote: `Booket via hjemmesiden: ${b.room}`,
        reference: b.promo ? String(b.promo).trim().slice(0, 50) : undefined
      }
    });

    res.status(200).json({ ok: true, bookingId: booking.bookingID, paymentUrl: booking.paymentURL || null });
  } catch (e) {
    if (e instanceof EtbError) {
      return res.status(e.status).json({
        error: e.status === 409 ? 'Det valgte tidspunkt er desværre ikke ledigt længere. Vælg venligst et andet.' : e.message
      });
    }
    res.status(500).json({ error: 'Der opstod en fejl.' });
  }
};
