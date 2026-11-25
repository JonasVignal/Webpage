const crypto = require('crypto');
const { put } = require('@vercel/blob');
const B = require('./_blog');

// Admin API for the blog editor. Everything except "login" needs the signed session cookie.
//   POST /api/admin  { action: 'login' | 'logout' | 'me' | 'list' | 'get' | 'save' | 'delete' | 'upload', ... }
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAGIC = [
  ['image/jpeg', 'jpg', (b) => b[0] === 0xff && b[1] === 0xd8],
  ['image/png', 'png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['image/webp', 'webp', (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'],
  ['image/gif', 'gif', (b) => b.slice(0, 3).toString() === 'GIF']
];

function bad(res, code, msg) { return res.status(code).json({ error: msg }); }
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'POST') return bad(res, 405, 'Method not allowed');
  if (req.headers['x-requested-with'] !== 'ecph-admin') return bad(res, 403, 'Forbidden');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = body.action;

  try {
    /* ---------------------------------------------------------- login */
    if (action === 'login') {
      if (!B.authConfigured()) return bad(res, 503, 'Login er ikke sat op endnu.');
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (B.tooManyFails(ip)) return bad(res, 429, 'For mange forsøg. Vent lidt og prøv igen.');
      const okUser = B.safeEqual(str(body.user, 200).toLowerCase(), String(process.env.ADMIN_USER).toLowerCase());
      const okPass = B.safeEqual(String(body.password || ''), process.env.ADMIN_PASSWORD);
      if (!(okUser && okPass)) {
        B.noteFail(ip);
        await B.sleep(900 + Math.floor(Math.random() * 400));
        return bad(res, 401, 'Forkert brugernavn eller adgangskode.');
      }
      B.clearFails(ip);
      res.setHeader('Set-Cookie', B.cookieHeader(B.makeSession(), req, 12 * 3600));
      return res.status(200).json({ ok: true });
    }

    if (action === 'logout') {
      res.setHeader('Set-Cookie', B.cookieHeader('', req, 0));
      return res.status(200).json({ ok: true });
    }

    if (!B.isAdmin(req)) return bad(res, 401, 'Log ind for at fortsætte.');

    if (action === 'me') return res.status(200).json({ ok: true });

    /* ---------------------------------------------------------- list / get */
    if (action === 'list') {
      const { state } = await B.readState();
      const posts = state.posts
        .map((p) => ({ id: p.id, slug: p.slug, title: p.title, status: p.status, date: p.date, updatedAt: p.updatedAt }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.status(200).json({ posts });
    }

    if (action === 'get') {
      const { state } = await B.readState();
      const p = state.posts.find((x) => x.id === body.id);
      return p ? res.status(200).json({ post: p }) : bad(res, 404, 'Indlægget findes ikke.');
    }

    /* ---------------------------------------------------------- save */
    if (action === 'save') {
      const title = str(body.title, 200);
      if (!title) return bad(res, 400, 'Skriv en titel.');
      const html = B.cleanHtml(body.html);
      if (html.length > 250000) return bad(res, 400, 'Indlægget er for langt.');
      const status = body.status === 'published' ? 'published' : 'draft';
      if (status === 'published' && B.plainText(html).length < 1 && !/<(img|iframe)\b/i.test(html)) return bad(res, 400, 'Skriv noget indhold, før du udgiver.');
      const date = new Date(body.date);
      const dateIso = isNaN(date) ? new Date().toISOString() : date.toISOString();
      const cover = /^(\/media\/[a-z0-9]{12,40}\.(jpg|png|webp|gif)|https:\/\/[^\s"'<>]+)$/.test(String(body.cover || '')) ? String(body.cover) : '';
      const wantedSlug = B.slugify(body.slug || title) || 'indlaeg';

      const saved = await B.mutate(async (state) => {
        const now = new Date().toISOString();
        let p = body.id ? state.posts.find((x) => x.id === body.id) : null;
        if (body.id && !p) { const err = new Error('Indlægget findes ikke.'); err.code = 404; throw err; }
        let slug = wantedSlug, n = 2;
        while (state.posts.some((x) => x.slug === slug && (!p || x.id !== p.id))) slug = wantedSlug + '-' + n++;
        if (!p) { p = { id: crypto.randomBytes(8).toString('hex'), createdAt: now }; state.posts.push(p); }
        Object.assign(p, {
          slug, title, author: str(body.author, 80) || 'Escape Copenhagen', date: dateIso, status,
          excerpt: str(body.excerpt, 400), cover, html, updatedAt: now
        });
        return p;
      });
      return res.status(200).json({ post: saved });
    }

    /* ---------------------------------------------------------- delete */
    if (action === 'delete') {
      await B.mutate(async (state) => {
        const i = state.posts.findIndex((x) => x.id === body.id);
        if (i < 0) { const err = new Error('Indlægget findes ikke.'); err.code = 404; throw err; }
        state.posts.splice(i, 1);
      });
      return res.status(200).json({ ok: true });
    }

    /* ---------------------------------------------------------- upload */
    if (action === 'upload') {
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if (!buf.length) return bad(res, 400, 'Ingen fil.');
      if (buf.length > MAX_IMAGE_BYTES) return bad(res, 413, 'Billedet er for stort (maks. 4 MB).');
      const kind = MAGIC.find((m) => m[2](buf));
      if (!kind) return bad(res, 400, 'Filen er ikke et billede (jpg, png, webp eller gif).');
      const name = crypto.randomBytes(10).toString('hex') + '.' + kind[1];
      await put('blog/img/' + name, buf, { access: 'private', contentType: kind[0], addRandomSuffix: false });
      return res.status(200).json({ url: '/media/' + name });
    }

    return bad(res, 400, 'Ukendt handling.');
  } catch (e) {
    if (e && e.code === 404) return bad(res, 404, e.message);
    console.error('admin api error', action, e && e.message);
    return bad(res, 500, 'Der skete en fejl. Prøv igen.');
  }
};
