/**
 * Shared helpers for the easyTable integration (server-side only).
 * Credentials come from environment variables – never hard-code them:
 *   ETB_API_KEY       easyTable API key  (X-Api-Key)
 *   ETB_PLACE_TOKEN   easyTable place token (X-Place-Token)
 */
const BASE_URL = 'https://api.easytable.com';

// Room ids used by the booking flow (booking.js)  ->  easyTable booking type + group size limits.
const ROOMS = {
  vik1: { type: 1460, min: 4, max: 8, name: 'Vikings A' },
  vik2: { type: 1900, min: 4, max: 8, name: 'Vikings B' },
  evil: { type: 2460, min: 4, max: 8, name: 'Dr. Evil’s Plan' },
  rogue: { type: 3701, min: 3, max: 8, name: 'The Rogue General' },
  jan1: { type: 1456, min: 4, max: 8, name: 'The Psychotic Janitor A' },
  jan2: { type: 7256, min: 4, max: 8, name: 'The Psychotic Janitor B' },
  cell1: { type: 1457, min: 4, max: 8, name: 'The Terrorist Cell A' },
  cell2: { type: 1458, min: 4, max: 8, name: 'The Terrorist Cell B' },
  hack1: { type: 11903, min: 3, max: 6, name: 'HACKED! A Exclusive' },
  hack2: { type: 13787, min: 3, max: 6, name: 'HACKED! B Exclusive' },
  vr: { type: 7036, min: 2, max: 2, name: 'Virtual Reality' }
};

class EtbError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  // easyTable allows ~3 requests/second; retry reads on HTTP 429 (never retry writes).
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new EtbError(502, 'Kunne ikke forbinde til bookingsystemet.');
    }
    if (res.status === 429 && method === 'GET' && attempt < 2) {
      await sleep(700);
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
    const err = new EtbError(res.status === 422 ? 409 : 502, 'Bookingsystemet afviste forespørgslen.', data);
    err.upstream = res.status;
    throw err;
  }
  return data;
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/** Real availability for a date and party size, one entry per booking type and time. */
function fetchAvailability(date, persons) {
  return etb('/v2/availability', {
    query: { date, persons, includePrepayment: 1, includeMandatoryPreorder: 1, distinct: 0 }
  });
}

/**
 * Everything the booking flow needs to draw one day.
 * Returns { open, rooms: { roomId: { times: ['10:00', ...], guarantee: {type, amount, currency} | null } } }
 * Rooms are checked with a typical group (4 players; VR with 2) – the exact group size is re-checked on booking.
 */
async function getDay(date) {
  const [a4, a2] = await Promise.all([fetchAvailability(date, 4), fetchAvailability(date, 2)]);
  const byType = (data) => {
    const m = new Map();
    for (const a of (data && data.availabilityTimes) || []) {
      const id = a.bookingType && a.bookingType.id;
      if (!m.has(id)) m.set(id, []);
      m.get(id).push(a);
    }
    return m;
  };
  const t4 = byType(a4);
  const t2 = byType(a2);
  const rooms = {};
  for (const [id, room] of Object.entries(ROOMS)) {
    const list = (room.min > 2 ? t4 : t2).get(room.type) || [];
    const seen = new Set();
    const times = [];
    for (const a of list) if (!seen.has(a.time)) { seen.add(a.time); times.push(a.time); }
    times.sort();
    const pay = list.find((a) => a.payment && a.payment.amount);
    rooms[id] = {
      times,
      guarantee: pay ? { type: pay.payment.type, amount: pay.payment.amount, currency: pay.currency } : null
    };
  }
  return { open: !!(a4 && a4.dayStatus) && !!(a4 && a4.onlineBooking), rooms };
}

/**
 * Which days of a month have anything bookable online (open, inside the booking window and past
 * the minimum notice – not every slot may be free). month: 'YYYY-MM'. Returns { 'YYYY-MM-DD': bool }.
 */
async function getDays(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const data = await etb('/v2/availability/days', {
    query: { startDate: `${month}-01`, endDate: `${month}-${String(last).padStart(2, '0')}`, persons: 4 }
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

async function cancelBooking(bookingID) {
  try {
    await etb('/v2/bookings', { method: 'PUT', query: { bookingID }, body: { bookingID, statusID: 2 } });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { ROOMS, EtbError, sleep, etb, fetchAvailability, getDay, getDays, cancelBooking, validDate };
