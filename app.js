/**
 * Escape Copenhagen - Main Application Logic
 * Interactive handlers for booking, filtering, sliders, accordions, and modals
 */

document.addEventListener('DOMContentLoaded', () => {
  initDateInputs();
  initRoomFilters();
  initTestimonialsSlider();
  initPriceCalculator();
  initAvailability();
});

/* ==========================================================================
   Announcement Banner
   ========================================================================== */
function dismissBanner() {
  const banner = document.getElementById('topNotification');
  if (banner) {
    banner.style.display = 'none';
    sessionStorage.setItem('banner_dismissed', 'true');
  }
}

if (sessionStorage.getItem('banner_dismissed') === 'true') {
  const banner = document.getElementById('topNotification');
  if (banner) banner.style.display = 'none';
}

/* ==========================================================================
   Mobile Menu Drawer
   ========================================================================== */
function toggleMobileMenu() {
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.toggle('open');
    backdrop.classList.toggle('active');
    document.body.style.overflow = drawer.classList.contains('open') ? 'hidden' : '';
  }
}

/* ==========================================================================
   Room Filtering
   ========================================================================== */
function initRoomFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const roomCards = document.querySelectorAll('.room-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filterValue = btn.getAttribute('data-filter');

      roomCards.forEach(card => {
        const category = card.getAttribute('data-category');
        if (filterValue === 'all') {
          card.style.display = 'flex';
        } else if (filterValue === 'classic' && category === 'classic') {
          card.style.display = 'flex';
        } else if (filterValue === 'large' && category === 'large') {
          card.style.display = 'flex';
        } else if (filterValue === 'vr' && card.id.includes('vr')) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

/* ==========================================================================
   Accordion (Hvem kan deltage?)
   ========================================================================== */
function toggleAccordion(button) {
  const item = button.closest('.accordion-item');
  const allItems = document.querySelectorAll('.accordion-item');
  const isAlreadyActive = item.classList.contains('active');

  allItems.forEach(i => {
    i.classList.remove('active');
    const icon = i.querySelector('.acc-icon');
    if (icon) icon.textContent = '+';
  });

  if (!isAlreadyActive) {
    item.classList.add('active');
    const icon = item.querySelector('.acc-icon');
    if (icon) icon.textContent = '−';
  }
}

/* ==========================================================================
   Testimonial Quotes Slider
   ========================================================================== */
let currentSlideIndex = 0;
let slideInterval = null;

function initTestimonialsSlider() {
  const slides = document.querySelectorAll('.quote-slide');
  if (slides.length === 0) return;

  slideInterval = setInterval(() => {
    let nextIndex = (currentSlideIndex + 1) % slides.length;
    setSlide(nextIndex);
  }, 6000);
}

function setSlide(index) {
  const slides = document.querySelectorAll('.quote-slide');
  const dots = document.querySelectorAll('.slider-dots .dot');

  if (index < 0 || index >= slides.length) return;

  slides.forEach(slide => slide.classList.remove('active'));
  dots.forEach(dot => dot.classList.remove('active'));

  slides[index].classList.add('active');
  if (dots[index]) dots[index].classList.add('active');

  currentSlideIndex = index;
}

/* ==========================================================================
   Interactive Booking Modal
   ========================================================================== */
function openBookingModal(preselectedRoom = '') {
  const modal = document.getElementById('bookingModal');
  const roomSelect = document.getElementById('selectRoom');

  if (preselectedRoom && roomSelect) {
    for (let i = 0; i < roomSelect.options.length; i++) {
      if (roomSelect.options[i].value.toLowerCase().includes(preselectedRoom.toLowerCase())) {
        roomSelect.selectedIndex = i;
        break;
      }
    }
  }

  updateCalculatedPrice();
  refreshAvailability();

  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function initDateInputs() {
  const dateInput = document.getElementById('bookDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
  }
}

function initPriceCalculator() {
  const playersInput = document.getElementById('bookPlayers');
  const promoInput = document.getElementById('promoCode');

  if (playersInput) playersInput.addEventListener('input', updateCalculatedPrice);
  if (promoInput) promoInput.addEventListener('input', updateCalculatedPrice);
}

function updateCalculatedPrice() {
  const playersInput = document.getElementById('bookPlayers');
  const promoInput = document.getElementById('promoCode');
  const priceDisplay = document.getElementById('estimatedPrice');

  if (!playersInput || !priceDisplay) return;

  let count = parseInt(playersInput.value, 10);
  if (isNaN(count) || count < 2) count = 2;

  // Tiered pricing per participant
  let pricePerPerson = 290;
  if (count <= 3) pricePerPerson = 340;
  else if (count === 4) pricePerPerson = 290;
  else if (count <= 6) pricePerPerson = 260;
  else pricePerPerson = 240;

  let total = count * pricePerPerson;

  // Promo code check
  const promo = promoInput ? promoInput.value.trim().toUpperCase() : '';
  if (promo.includes('ESCAPE42') || promo.includes('20%')) {
    total = Math.round(total * 0.8);
    priceDisplay.textContent = `${total.toLocaleString('da-DK')} kr. (20% rabat fratrukket)`;
    return;
  }

  priceDisplay.textContent = `${total.toLocaleString('da-DK')} kr. inkl. moms`;
}

/* ==========================================================================
   Live availability + booking (easyTable via /api/*)
   ========================================================================== */
let availabilityTimer = null;
let availabilityRequest = 0;

function setBookingStatus(message, isError) {
  const el = document.getElementById('bookingStatus');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#ff6b6b' : '';
  el.style.display = message ? 'block' : 'none';
}

function initAvailability() {
  ['selectRoom', 'bookDate', 'bookPlayers'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', scheduleAvailabilityRefresh);
    if (id === 'bookPlayers') el.addEventListener('input', scheduleAvailabilityRefresh);
  });
}

function scheduleAvailabilityRefresh() {
  clearTimeout(availabilityTimer);
  availabilityTimer = setTimeout(() => { refreshAvailability(); }, 350);
}

async function refreshAvailability() {
  const room = document.getElementById('selectRoom')?.value;
  const date = document.getElementById('bookDate')?.value;
  const persons = document.getElementById('bookPlayers')?.value;
  const timeSelect = document.getElementById('bookTime');
  const submitBtn = document.querySelector('#bookingForm button[type="submit"]');
  if (!timeSelect || !room || !date || !persons) return;

  const requestId = ++availabilityRequest;
  const previous = timeSelect.value;
  timeSelect.innerHTML = '<option value="">Henter ledige tider…</option>';
  timeSelect.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
  setBookingStatus('');

  try {
    const qs = new URLSearchParams({ room, date, persons });
    const res = await fetch('/api/availability?' + qs);
    const data = await res.json().catch(() => ({}));
    if (requestId !== availabilityRequest) return; // a newer request superseded this one
    if (!res.ok) throw new Error(data.error || 'Kunne ikke hente ledige tider.');

    const options = [
      ...data.times.map((t) => ({ time: t.time, free: true })),
      ...data.booked.map((time) => ({ time, free: false }))
    ].sort((a, b) => a.time.localeCompare(b.time));

    timeSelect.innerHTML = '';
    if (!data.open || data.times.length === 0) {
      timeSelect.innerHTML = '<option value="">Ingen ledige tider</option>';
      setBookingStatus(
        data.open
          ? 'Der er ingen ledige tider denne dag for det valgte antal deltagere. Prøv en anden dato.'
          : 'Der kan ikke bookes online denne dag. Prøv en anden dato.',
        true
      );
    } else {
      options.forEach(({ time, free }) => {
        const opt = document.createElement('option');
        opt.value = time;
        opt.textContent = free ? time : `${time} (optaget)`;
        opt.disabled = !free;
        timeSelect.appendChild(opt);
      });
      const keep = data.times.find((t) => t.time === previous);
      timeSelect.value = keep ? keep.time : data.times[0].time;
      timeSelect.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  } catch (err) {
    if (requestId !== availabilityRequest) return;
    timeSelect.innerHTML = '<option value="">Kunne ikke hente tider</option>';
    setBookingStatus(err.message || 'Kunne ikke hente ledige tider.', true);
  }
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  const submitBtn = document.querySelector('#bookingForm button[type="submit"]');
  const payload = {
    room: document.getElementById('selectRoom').value,
    date: document.getElementById('bookDate').value,
    time: document.getElementById('bookTime').value,
    persons: document.getElementById('bookPlayers').value,
    name: document.getElementById('custName').value,
    phone: document.getElementById('custPhone').value,
    email: document.getElementById('custEmail').value,
    promo: document.getElementById('promoCode').value
  };
  if (!payload.time) {
    setBookingStatus('Vælg et ledigt tidspunkt.', true);
    return;
  }

  const originalLabel = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'BOOKER…'; }
  setBookingStatus('');

  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setBookingStatus(data.error || 'Booking mislykkedes. Prøv igen eller ring til os.', true);
      if (res.status === 409) refreshAvailability(); // slot was taken – show fresh times
      return;
    }

    if (data.paymentUrl) {
      // Booking requires a card guarantee/prepayment – send the guest to pay to complete it.
      window.location.href = data.paymentUrl;
      return;
    }

    closeBookingModal();
    showToast(`Tak for din reservation, ${payload.name}! Du har booket ${payload.room} d. ${payload.date} kl. ${payload.time} for ${payload.persons} deltagere. En bekræftelse er sendt til ${payload.email}.`);
    refreshAvailability();
  } catch (err) {
    setBookingStatus('Kunne ikke kontakte bookingsystemet. Prøv igen eller ring til os.', true);
  } finally {
    if (submitBtn) { submitBtn.textContent = originalLabel; submitBtn.disabled = false; }
  }
}

/* ==========================================================================
   Room Detail Modal
   ========================================================================== */
let activeDetailRoomName = '';

function showRoomDetails(name, duration, players, difficulty, location, desc) {
  activeDetailRoomName = name;
  document.getElementById('roomDetailTitle').textContent = name;
  document.getElementById('roomDetailDuration').textContent = duration;
  document.getElementById('roomDetailPlayers').textContent = players;
  document.getElementById('roomDetailDiff').textContent = difficulty;
  document.getElementById('roomDetailLocation').textContent = location;
  document.getElementById('roomDetailText').textContent = desc;

  const modal = document.getElementById('roomDetailModal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeRoomDetailModal() {
  const modal = document.getElementById('roomDetailModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function bookFromDetailModal() {
  closeRoomDetailModal();
  openBookingModal(activeDetailRoomName);
}

/* ==========================================================================
   Video Modal
   ========================================================================== */
function openVideoModal() {
  const modal = document.getElementById('videoModal');
  const iframe = document.getElementById('videoIframe');
  if (modal && iframe) {
    iframe.src = "https://www.youtube-nocookie.com/embed/NoPPDKFov28?autoplay=1";
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeVideoModal() {
  const modal = document.getElementById('videoModal');
  const iframe = document.getElementById('videoIframe');
  if (modal && iframe) {
    iframe.src = "";
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function closeModalOnBackdrop(event) {
  if (event.target.classList.contains('modal-overlay')) {
    closeBookingModal();
    closeRoomDetailModal();
    closeVideoModal();
  }
}

/* ==========================================================================
   Newsletter & Notification Toast
   ========================================================================== */
function handleNewsletter(event) {
  event.preventDefault();
  const emailInput = document.getElementById('newsletterEmail');
  if (emailInput) {
    const email = emailInput.value;
    emailInput.value = '';
    showToast(`Tak! ${email} er nu tilmeldt vores nyhedsbrev med 10% velkomstkode.`);
  }
}

function toggleLanguageAlert() {
  showToast("Switching to English content version. Welcome to Escape Copenhagen!");
}

function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessage');
  if (toast && toastMsg) {
    toastMsg.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }
}
