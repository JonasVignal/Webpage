/**
 * Escape Copenhagen – booking flow (V2: pick a time first, then the free rooms).
 * Talks to the server functions in /api (which hold the easyTable credentials):
 *   GET  /api/day?date=YYYY-MM-DD     real free times per room for one day
 *   GET  /api/days?month=YYYY-MM      which days of a month can be booked at all
 *   POST /api/book                    creates the bookings
 * Exposes openBookingModal() / closeBookingModal() for the buttons on the page.
 */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     Config – rooms, prices and rules. Edit prices here.
     ---------------------------------------------------------------------- */
  var IMG = 'https://escape-cph.dk/wp-content/uploads/';
  var NV = 'Nørre Voldgade', NF = 'Nørre Farimagsgade', TB = 'Tornebuskegade';
  var ROOMS = [
    { id: 'vik1', name: 'Vikings I', min: 4, max: 8, loc: NV, tone: '#5A3E2B', img: IMG + 'viking_small.jpg' },
    { id: 'vik2', name: 'Vikings II', min: 4, max: 8, loc: NV, tone: '#6E4A31', img: IMG + 'viking_small.jpg' },
    { id: 'evil', name: 'Dr. Evil’s Plan', min: 4, max: 8, loc: NV, tone: '#3B2E5A', img: IMG + 'Dr-Evil.jpg' },
    { id: 'rogue', name: 'The Rogue General', min: 3, max: 8, loc: NV, tone: '#3D4A2E', img: IMG + 'Escape_General_small.png' },
    { id: 'jan1', name: 'The Psychotic Janitor I', min: 4, max: 8, loc: NF, tone: '#2F4F4F', img: IMG + 'janitor_small.jpg' },
    { id: 'jan2', name: 'The Psychotic Janitor II', min: 4, max: 8, loc: NF, tone: '#2A5A5A', img: IMG + 'janitor_small.jpg' },
    { id: 'cell1', name: 'The Terrorist Cell I', min: 4, max: 8, loc: NF, tone: '#5A2E2E', img: IMG + 'terrorist_small.jpg' },
    { id: 'cell2', name: 'The Terrorist Cell II', min: 4, max: 8, loc: NF, tone: '#6B3434', img: IMG + 'terrorist_small.jpg' },
    { id: 'hack1', name: 'HACKED! I Exclusive', min: 3, max: 6, loc: TB, tone: '#1C2B36', img: IMG + 'ESCAPE-ROOM-Hacker_small.png' },
    { id: 'hack2', name: 'HACKED! II Exclusive', min: 3, max: 6, loc: TB, tone: '#22394A', img: IMG + 'ESCAPE-ROOM-Hacker_small.png' },
    { id: 'vr', name: 'Virtual Reality', min: 2, max: 2, loc: '', tone: '#2A2418', img: 'https://escape-cph.dk/wp-content/themes/yootheme/cache/pyramid_small-460dabd9.jpg' }
  ];
  var MIN_NOTICE_DAYS = 2;   // bookings need 48 hours' notice
  var MAX_DAYS = 180;        // how far ahead the calendar goes (closed/unbookable days are greyed out)
  var DEFAULT_PLAYERS = 4;
  var MAX_PLAYERS = 40;

  // Price per player (DKK, incl. VAT) by weekday – the same for every room.
  // 0 = Sunday … 6 = Saturday.
  var PRICE_BY_WEEKDAY = { 0: 240, 1: 240, 2: 299, 3: 299, 4: 299, 5: 329, 6: 329 };
  function price(dateStr) {
    return { pps: PRICE_BY_WEEKDAY[parseDate(dateStr).getDay()], kind: '' };
  }

  /* ----------------------------------------------------------------------
     Text (da / en)
     ---------------------------------------------------------------------- */
  var TXT = {
    da: {
      stepsAria: 'Bookingtrin', steps: ['Vælg spil', 'Dine oplysninger', 'Bekræftelse'], close: 'Luk',
      title: 'Book jeres spil',
      intro: 'Vælg en dag, åbn et tidspunkt, angiv hvor mange I er, og vælg rum. Er I en stor gruppe, kan I vælge flere rum på samme tid – vi fordeler jer og viser den samlede pris undervejs.',
      dayLabel: 'Dag', calendar: 'Kalender', prevWeek: 'Forrige uge', nextWeek: 'Næste uge', prevMonth: 'Forrige måned', nextMonth: 'Næste måned',
      quick: ['Næste weekend', 'Om 2 uger', 'Om 1 måned'], calNote: 'Laveste pris pr. spiller den dag.',
      priceNote: 'Priser pr. spiller inkl. moms', dealNote: 'hverdagsformiddage', peak: 'Spidstid', peakNote: 'fre–lør aftener',
      pickTime: 'Vælg et tidspunkt, angiv antal spillere og vælg rum.',
      from: 'fra', perPlayer: 'spiller', playersRange: 'spillere', bookedWord: 'Optaget', selectedWord: 'valgt',
      fullyBooked: 'Alt optaget', roomsFree: function (f, n) { return f + ' af ' + n + ' rum ledige'; }, selCount: function (n) { return n + ' valgt'; },
      countQ: function (t) { return 'Hvor mange spiller kl. ' + t + '?'; }, countHint: 'Rum, der kræver flere spillere, bliver grå.',
      fewer: 'Færre spillere', more: 'Flere spillere',
      blockedTitle: function (n, l) { return 'Kræver ' + n + ' spillere – der er ' + l + ' tilbage på denne tid'; },
      yourBooking: 'Din booking', emptyV2: 'Åbn et tidspunkt og vælg et eller flere rum. Stor gruppe? Vælg flere rum på samme tid – vi fordeler jer.',
      sessSub: function (g) { return g === 1 ? '1 spil' : g + ' spil sideløbende'; }, focusAria: 'Vælg denne tid',
      countLabel: function (n) { return n + ' spillere'; }, calc: function (n, p) { return n + ' spillere × ' + p; },
      ok: function (n) { return 'Alle ' + n + ' spillere har en plads.'; },
      left: function (n) { return n + (n === 1 ? ' spiller mangler' : ' spillere mangler') + ' stadig et rum. Tilføj et rum på samme tid.'; },
      over: function (n) { return 'Disse rum kræver mindst ' + n + ' spillere. Fjern et rum eller tilføj spillere.'; },
      greyHint: 'Grå rum kræver flere spillere, end I har tilbage på det tidspunkt. Vælg en anden tid for at starte en ny gruppe.',
      total: 'I alt', inclVat: 'inkl. moms', cont: 'Fortsæt', noCharge: 'Intet bliver trukket, før du bekræfter i trin 3.',
      games: function (g) { return g === 1 ? '1 spil' : g + ' spil'; },
      removeLine: 'Fjern', loading: 'Henter ledige tider…', loadErr: 'Kunne ikke hente ledige tider.', retry: 'Prøv igen',
      closedDay: 'Der kan ikke bookes online denne dag. Vælg en anden dag.', noTimes: 'Ingen ledige tider denne dag. Prøv en anden dag.',
      changeGames: 'Skift spil', almost: 'Næsten færdig', oneSet: 'Ét sæt oplysninger for hele bookingen – uanset hvor mange rum og dage.',
      who: 'Hvem booker?', private: 'Privat', company: 'Firma', cvr: 'CVR-nummer', cvrPh: '8 cifre', companyName: 'Firmanavn', companyPh: 'Firmaets navn',
      name: 'Fulde navn', namePh: 'Fornavn og efternavn', phone: 'Telefon', email: 'E-mail', emailPh: 'Bekræftelsen sendes hertil',
      comment: 'Kommentar', optional: '(valgfri)', commentPh: 'Fødselsdag, firmaarrangement, tilgængelighed…',
      accept: 'Jeg accepterer', termsLink: 'handelsbetingelserne', required: '(påkrævet)', news: 'Send mig nyheder om nye rum og tilbud',
      payTo: 'Book og fortsæt', booking: 'Booker…', yourOrder: 'Din ordre', codePh: 'Rabatkode (valgfri)', codeNote: 'Koden registreres på bookingen.',
      gamesLine: 'Spil', vatLine: 'Heraf moms (25%)', toPay: 'Samlet pris',
      priceNoteFinal: 'Prisen betales på dagen. Online bekræftes bookingen med et kort.',
      fixForm: 'Udfyld navn, telefon og e-mail, og accepter betingelserne.',
      conflict: 'Et af de valgte tidspunkter blev desværre netop optaget. Ingen bookinger er oprettet – vælg et andet tidspunkt.',
      genericErr: 'Booking mislykkedes. Prøv igen, eller ring til os.', partialErr: 'Noget gik galt, og vi kunne ikke rydde helt op. Ring til os, så hjælper vi.',
      confirmTitle: 'Bekræft med kort', doneTitle: 'Tak for jeres booking!',
      confirmIntro: 'Jeres tider er reserveret. Bekræft bookingen med ét kort for at gennemføre den – der trækkes kun et gebyr ved udeblivelse.',
      doneIntro: 'En bekræftelse er sendt til jeres e-mail.', guarantee: 'Kortgaranti', confirmBtn: 'Bekræft med kort', back: 'Tilbage', newBooking: 'Ny booking',
      dow: ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'], dowL: ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'],
      mon: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
      monL: ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'],
      calDow: ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'], minNotice: '48 timers varsel',
      dShort: function (w, d, m) { return w + ' ' + d + '. ' + m; }, dLong: function (w, d, m) { return w.charAt(0).toUpperCase() + w.slice(1) + ' ' + d + '. ' + m; }
    },
    en: {
      stepsAria: 'Booking steps', steps: ['Choose games', 'Your details', 'Confirmation'], close: 'Close',
      title: 'Book your games',
      intro: 'Pick a day, open a time, set how many you are and choose rooms. Big group? Pick several rooms at the same time – we split you up and show the full price as you go.',
      dayLabel: 'Day', calendar: 'Calendar', prevWeek: 'Previous week', nextWeek: 'Next week', prevMonth: 'Previous month', nextMonth: 'Next month',
      quick: ['Next weekend', 'In 2 weeks', 'In 1 month'], calNote: 'Lowest price per player that day.',
      priceNote: 'Prices per player, incl. VAT', dealNote: 'weekday mornings', peak: 'Peak', peakNote: 'Fri–Sat evenings',
      pickTime: 'Pick a time, set how many you are, then choose rooms.',
      from: 'from', perPlayer: 'player', playersRange: 'players', bookedWord: 'Booked', selectedWord: 'selected',
      fullyBooked: 'Fully booked', roomsFree: function (f, n) { return f + ' of ' + n + ' rooms free'; }, selCount: function (n) { return n + ' selected'; },
      countQ: function (t) { return 'How many players at ' + t + '?'; }, countHint: 'Rooms that need more players are greyed out.',
      fewer: 'Fewer players', more: 'More players',
      blockedTitle: function (n, l) { return 'Needs ' + n + ' players – ' + l + ' left at this time'; },
      yourBooking: 'Your booking', emptyV2: 'Open a time and pick one or more rooms. Big group? Pick several rooms at the same time – we split you up.',
      sessSub: function (g) { return g === 1 ? '1 game' : g + ' games side by side'; }, focusAria: 'Select this time',
      countLabel: function (n) { return n + ' players'; }, calc: function (n, p) { return n + ' players × ' + p; },
      ok: function (n) { return 'All ' + n + ' players have a spot.'; },
      left: function (n) { return n + (n === 1 ? ' player still needs' : ' players still need') + ' a room. Add a room at the same time.'; },
      over: function (n) { return 'These rooms need at least ' + n + ' players. Remove a room or add players.'; },
      greyHint: 'Greyed-out rooms need more players than you have left at that time. Pick another time to start a new group.',
      total: 'Total', inclVat: 'incl. VAT', cont: 'Continue', noCharge: 'Nothing is charged until you confirm in step 3.',
      games: function (g) { return g === 1 ? '1 game' : g + ' games'; },
      removeLine: 'Remove', loading: 'Loading available times…', loadErr: 'Could not load available times.', retry: 'Try again',
      closedDay: 'This day cannot be booked online. Pick another day.', noTimes: 'No available times this day. Try another day.',
      changeGames: 'Change games', almost: 'Almost there', oneSet: 'One set of details for the whole booking – however many rooms and days.',
      who: 'Who is booking?', private: 'Private', company: 'Company', cvr: 'CVR number', cvrPh: '8 digits', companyName: 'Company name', companyPh: 'Company name',
      name: 'Full name', namePh: 'First and last name', phone: 'Phone', email: 'Email', emailPh: 'Booking confirmation goes here',
      comment: 'Comment', optional: '(optional)', commentPh: 'Birthday, team event, accessibility needs…',
      accept: 'I accept the', termsLink: 'terms and conditions', required: '(required)', news: 'Send me news about new rooms and offers',
      payTo: 'Book and continue', booking: 'Booking…', yourOrder: 'Your order', codePh: 'Discount code (optional)', codeNote: 'The code is saved on the booking.',
      gamesLine: 'Games', vatLine: 'Of which VAT (25%)', toPay: 'Total price',
      priceNoteFinal: 'The price is paid on the day. Online, the booking is confirmed with a card.',
      fixForm: 'Fill in name, phone and email, and accept the terms.',
      conflict: 'One of the chosen times was just taken. No bookings were made – please pick another time.',
      genericErr: 'Booking failed. Please try again or call us.', partialErr: 'Something went wrong and we could not fully clean up. Please call us and we will help.',
      confirmTitle: 'Confirm with a card', doneTitle: 'Thanks for your booking!',
      confirmIntro: 'Your times are reserved. Confirm the booking with one card to complete it – a fee is only charged for no-shows.',
      doneIntro: 'A confirmation has been sent to your email.', guarantee: 'Card guarantee', confirmBtn: 'Confirm with card', back: 'Back', newBooking: 'New booking',
      dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], dowL: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      monL: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      calDow: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], minNotice: '48 hours notice',
      dShort: function (w, d, m) { return w + ' ' + d + ' ' + m; }, dLong: function (w, d, m) { return w + ' ' + d + ' ' + m; }
    }
  };

  /* ----------------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function toMinutes(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return n.toLocaleString('da-DK') + ' kr'; }
  function roomById(id) { for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i].id === id) return ROOMS[i]; return null; }

  var baseDate = (function () { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + MIN_NOTICE_DAYS); return d; })();
  function dateAt(i) { var d = new Date(baseDate); d.setDate(d.getDate() + i); return fmtDate(d); }
  function indexOf(dateStr) { return Math.round((parseDate(dateStr) - baseDate) / 86400000); }

  var ICON = {
    left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    chev: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    minus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    cal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>'
  };

  /* ----------------------------------------------------------------------
     State
     ---------------------------------------------------------------------- */
  var S = {
    open: false, lang: 'da', step: 1,
    day: null, stripStart: 0, calOpen: false, calMonth: null,
    sel: [],            // 'YYYY-MM-DD|roomId|HH:MM'
    sess: {},           // 'YYYY-MM-DD|HH:MM' -> players
    draft: {},          // players typed for a time before any room is picked
    players: DEFAULT_PLAYERS,
    openT: {},          // expanded time rows
    avail: {},          // date -> { open, rooms }
    availState: {},     // date -> 'loading' | 'error'
    days: {},           // 'YYYY-MM' -> { date: bool } (or 'loading')
    customer: { type: 'private', cvr: '', company: '', name: '', phone: '', email: '', comment: '', promo: '', terms: false, news: false },
    submitting: false, error: '', notice: '', result: null
  };
  var rootEl = null, overlayEl = null, lastFocus = null, blockedAny = false;

  function T() { return TXT[S.lang]; }
  function skOf(key) { var p = key.split('|'); return p[0] + '|' + p[2]; }
  function playersFor(sk) { return S.sess[sk] != null ? S.sess[sk] : (S.draft[sk] != null ? S.draft[sk] : S.players); }

  /* ----------------------------------------------------------------------
     Data loading
     ---------------------------------------------------------------------- */
  function loadDay(date) {
    if (S.avail[date] || S.availState[date] === 'loading') return;
    S.availState[date] = 'loading';
    fetch('/api/day?date=' + encodeURIComponent(date))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'err'); return j; }); })
      .then(function (data) { S.avail[date] = data; delete S.availState[date]; render(); })
      .catch(function () { S.availState[date] = 'error'; render(); });
  }
  function loadMonth(month) {
    if (S.days[month]) return;
    S.days[month] = 'loading';
    fetch('/api/days?month=' + month)
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error('err'); return j; }); })
      .then(function (data) { S.days[month] = data.days; render(); })
      .catch(function () { S.days[month] = {}; }); // unknown: leave days selectable
  }
  function dayBookable(date) {
    var m = S.days[date.slice(0, 7)];
    if (!m || m === 'loading') return true;           // unknown yet: selectable
    if (!(date in m)) return true;
    return m[date] === true;
  }
  function ensureData() {
    loadDay(S.day);
    var months = {};
    months[S.day.slice(0, 7)] = 1;
    months[dateAt(S.stripStart).slice(0, 7)] = 1;
    months[dateAt(Math.min(MAX_DAYS - 1, S.stripStart + 13)).slice(0, 7)] = 1;
    if (S.calOpen && S.calMonth) months[S.calMonth] = 1;
    Object.keys(months).forEach(loadMonth);
  }

  /* ----------------------------------------------------------------------
     Selection logic
     ---------------------------------------------------------------------- */
  function toggleRoom(key) {
    var sk = skOf(key);
    var i = S.sel.indexOf(key);
    if (i >= 0) {
      S.sel.splice(i, 1);
      if (!S.sel.some(function (k) { return skOf(k) === sk; })) delete S.sess[sk];
    } else {
      S.sel.push(key);
      if (S.sess[sk] == null) S.sess[sk] = playersFor(sk);
    }
  }
  function setCount(sk, n) {
    n = Math.max(1, Math.min(MAX_PLAYERS, n));
    if (S.sess[sk] != null) S.sess[sk] = n; else S.draft[sk] = n;
    S.players = n;
  }

  /** Cart grouped into sessions (same day + start time = one group of players); players split across rooms. */
  function buildCart() {
    var items = S.sel.map(function (k) {
      var p = k.split('|');
      var room = roomById(p[1]);
      return { key: k, sk: p[0] + '|' + p[2], date: p[0], time: p[2], room: room, pps: price(p[0], room, p[2]).pps, assigned: room.min };
    });
    var order = [];
    items.forEach(function (it) { if (order.indexOf(it.sk) < 0) order.push(it.sk); });
    order.sort();
    var total = 0, allOk = order.length > 0, minUsed = {};
    var sessions = order.map(function (sk) {
      var its = items.filter(function (it) { return it.sk === sk; });
      var n = playersFor(sk);
      var sumMin = its.reduce(function (a, it) { return a + it.room.min; }, 0);
      minUsed[sk] = sumMin;
      var left = n - sumMin, progress = true;
      while (left > 0 && progress) {
        progress = false;
        its.forEach(function (it) { if (left > 0 && it.assigned < it.room.max) { it.assigned++; left--; progress = true; } });
      }
      var leftover = Math.max(0, left), over = sumMin > n, ok = !over && leftover === 0;
      if (!ok) allOk = false;
      var sub = its.reduce(function (a, it) { return a + it.assigned * it.pps; }, 0);
      total += sub;
      return { sk: sk, date: sk.split('|')[0], time: sk.split('|')[1], n: n, its: its, sumMin: sumMin, leftover: leftover, over: over, ok: ok, sub: sub };
    });
    return { items: items, sessions: sessions, total: total, allOk: allOk, minUsed: minUsed };
  }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */
  function dayLabelShort(date) { var d = parseDate(date), t = T(); return t.dShort(t.dow[d.getDay()], d.getDate(), t.mon[d.getMonth()]); }
  function dayLabelLong(date) { var d = parseDate(date), t = T(); return t.dLong(t.dowL[d.getDay()], d.getDate(), t.monL[d.getMonth()]); }

  function dayFrom(date) { return price(date).pps; }

  function headerHtml() {
    var t = T();
    var steps = t.steps.map(function (label, i) {
      var n = i + 1, cur = n === S.step, done = n < S.step;
      return '<li class="bk-step' + (cur ? ' is-cur' : '') + (done ? ' is-done' : '') + '"><span class="bk-stepdot">' + n + '</span><span>' + esc(label) + '</span></li>';
    }).join('');
    return '<header class="bk-header"><div class="bk-header-in">' +
      '<img class="bk-logo" src="https://escape-cph.dk/wp-content/uploads/escape_cph_logo.svg" alt="Escape Copenhagen" width="136" height="49">' +
      '<div class="bk-header-right"><ol class="bk-steps" aria-label="' + esc(t.stepsAria) + '">' + steps + '</ol>' +
      '<div class="bk-lang" role="group" aria-label="Language / Sprog">' +
      '<button type="button" data-act="lang" data-v="da" aria-pressed="' + (S.lang === 'da') + '" class="' + (S.lang === 'da' ? 'on' : '') + '">DA</button>' +
      '<button type="button" data-act="lang" data-v="en" aria-pressed="' + (S.lang === 'en') + '" class="' + (S.lang === 'en' ? 'on' : '') + '">EN</button></div>' +
      '<button type="button" class="bk-x" data-act="close" aria-label="' + esc(t.close) + '">' + ICON.x + '</button></div>' +
      '</div></header>';
  }

  function stripHtml(cart) {
    var t = T(), days = '';
    var end = Math.min(MAX_DAYS, S.stripStart + 14);
    for (var i = S.stripStart; i < end; i++) {
      var date = dateAt(i), d = parseDate(date), active = date === S.day, ok = dayBookable(date);
      var has = S.sel.some(function (k) { return k.split('|')[0] === date; });
      var from = dayFrom(date);
      days += '<button type="button" class="bk-day' + (active ? ' is-active' : '') + '" data-act="day" data-date="' + date + '"' + (ok ? '' : ' disabled') +
        ' aria-pressed="' + active + '" aria-label="' + esc(dayLabelLong(date)) + '">' +
        '<span class="bk-day-dow">' + esc(t.dow[d.getDay()]) + '</span><span class="bk-day-num">' + d.getDate() + '</span>' +
        '<span class="bk-day-from">' + (ok ? esc(from + ' kr') : '–') + '</span>' + (has ? '<span class="bk-dot" aria-hidden="true"></span>' : '') + '</button>';
    }
    var s0 = parseDate(dateAt(S.stripStart)), s1 = parseDate(dateAt(end - 1));
    var month = s0.getMonth() === s1.getMonth() ? t.monL[s0.getMonth()] + ' ' + s0.getFullYear() : t.monL[s0.getMonth()] + ' – ' + t.monL[s1.getMonth()] + ' ' + s1.getFullYear();
    return '<section class="bk-controls">' +
      '<div class="bk-controls-head"><span class="bk-eyebrow">' + esc(t.dayLabel) + ' · <b>' + esc(month) + '</b></span>' +
      '<div class="bk-controls-btns">' +
      '<button type="button" class="bk-sq" data-act="stripPrev" aria-label="' + esc(t.prevWeek) + '"' + (S.stripStart <= 0 ? ' disabled' : '') + '>' + ICON.left + '</button>' +
      '<button type="button" class="bk-sq" data-act="stripNext" aria-label="' + esc(t.nextWeek) + '"' + (S.stripStart >= MAX_DAYS - 14 ? ' disabled' : '') + '>' + ICON.right + '</button>' +
      '<button type="button" class="bk-calbtn' + (S.calOpen ? ' on' : '') + '" data-act="toggleCal" aria-expanded="' + S.calOpen + '">' + ICON.cal + ' ' + esc(t.calendar) + '</button></div></div>' +
      '<div class="bk-strip">' + days + '</div>' + (S.calOpen ? calendarHtml() : '') + '</section>';
  }

  function calendarHtml() {
    var t = T();
    var first = parseDate(S.calMonth + '-01');
    var dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    var lead = (first.getDay() + 6) % 7;
    var firstAllowed = S.calMonth <= dateAt(0).slice(0, 7);
    var lastAllowed = S.calMonth >= dateAt(MAX_DAYS - 1).slice(0, 7);
    var cells = '';
    for (var b = 0; b < lead; b++) cells += '<span></span>';
    for (var n = 1; n <= dim; n++) {
      var date = S.calMonth + '-' + pad(n), idx = indexOf(date);
      var enabled = idx >= 0 && idx < MAX_DAYS && dayBookable(date), active = date === S.day;
      var has = S.sel.some(function (k) { return k.split('|')[0] === date; });
      cells += '<button type="button" class="bk-cal-cell' + (active ? ' is-active' : '') + '" data-act="calPick" data-date="' + date + '"' + (enabled ? '' : ' disabled') +
        ' aria-label="' + esc(dayLabelLong(date)) + '"><span class="n">' + n + '</span><span class="p">' + (enabled ? dayFrom(date) : '') + '</span>' + (has ? '<span class="bk-dot sm" aria-hidden="true"></span>' : '') + '</button>';
    }
    var dows = t.calDow.map(function (w) { return '<span class="bk-cal-dow">' + esc(w) + '</span>'; }).join('');
    var quick = [t.quick[0], t.quick[1], t.quick[2]].map(function (l, i) { return '<button type="button" class="bk-pill" data-act="quick" data-i="' + i + '">' + esc(l) + '</button>'; }).join('');
    return '<div class="bk-cal" role="dialog" aria-label="' + esc(t.calendar) + '">' +
      '<div class="bk-cal-head"><button type="button" class="bk-sq" data-act="calPrev" aria-label="' + esc(t.prevMonth) + '"' + (firstAllowed ? ' disabled' : '') + '>' + ICON.left + '</button>' +
      '<b>' + esc(t.monL[first.getMonth()] + ' ' + first.getFullYear()) + '</b>' +
      '<button type="button" class="bk-sq" data-act="calNext" aria-label="' + esc(t.nextMonth) + '"' + (lastAllowed ? ' disabled' : '') + '>' + ICON.right + '</button></div>' +
      '<div class="bk-pills">' + quick + '</div><div class="bk-cal-grid">' + dows + cells + '</div><span class="bk-muted sm">' + esc(t.calNote) + '</span></div>';
  }

  function timeRowsHtml(cart) {
    blockedAny = false;
    var t = T(), date = S.day, data = S.avail[date], st = S.availState[date];
    if (st === 'error') return '<div class="bk-note">' + esc(t.loadErr) + ' <button type="button" class="bk-link" data-act="retryDay">' + esc(t.retry) + '</button></div>';
    if (!data) return '<div class="bk-note">' + esc(t.loading) + '</div>';
    if (!data.open) return '<div class="bk-note">' + esc(t.closedDay) + '</div>';
    var set = {};
    ROOMS.forEach(function (r) { ((data.rooms[r.id] || {}).times || []).forEach(function (tm) { set[tm] = 1; }); });
    var times = Object.keys(set).sort();
    if (!times.length) return '<div class="bk-note">' + esc(t.noTimes) + '</div>';

    return times.map(function (time) {
      var sk = date + '|' + time, n = playersFor(sk), spare = n - (cart.minUsed[sk] || 0);
      var free = 0, selCount = 0, from = Infinity, kind = '';
      var cards = ROOMS.map(function (room) {
        var isFree = ((data.rooms[room.id] || {}).times || []).indexOf(time) >= 0;
        var key = date + '|' + room.id + '|' + time, selected = S.sel.indexOf(key) >= 0;
        var blocked = !selected && isFree && room.min > spare;
        var pr = price(date, room, time);
        if (blocked) blockedAny = true;
        if (isFree) { free++; from = Math.min(from, pr.pps); if (pr.kind) kind = pr.kind; }
        if (selected) selCount++;
        var cls = 'bk-room' + (selected ? ' is-sel' : '') + (!isFree ? ' is-booked' : '') + (blocked ? ' is-blocked' : '');
        var disabled = !isFree || blocked;
        var title = !isFree ? t.bookedWord : (blocked ? t.blockedTitle(room.min, Math.max(0, spare)) : '');
        var meta = room.min + '–' + room.max + ' ' + t.playersRange + (room.loc ? ' · ' + room.loc : '');
        return '<button type="button" class="' + cls + '" data-act="room" data-key="' + key + '"' + (disabled ? ' disabled' : '') + ' aria-pressed="' + selected + '" title="' + esc(title) + '" aria-label="' + esc(room.name + ' ' + time + ', ' + (isFree ? fmt(pr.pps) : t.bookedWord)) + '">' +
          '<img src="' + esc(room.img) + '" alt="" loading="lazy" style="background:' + room.tone + '">' +
          '<span class="bk-room-body"><span class="bk-room-name">' + esc(room.name) + '</span><span class="bk-room-meta">' + esc(meta) + '</span>' +
          '<span class="bk-room-price">' + (isFree ? esc(fmt(pr.pps)) + ' <small>/ ' + esc(t.perPlayer) + '</small>' : esc(t.bookedWord)) + '</span></span>' +
          (selected ? '<span class="bk-check" aria-hidden="true">' + ICON.check + '</span>' : '') + '</button>';
      }).join('');
      var open = free > 0 && (S.openT[sk] !== undefined ? S.openT[sk] : selCount > 0);
      var dots = ROOMS.filter(function (r) { return ((data.rooms[r.id] || {}).times || []).indexOf(time) >= 0; }).map(function (r) { return '<img src="' + esc(r.img) + '" alt="" loading="lazy" style="background:' + r.tone + '">'; }).join('');
      var tag = (kind && free > 0) ? '<span class="bk-tag ' + kind + '">' + (kind === 'deal' ? '−15%' : esc(t.peak)) + '</span>' : '';
      return '<article class="bk-time' + (selCount ? ' has-sel' : '') + '">' +
        '<button type="button" class="bk-time-head" data-act="toggleTime" data-sk="' + sk + '" aria-expanded="' + open + '"' + (free === 0 ? ' disabled' : '') + '>' +
        '<span class="bk-time-t">' + esc(time) + '</span>' +
        '<span class="bk-time-info"><b>' + esc(free === 0 ? t.fullyBooked : t.roomsFree(free, ROOMS.length)) + '</b><span class="bk-muted">' + (free ? esc(fmt(from) + ' / ' + t.perPlayer) : '') + '</span></span>' +
        '<span class="bk-dots">' + dots + '</span>' + tag +
        (selCount ? '<span class="bk-selpill">' + esc(t.selCount(selCount)) + '</span>' : '') +
        (free ? '<span class="bk-chev' + (open ? ' up' : '') + '">' + ICON.chev + '</span>' : '') + '</button>' +
        (open ? '<div class="bk-time-body"><div class="bk-count"><b>' + esc(t.countQ(time)) + '</b>' +
          '<div class="bk-stepper"><button type="button" data-act="dec" data-sk="' + sk + '"' + (n <= 1 ? ' disabled' : '') + ' aria-label="' + esc(t.fewer) + '">' + ICON.minus + '</button><span>' + n + '</span>' +
          '<button type="button" class="dark" data-act="inc" data-sk="' + sk + '"' + (n >= MAX_PLAYERS ? ' disabled' : '') + ' aria-label="' + esc(t.more) + '">' + ICON.plus + '</button></div>' +
          '<span class="bk-muted sm">' + esc(t.countHint) + '</span></div><div class="bk-rooms">' + cards + '</div></div>' : '') +
        '</article>';
    }).join('');
  }

  function cartHtml(cart, forStep2) {
    var t = T();
    var vat = Math.round(cart.total * 0.2);
    var sess = cart.sessions.map(function (s) {
      var lines = s.its.map(function (it) {
        return '<div class="bk-line"><img src="' + esc(it.room.img) + '" alt="" style="background:' + it.room.tone + '"><div class="bk-line-t"><b>' + esc(it.room.name) + '</b><span class="bk-muted">' + esc(t.calc(it.assigned, fmt(it.pps))) + '</span></div>' +
          '<b class="nowrap">' + esc(fmt(it.assigned * it.pps)) + '</b>' +
          (forStep2 ? '' : '<button type="button" class="bk-rm" data-act="room" data-key="' + it.key + '" aria-label="' + esc(t.removeLine + ' ' + it.room.name) + '">' + ICON.x + '</button>') + '</div>';
      }).join('');
      if (forStep2) return '<div class="bk-sess plain"><div class="bk-sess-head"><b>' + esc(dayLabelShort(s.date) + ' · ' + s.time) + '</b><span class="bk-muted">' + esc(t.countLabel(s.n)) + '</span></div>' + lines + '</div>';
      var denom = Math.max(s.n, s.its.reduce(function (a, it) { return a + it.assigned; }, 0));
      var segs = s.its.map(function (it) { return '<span style="width:' + (it.assigned / denom * 100).toFixed(2) + '%;background:' + it.room.tone + '"></span>'; }).join('') + (s.leftover > 0 ? '<span style="width:' + (s.leftover / denom * 100).toFixed(2) + '%;background:rgba(255,255,255,0.35)"></span>' : '');
      var msg = s.over ? t.over(s.sumMin) : (s.leftover > 0 ? t.left(s.leftover) : t.ok(s.n));
      return '<div class="bk-sess' + (S.day === s.date ? ' focus' : '') + '"><div class="bk-sess-head">' +
        '<button type="button" class="bk-sess-title" data-act="focusSess" data-sk="' + s.sk + '" aria-label="' + esc(t.focusAria) + '"><b>' + esc(dayLabelShort(s.date) + ' · ' + s.time) + '</b><span class="bk-muted sm">' + esc(t.sessSub(s.its.length)) + '</span></button>' +
        '<div class="bk-stepper sm"><button type="button" data-act="dec" data-sk="' + s.sk + '" aria-label="' + esc(t.fewer) + '">' + ICON.minus + '</button><span>' + esc(t.countLabel(s.n)) + '</span>' +
        '<button type="button" class="dark" data-act="inc" data-sk="' + s.sk + '" aria-label="' + esc(t.more) + '">' + ICON.plus + '</button></div></div>' +
        lines + '<div class="bk-bar" role="img">' + segs + '</div>' +
        '<div class="bk-status ' + (s.ok ? 'ok' : 'warn') + '">' + (s.ok ? ICON.check : ICON.warn) + '<span>' + esc(msg) + '</span></div></div>';
    }).join('');
    return { sess: sess, vat: vat };
  }

  function step1Html() {
    var t = T(), cart = buildCart();
    var c = cartHtml(cart, false);
    var dayTitle = dayLabelLong(S.day);
    var ok = cart.allOk;
    var strip = stripHtml(cart);
    var rows = timeRowsHtml(cart);
    return '<main class="bk-main"><div class="bk-head"><h1>' + esc(t.title) + '</h1><p>' + esc(t.intro) + '</p>' +
      (S.notice ? '<div class="bk-status warn" role="alert">' + ICON.warn + '<span>' + esc(S.notice) + '</span></div>' : '') + '</div>' +
      strip +
      '<div class="bk-cols"><section class="bk-left"><div class="bk-left-head"><h2>' + esc(dayTitle) + '</h2><div class="bk-legend"><span>' + esc(t.priceNote) + '</span></div></div>' +
      '<p class="bk-muted">' + esc(t.pickTime) + '</p>' + rows + '</section>' +
      '<aside class="bk-aside"><h2>' + esc(t.yourBooking) + '</h2>' +
      (cart.sessions.length ? c.sess : '<div class="bk-empty">' + esc(t.emptyV2) + '</div>') +
      (cart.sessions.length && blockedAny ? '<p class="bk-muted sm">' + esc(t.greyHint) + '</p>' : '') +
      '<div class="bk-total"><div><span class="bk-muted">' + esc(t.total) + '</span><span class="bk-muted sm">' + esc(t.inclVat + ' ' + fmt(c.vat)) + '</span></div><b class="bk-total-n">' + esc(fmt(cart.total)) + '</b></div>' +
      '<button type="button" class="bk-cta" data-act="toDetails"' + (ok ? '' : ' disabled') + '>' + esc(t.cont) + ICON.arrow + '</button>' +
      '<p class="bk-muted sm center">' + esc(t.noCharge) + '</p></aside></div></main>' +
      '<div class="bk-mbar"><div><span class="bk-muted">' + esc(t.games(cart.items.length)) + '</span><b>' + esc(fmt(cart.total)) + '</b></div>' +
      '<button type="button" class="bk-cta sm" data-act="toDetails"' + (ok ? '' : ' disabled') + '>' + esc(t.cont) + '</button></div>';
  }

  function canSubmit() {
    var c = S.customer;
    return c.terms && c.name.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()) && c.phone.replace(/\D/g, '').length >= 8;
  }

  function step2Html() {
    var t = T(), cart = buildCart(), c = S.customer, v = cartHtml(cart, true);
    var isCo = c.type === 'company';
    return '<main class="bk-main"><div class="bk-head"><button type="button" class="bk-back" data-act="toGames">' + ICON.back + ' ' + esc(t.changeGames) + '</button>' +
      '<h1>' + esc(t.almost) + '</h1><p>' + esc(t.oneSet) + '</p></div>' +
      '<div class="bk-cols"><form class="bk-form bk-left" novalidate onsubmit="return false">' +
      '<fieldset><legend>' + esc(t.who) + '</legend><div class="bk-seg"><button type="button" data-act="ctype" data-v="private" class="' + (!isCo ? 'on' : '') + '" aria-pressed="' + !isCo + '">' + esc(t.private) + '</button>' +
      '<button type="button" data-act="ctype" data-v="company" class="' + (isCo ? 'on' : '') + '" aria-pressed="' + isCo + '">' + esc(t.company) + '</button></div></fieldset>' +
      (isCo ? '<div class="bk-grid2"><div class="bk-field"><label for="bkCvr">' + esc(t.cvr) + '</label><input id="bkCvr" data-in="cvr" inputmode="numeric" placeholder="' + esc(t.cvrPh) + '" value="' + esc(c.cvr) + '"></div>' +
        '<div class="bk-field"><label for="bkCo">' + esc(t.companyName) + '</label><input id="bkCo" data-in="company" placeholder="' + esc(t.companyPh) + '" value="' + esc(c.company) + '"></div></div>' : '') +
      '<div class="bk-grid2"><div class="bk-field full"><label for="bkName">' + esc(t.name) + '</label><input id="bkName" data-in="name" autocomplete="name" placeholder="' + esc(t.namePh) + '" value="' + esc(c.name) + '"></div>' +
      '<div class="bk-field"><label for="bkPhone">' + esc(t.phone) + '</label><div class="bk-phone"><span>+45</span><input id="bkPhone" data-in="phone" type="tel" autocomplete="tel-national" placeholder="12 34 56 78" value="' + esc(c.phone) + '"></div></div>' +
      '<div class="bk-field"><label for="bkEmail">' + esc(t.email) + '</label><input id="bkEmail" data-in="email" type="email" autocomplete="email" placeholder="' + esc(t.emailPh) + '" value="' + esc(c.email) + '"></div>' +
      '<div class="bk-field full"><label for="bkComment">' + esc(t.comment) + ' <span class="bk-muted">' + esc(t.optional) + '</span></label><textarea id="bkComment" data-in="comment" rows="3" placeholder="' + esc(t.commentPh) + '">' + esc(c.comment) + '</textarea></div></div>' +
      '<div class="bk-checks"><label class="bk-check-row"><input type="checkbox" data-in="terms"' + (c.terms ? ' checked' : '') + '><span>' + esc(t.accept) + ' <a href="https://escape-cph.dk/" target="_blank" rel="noopener">' + esc(t.termsLink) + '</a> <span class="bk-muted">' + esc(t.required) + '</span></span></label>' +
      '<label class="bk-check-row"><input type="checkbox" data-in="news"' + (c.news ? ' checked' : '') + '><span>' + esc(t.news) + ' <span class="bk-muted">' + esc(t.optional) + '</span></span></label></div>' +
      (S.error ? '<div class="bk-status warn" role="alert">' + ICON.warn + '<span>' + esc(S.error) + '</span></div>' : '') +
      '<button type="button" class="bk-cta" id="bkSubmit" data-act="submit"' + (canSubmit() && !S.submitting ? '' : ' disabled') + '>' + esc(S.submitting ? t.booking : t.payTo + ' · ' + fmt(cart.total)) + (S.submitting ? '' : ICON.arrow) + '</button>' +
      '<p class="bk-muted sm center" id="bkHint">' + (canSubmit() ? '' : esc(t.fixForm)) + '</p></form>' +
      '<aside class="bk-aside"><div class="bk-aside-head"><h2>' + esc(t.yourOrder) + '</h2><span class="bk-muted">' + esc(t.games(cart.items.length)) + '</span></div>' + v.sess +
      '<div class="bk-field"><label for="bkCode" class="sr">' + esc(t.codePh) + '</label><input id="bkCode" data-in="promo" placeholder="' + esc(t.codePh) + '" value="' + esc(c.promo) + '"><span class="bk-muted sm">' + esc(t.codeNote) + '</span></div>' +
      '<div class="bk-sum"><div><span>' + esc(t.gamesLine) + '</span><span>' + esc(fmt(cart.total)) + '</span></div><div><span>' + esc(t.vatLine) + '</span><span>' + esc(fmt(v.vat)) + '</span></div></div>' +
      '<div class="bk-total"><b>' + esc(t.toPay) + '</b><b class="bk-total-n">' + esc(fmt(cart.total)) + '</b></div>' +
      '<p class="bk-muted sm">' + esc(t.priceNoteFinal) + '</p></aside></div></main>';
  }

  function step3Html() {
    var t = T(), r = S.result || { bookings: [] };
    var needPay = r.bookings.some(function (b) { return b.paymentUrl; });
    var list = r.bookings.map(function (b) {
      var room = roomById(b.room);
      var g = (S.avail[b.date] && S.avail[b.date].rooms[b.room] && S.avail[b.date].rooms[b.room].guarantee) || null;
      return '<div class="bk-done-card"><div><b>' + esc(room ? room.name : b.room) + '</b><span class="bk-muted">' + esc(dayLabelLong(b.date) + ' · ' + b.time + ' · ' + t.countLabel(b.persons)) + '</span>' +
        (b.paymentUrl && g ? '<span class="bk-muted sm">' + esc(t.guarantee + ': ' + fmt(g.amount)) + '</span>' : '') + '</div>' +
        (b.paymentUrl ? '<a class="bk-cta sm" href="' + esc(b.paymentUrl) + '">' + esc(t.confirmBtn) + ICON.arrow + '</a>' : '<span class="bk-okpill">' + ICON.check + '</span>') + '</div>';
    }).join('');
    return '<main class="bk-main narrow"><h1>' + esc(needPay ? t.confirmTitle : t.doneTitle) + '</h1><p class="bk-muted">' + esc(needPay ? t.confirmIntro : t.doneIntro) + '</p>' +
      '<div class="bk-done-list">' + list + '</div>' +
      '<button type="button" class="bk-cta ghost" data-act="finish">' + esc(t.newBooking) + '</button></main>';
  }

  function render() {
    if (!S.open || !rootEl) return;
    if (S.step === 1) ensureData();
    var body = S.step === 1 ? step1Html() : (S.step === 2 ? step2Html() : step3Html());
    rootEl.innerHTML = headerHtml() + body;
  }

  /* ----------------------------------------------------------------------
     Actions
     ---------------------------------------------------------------------- */
  function updateStep2Cta() {
    var btn = document.getElementById('bkSubmit'), hint = document.getElementById('bkHint');
    var ok = canSubmit() && !S.submitting;
    if (btn) btn.disabled = !ok;
    if (hint) hint.textContent = canSubmit() ? '' : T().fixForm;
  }

  function submit() {
    if (S.submitting || !canSubmit()) return;
    var cart = buildCart();
    if (!cart.allOk) { S.step = 1; render(); return; }
    var c = S.customer;
    S.submitting = true; S.error = ''; render();
    var items = [];
    cart.sessions.forEach(function (s) { s.its.forEach(function (it) { items.push({ room: it.room.id, date: it.date, time: it.time, persons: it.assigned }); }); });
    fetch('/api/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items, lang: S.lang, promo: c.promo,
        customer: { name: c.name, phone: c.phone, email: c.email, comment: c.comment, company: c.type === 'company' ? c.company : '', cvr: c.type === 'company' ? c.cvr : '' }
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        S.submitting = false;
        if (res.ok && res.j.ok) {
          var pays = res.j.bookings.filter(function (b) { return b.paymentUrl; });
          if (pays.length === 1) { window.location.href = pays[0].paymentUrl; return; }
          S.result = res.j; S.step = 3; S.sel = []; S.sess = {}; S.draft = {}; render(); scrollTop();
          return;
        }
        if (res.j.error === 'conflict') {
          S.avail = {}; S.availState = {}; S.step = 1; S.error = ''; S.notice = T().conflict; render(); scrollTop();
          return;
        }
        S.error = (res.j.created && !res.j.rolledBack && res.j.created > 0) ? T().partialErr : T().genericErr;
        render();
      }).catch(function () { S.submitting = false; S.error = T().genericErr; render(); });
  }
  function scrollTop() { if (overlayEl) overlayEl.scrollTop = 0; }

  function handleClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || !rootEl.contains(el) || el.disabled) return;
    var act = el.getAttribute('data-act');
    var d = el.dataset;
    if (act !== 'submit') S.notice = '';
    switch (act) {
      case 'close': closeBookingModal(); return;
      case 'lang': S.lang = d.v; break;
      case 'day': S.day = d.date; S.calOpen = false; break;
      case 'stripPrev': S.stripStart = Math.max(0, S.stripStart - 7); break;
      case 'stripNext': S.stripStart = Math.min(MAX_DAYS - 14, S.stripStart + 7); break;
      case 'toggleCal': S.calOpen = !S.calOpen; S.calMonth = S.day.slice(0, 7); break;
      case 'calPrev': case 'calNext': {
        var f = parseDate(S.calMonth + '-01'); f.setMonth(f.getMonth() + (act === 'calNext' ? 1 : -1)); S.calMonth = fmtDate(f).slice(0, 7); break;
      }
      case 'calPick': S.day = d.date; S.calOpen = false; S.stripStart = Math.max(0, Math.min(MAX_DAYS - 14, indexOf(d.date) - 2)); break;
      case 'quick': {
        var i = +d.i, target;
        if (i === 0) { target = 0; for (var k = 1; k < 8; k++) if (parseDate(dateAt(k)).getDay() === 6) { target = k; break; } }
        else target = i === 1 ? 14 : 30;
        S.day = dateAt(Math.min(MAX_DAYS - 1, target)); S.calOpen = false; S.stripStart = Math.max(0, Math.min(MAX_DAYS - 14, target - 2)); break;
      }
      case 'toggleTime': {
        var cur = S.openT[d.sk]; var hasSel = S.sel.some(function (k) { return skOf(k) === d.sk; });
        S.openT[d.sk] = cur === undefined ? !hasSel : !cur; break;
      }
      case 'dec': setCount(d.sk, playersFor(d.sk) - 1); break;
      case 'inc': setCount(d.sk, playersFor(d.sk) + 1); break;
      case 'room': toggleRoom(d.key); break;
      case 'focusSess': S.day = d.sk.split('|')[0]; S.stripStart = Math.max(0, Math.min(MAX_DAYS - 14, indexOf(S.day) - 2)); break;
      case 'retryDay': delete S.availState[S.day]; break;
      case 'toDetails': if (!buildCart().allOk) return; S.step = 2; S.error = ''; scrollTop(); break;
      case 'toGames': S.step = 1; S.error = ''; scrollTop(); break;
      case 'ctype': S.customer.type = d.v; break;
      case 'submit': submit(); return;
      case 'finish': S.step = 1; S.result = null; S.error = ''; S.notice = ''; S.avail = {}; S.availState = {}; scrollTop(); break;
      default: return;
    }
    render();
  }

  function handleInput(e) {
    var el = e.target, k = el.getAttribute && el.getAttribute('data-in');
    if (!k) return;
    S.customer[k] = el.type === 'checkbox' ? el.checked : el.value;
    updateStep2Cta();
  }

  function onKey(e) { if (e.key === 'Escape' && S.open) closeBookingModal(); }

  /* ----------------------------------------------------------------------
     Public API
     ---------------------------------------------------------------------- */
  function ensureDom() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'bk-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-label', 'Escape Copenhagen booking');
    overlayEl.hidden = true;
    rootEl = document.createElement('div');
    rootEl.className = 'bk-root';
    overlayEl.appendChild(rootEl);
    document.body.appendChild(overlayEl);
    rootEl.addEventListener('click', handleClick);
    rootEl.addEventListener('input', handleInput);
    rootEl.addEventListener('change', handleInput);
    document.addEventListener('keydown', onKey);
  }

  window.openBookingModal = function () {
    ensureDom();
    lastFocus = document.activeElement;
    if (!S.day) { S.day = dateAt(0); S.stripStart = 0; S.calMonth = S.day.slice(0, 7); }
    S.open = true; S.error = '';
    if (S.step === 3 && !S.result) S.step = 1;
    overlayEl.hidden = false;
    document.body.style.overflow = 'hidden';
    render();
    var x = rootEl.querySelector('.bk-x'); if (x) x.focus();
  };

  window.closeBookingModal = function () {
    if (!overlayEl) return;
    S.open = false;
    overlayEl.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (_) {} }
  };
})();
