// Shows posts written in the blog admin: cards on blog.html and the post itself on /blog/<slug>.
(function () {
  var MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
  function dk(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(url) { return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); }); }
  function meta(p) { return 'Skrevet af ' + esc(p.author) + ' d. ' + dk(p.date); }

  var list = document.getElementById('blogDynamic');
  if (list) {
    get('/api/blog').then(function (r) {
      var posts = (r.body && r.body.posts) || [];
      list.innerHTML = posts.map(function (p) {
        var href = '/blog/' + encodeURIComponent(p.slug);
        var thumb = p.cover ? '<a class="blog-thumb" href="' + href + '" tabindex="-1" aria-hidden="true"><img src="' + esc(p.cover) + '" alt="" loading="lazy"></a>' : '';
        return '<article class="blog-card' + (p.cover ? ' has-thumb' : '') + '">' + thumb +
          '<div class="blog-card-body"><h2><a href="' + href + '">' + esc(p.title) + '</a></h2>' +
          '<p class="blog-meta">' + meta(p) + '</p>' +
          '<p class="blog-excerpt">' + esc(p.excerpt) + '</p>' +
          '<a class="blog-more" href="' + href + '">Læs videre &rarr;</a></div></article>';
      }).join('');
    }).catch(function () {});
  }

  var body = document.getElementById('postBody');
  if (body) {
    var m = location.pathname.match(/^\/blog\/([^/]+)\/?$/);
    var slug = m ? decodeURIComponent(m[1]) : '';
    var fail = function () {
      document.title = 'Indlægget findes ikke | Escape Copenhagen';
      document.getElementById('postTitle').textContent = 'Indlægget findes ikke';
      document.getElementById('crumbTitle').textContent = 'Ikke fundet';
      body.innerHTML = '<p>Vi kunne ikke finde det indlæg, du leder efter. <a href="blog.html">Se alle indlæg</a>.</p>';
      var robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex'; document.head.appendChild(robots);
    };
    if (!slug) { fail(); return; }
    get('/api/blog?slug=' + encodeURIComponent(slug)).then(function (r) {
      if (!r.ok || !r.body.post) return fail();
      var p = r.body.post;
      document.title = p.title + ' | Blog | Escape Copenhagen';
      var d = document.querySelector('meta[name="description"]'); if (d && p.excerpt) d.setAttribute('content', p.excerpt);
      var c = document.getElementById('canon'); if (c) c.href = 'https://escape-cph.dk/blog/' + encodeURIComponent(p.slug);
      document.getElementById('postTitle').textContent = p.title;
      document.getElementById('crumbTitle').textContent = p.title;
      document.getElementById('postMeta').innerHTML = meta(p);
      body.innerHTML = p.html; // already sanitized on the server
    }).catch(fail);
  }
})();
