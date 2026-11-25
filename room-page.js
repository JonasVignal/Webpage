/**
 * Single room page – photo viewer for the gallery.
 */
(function () {
  'use strict';
  var items = Array.prototype.slice.call(document.querySelectorAll('.rp-gal-item'));
  var box = document.getElementById('rpLightbox');
  if (!items.length || !box) return;
  var img = document.getElementById('rpLbImg');
  var current = 0, lastFocus = null;

  function show(i) {
    current = (i + items.length) % items.length;
    img.src = items[current].getAttribute('data-full');
    img.alt = items[current].getAttribute('data-alt') || '';
  }
  function open(i) {
    lastFocus = document.activeElement;
    show(i);
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('rpLbClose').focus();
  }
  function close() {
    box.hidden = true;
    img.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  items.forEach(function (el, i) { el.addEventListener('click', function () { open(i); }); });
  document.getElementById('rpLbClose').addEventListener('click', close);
  document.getElementById('rpLbPrev').addEventListener('click', function () { show(current - 1); });
  document.getElementById('rpLbNext').addEventListener('click', function () { show(current + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  document.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
  });
})();
