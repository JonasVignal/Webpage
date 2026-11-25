/**
 * Escape Copenhagen - Main Application Logic
 * Interactive handlers for booking, filtering, sliders, accordions, and modals
 */

document.addEventListener('DOMContentLoaded', () => {
  initRoomFilters();
  initTestimonialsSlider();
});

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
   Room Detail Modal
   ========================================================================== */
let activeDetailRoomName = '';

function showRoomDetails(name, duration, players, location, desc) {
  activeDetailRoomName = name;
  document.getElementById('roomDetailTitle').textContent = name;
  document.getElementById('roomDetailDuration').textContent = duration;
  document.getElementById('roomDetailPlayers').textContent = players;
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
