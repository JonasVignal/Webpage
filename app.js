/**
 * Escape Copenhagen - Main Application Logic
 * Interactive handlers for booking, filtering, sliders, accordions, and modals
 */

document.addEventListener('DOMContentLoaded', () => {
  initDateInputs();
  initRoomFilters();
  initTestimonialsSlider();
  initPriceCalculator();
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

function handleBookingSubmit(event) {
  event.preventDefault();
  const room = document.getElementById('selectRoom').value;
  const date = document.getElementById('bookDate').value;
  const time = document.getElementById('bookTime').value;
  const players = document.getElementById('bookPlayers').value;
  const name = document.getElementById('custName').value;

  closeBookingModal();

  showToast(`Tak for din reservation, ${name}! Du har booket ${room} d. ${date} kl. ${time} for ${players} deltagere. En bekræftelse er sendt.`);
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
