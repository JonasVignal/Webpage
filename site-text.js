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
  fetch('/api/content?page=' + encodeURIComponent(file)).then(function (r) { return r.json(); }).then(function (j) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(j.changes); });
    else apply(j.changes);
  }).catch(function () {});
})();
