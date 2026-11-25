/**
 * Shared helpers for the easyTable integration (server-side only).
 * Credentials come from environment variables – never hard-code them:
 *   ETB_API_KEY       easyTable API key  (X-Api-Key)
 *   ETB_PLACE_TOKEN   easyTable place token (X-Place-Token)
 */
const BASE_URL = 'https://api.easytable.com';

// Booking-form room name  ->  easyTable booking type IDs.
// Games with two physical rooms list both; a time is free if either is free.
// Keys must match the <option value> in index.html's #selectRoom.
const ROOMS = {
  'The Rogue General': [3701],
  'Dr. Evil’s Plan': [2460],
  'The Terrorist Cell v.2.0': [1457, 1458],
  'The Psychotic Janitor': [1456, 7256],
  'Vikings': [1460, 1900],
  'Hacked!': [11903, 13787],
  'Escape The Lost Pyramid': [7036],
  'Beyond Medusa’s Gate': [7036],
  'The Dagger of Time': [7036],
  'Stormen på København 1659': [11490]
  // Not in easyTable online booking: Herredsfogdens Morderjagt, Stop The Bomb
};

class EtbError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function credentials() {
  const key = process.env.ETB_API_KEY;
  const place = process.env.ETB_PLACE_TOKEN;
  if (!key || !place) throw new EtbError(500, 'Booking er ikke konfigureret endnu.');
  return { 'X-Api-Key': key, 'X-Place-Token': place };
}

async function etb(path, { method = 'GET', query, body } = {}) {
  const url = new URL(BASE_URL + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers = { ...credentials(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) };
  let res;
  // easyTable allows ~3 requests/second; retry reads once on HTTP 429 (never retry writes).
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new EtbError(502, 'Kunne ikke forbinde til bookingsystemet.');
    }
    if (res.status === 429 && method === 'GET' && attempt < 2) {
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    break;
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    console.error('easyTable error', method, path, res.status, typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200));
    if (res.status === 429) throw new EtbError(429, 'For mange forespørgsler – prøv igen om et øjeblik.');
    throw new EtbError(res.status === 422 ? 409 : 502, 'Bookingsystemet afviste forespørgslen.', data);
  }
  return data;
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function parsePersons(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

/**
 * Real availability for a room on a date.
 * Returns { open, times: [{ time, typeId, payment }], booked: ['HH:MM', ...] }
 *  - times:  slots that can be booked right now
 *  - booked: slots the room is configured to offer online but are taken
 */
async function getAvailability(room, date, persons) {
  const typeIds = ROOMS[room];
  if (!typeIds) throw new EtbError(400, 'Dette rum kan ikke bookes online – kontakt os venligst.');

  // 2 upstream calls per request (rate limit is ~3/s). Rooms of the same game share one schedule,
  // so the configured times of the first type are enough to tell which slots are "booked".
  const [avail, configured] = await Promise.all([
    etb('/v2/availability', {
      query: { date, persons, includePrepayment: 1, includeMandatoryPreorder: 1, distinct: 0 }
    }),
    etb('/v2/availability/times', { query: { date, persons, typeID: typeIds[0] } })
  ]);

  const free = new Map(); // time -> { typeId, payment }
  for (const a of avail.availabilityTimes || []) {
    const id = a.bookingType && a.bookingType.id;
    if (!typeIds.includes(id) || free.has(a.time)) continue;
    free.set(a.time, { typeId: id, payment: a.payment && a.payment.amount ? { type: a.payment.type, amount: a.payment.amount, currency: a.currency } : null });
  }

  const offered = new Set();
  let open = !!avail.dayStatus && !!avail.onlineBooking;
  for (const t of (configured && configured.times) || []) if (t.online && t.available === 1) offered.add(t.time);

  const times = [...free.entries()].map(([time, v]) => ({ time, ...v })).sort((a, b) => a.time.localeCompare(b.time));
  const booked = [...offered].filter((t) => !free.has(t)).sort();
  return { open, times, booked };
}

/**
 * Which days of a month can be booked online (configuration-based: open, inside the booking
 * window and past the minimum notice – it does not know whether every slot is already taken).
 * month: 'YYYY-MM'.  Returns { 'YYYY-MM-DD': true|false }
 */
async function getDays(room, month, persons) {
  const typeIds = ROOMS[room];
  if (!typeIds) throw new EtbError(400, 'Dette rum kan ikke bookes online – kontakt os venligst.');
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const data = await etb('/v2/availability/days', {
    query: { startDate: `${month}-01`, endDate: `${month}-${String(last).padStart(2, '0')}`, persons, typeID: typeIds[0] }
  });
  const out = {};
  for (let d = 1; d <= last; d++) out[`${month}-${String(d).padStart(2, '0')}`] = false;
  for (const day of (data && data.availability) || []) {
    const [mm, dd, yyyy] = String(day.date).split('/'); // API dates are MM/DD/YYYY
    const key = `${yyyy}-${mm}-${dd}`;
    if (key in out) out[key] = (day.times || []).some((t) => t.available === 1);
  }
  return out;
}

module.exports = { ROOMS, EtbError, etb, getAvailability, getDays, validDate, parsePersons };
