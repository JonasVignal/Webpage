// Applies texts edited in the admin ("Sidetekster") on top of the static page.
(function () {
  if (/[?&]edit=1/.test(location.search)) return; // the admin editor applies them itself
  var file = (location.pathname.split('/').pop() || 'index.html');
  if (!/\.html$/.test(file)) file += '.html';
  function apply(changes) {
    Object.keys(changes || {}).forEach(function (id) {
      var el = document.querySelector('[data-et="' + id + '"]');
      if (el && typeof changes[id] === 'string') el.innerHTML = changes[id];
    });
  }
  // "Fra xxx kr" always shows the lowest weekday price set in the admin (Priser).
  var minPrice = 0;
  function applyPrice() {
    if (!minPrice) return;
    var els = document.querySelectorAll('.min-price');
    for (var i = 0; i < els.length; i++) els[i].textContent = minPrice;
    document.title = document.title.replace(/(fra )\d+( kr)/i, '$1' + minPrice + '$2');
    document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[property="og:title"],meta[name="twitter:title"],meta[name="twitter:description"]').forEach(function (t) {
      var c = t.getAttribute('content') || ''; if (/fra \d+ kr/i.test(c)) t.setAttribute('content', c.replace(/(fra )\d+( kr)/i, '$1' + minPrice + '$2'));
    });
  }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  fetch('/api/content?page=' + encodeURIComponent(file)).then(function (r) { return r.json(); }).then(function (j) {
    ready(function () { apply(j.changes); applyPrice(); });
  }).catch(function () {});
  fetch('/api/prices').then(function (r) { return r.json(); }).then(function (j) {
    var v = Object.keys(j.pps || {}).map(function (k) { return Number(j.pps[k]); }).filter(function (n) { return n > 0; });
    if (v.length) { minPrice = Math.min.apply(null, v); ready(applyPrice); }
  }).catch(function () {});
})();
