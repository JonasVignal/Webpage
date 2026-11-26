/**
 * Shared helpers for the blog admin (server-side only).
 *
 * Storage: one private Vercel Blob store (BLOB_READ_WRITE_TOKEN is added by Vercel)
 *   blog/posts.json      all posts (drafts included) – never exposed directly
 *   blog/img/<name>      uploaded pictures, served through /media/<name>
 *
 * Login: environment variables set by the site owner in Vercel
 *   ADMIN_USER, ADMIN_PASSWORD   the admin login
 *   SESSION_SECRET               random string used to sign the session cookie
 */
const crypto = require('crypto');
const { put, get } = require('@vercel/blob');
const sanitizeHtml = require('sanitize-html');

const POSTS_PATH = 'blog/posts.json';
const COOKIE = 'ecph_admin';
const SESSION_HOURS = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ storage */
const CONTENT_PATH = 'site/content.json';   // { version, pages: { "vikings.html": { t12: "<html>" } } }

async function readJson(pathname, fallback) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return { state: fallback(), etag: null };
  const text = await new Response(r.stream).text();
  let state;
  try { state = JSON.parse(text); } catch (_) { state = fallback(); }
  return { state, etag: r.blob.etag };
}

async function writeJson(pathname, state, etag) {
  await put(pathname, JSON.stringify(state), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
    ...(etag ? { ifMatch: etag } : {})
  });
}

/** Read-modify-write with a retry if someone saved at the same moment. */
async function mutateJson(pathname, fallback, fn) {
  for (let i = 0; i < 4; i++) {
    const { state, etag } = await readJson(pathname, fallback);
    const result = await fn(state);
    try {
      await writeJson(pathname, state, etag);
      return result;
    } catch (e) {
      if (e && e.name === 'BlobPreconditionFailedError') continue;
      throw e;
    }
  }
  throw new Error('Kunne ikke gemme – prøv igen.');
}

const emptyPosts = () => ({ version: 1, posts: [] });
const emptyContent = () => ({ version: 1, pages: {} });

/* Price per player by weekday (0 = Sunday … 6 = Saturday). Defaults are used until the admin saves new ones. */
const PRICES_PATH = 'site/prices.json';
const DEFAULT_PRICES = { 0: 240, 1: 240, 2: 299, 3: 299, 4: 299, 5: 329, 6: 329 };
const emptyPrices = () => ({ version: 1, pps: { ...DEFAULT_PRICES } });
async function readPrices() {
  const r = await readJson(PRICES_PATH, emptyPrices);
  const out = { ...DEFAULT_PRICES };
  for (let d = 0; d < 7; d++) { const v = Number(r.state.pps && r.state.pps[d]); if (Number.isInteger(v) && v > 0 && v < 5000) out[d] = v; }
  return out;
}
const mutatePrices = (fn) => mutateJson(PRICES_PATH, emptyPrices, fn);
async function readState() {
  const r = await readJson(POSTS_PATH, emptyPosts);
  if (!Array.isArray(r.state.posts)) r.state.posts = [];
  return r;
}
const mutate = (fn) => mutateJson(POSTS_PATH, emptyPosts, fn);
async function readContent() {
  const r = await readJson(CONTENT_PATH, emptyContent);
  if (!r.state.pages || typeof r.state.pages !== 'object') r.state.pages = {};
  return r;
}
const mutateContent = (fn) => mutateJson(CONTENT_PATH, emptyContent, fn);

/** Small inline markup only – used for editable text on the ordinary pages. */
function cleanInline(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['br', 'strong', 'b', 'em', 'i', 'u', 'a', 'span', 'small', 'mark'],
    allowedAttributes: { a: ['href', 'target', 'rel', 'class'], span: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href
  }).trim();
}

/* ------------------------------------------------------------------ content */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function cleanHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'iframe'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      iframe: ['src', 'title', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy', 'frameborder']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    allowedIframeHostnames: ['www.youtube-nocookie.com'],
    transformTags: {
      a: (tag, attribs) => {
        const href = attribs.href || '';
        const external = /^https?:\/\//i.test(href) && !/escape-cph\.dk|vercel\.app/i.test(href);
        const out = { href };
        if (external) { out.target = '_blank'; out.rel = 'noopener'; }
        return { tagName: 'a', attribs: out };
      },
      img: (tag, attribs) => ({ tagName: 'img', attribs: { src: attribs.src || '', alt: attribs.alt || '', loading: 'lazy' } })
    },
    exclusiveFilter: (frame) => (frame.tag === 'img' && !frame.attribs.src) || (frame.tag === 'a' && !frame.attribs.href)
  }).trim();
}

function plainText(html) {
  return sanitizeHtml(String(html || '').replace(/<\/(p|h[1-6]|li|blockquote|div)>|<br\s*\/?>/gi, ' $&'), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

function excerptFrom(html, n = 230) {
  const t = plainText(html).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+\S*$/, '').replace(/[\s,.;:–…-]+$/, '') + '…';
}

function firstImage(html) {
  const m = /<img[^>]+src="([^"]+)"/i.exec(html || '');
  return m ? m[1] : '';
}

/** What the public site is allowed to see about a post. */
function publicPost(p, withHtml) {
  const out = {
    slug: p.slug, title: p.title, author: p.author, date: p.date,
    excerpt: p.excerpt || excerptFrom(p.html), cover: p.cover || firstImage(p.html)
  };
  if (withHtml) out.html = p.html;
  return out;
}

/* ------------------------------------------------------------------ auth */
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function mac(data) {
  return b64u(crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(data).digest());
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function authConfigured() {
  return !!(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 24);
}
function makeSession() {
  const body = b64u(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600 * 1000, n: crypto.randomBytes(6).toString('hex') }));
  return body + '.' + mac(body);
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
function isAdmin(req) {
  if (!authConfigured()) return false;
  const v = readCookie(req, COOKIE);
  if (!v || v.indexOf('.') < 0) return false;
  const [body, sig] = v.split('.');
  if (!safeEqual(sig, mac(body))) return false;
  try { return JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).exp > Date.now(); } catch (_) { return false; }
}
function cookieHeader(value, req, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') || !/^(localhost|127\.)/.test(req.headers.host || '');
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

// Very small brute-force guard (per server instance) on top of the built-in delay.
const fails = new Map();
function tooManyFails(ip) {
  const f = fails.get(ip);
  return !!f && f.count >= 8 && Date.now() - f.first < 15 * 60 * 1000;
}
function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.first > 15 * 60 * 1000) fails.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}
function clearFails(ip) { fails.delete(ip); }

module.exports = {
  POSTS_PATH, CONTENT_PATH, COOKIE, sleep, readState, mutate, readContent, mutateContent, readPrices, mutatePrices, DEFAULT_PRICES, cleanInline, slugify, cleanHtml, plainText, excerptFrom, firstImage, publicPost,
  safeEqual, authConfigured, makeSession, isAdmin, cookieHeader, tooManyFails, noteFail, clearFails
};
