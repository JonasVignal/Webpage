const { get } = require('@vercel/blob');

// Serves pictures uploaded in the blog editor: /media/<name>  ->  /api/img?n=<name>
// Names are random and never reused, so the response can be cached "forever".
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const name = String((req.query && req.query.n) || '');
  if (!/^[a-z0-9]{12,40}\.(jpg|png|webp|gif)$/.test(name)) return res.status(404).end();
  try {
    const r = await get('blog/img/' + name, { access: 'private' });
    if (!r || r.statusCode !== 200) return res.status(404).end();
    const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
    res.setHeader('Content-Type', r.blob.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(buf);
  } catch (e) {
    console.error('img error', e && e.message);
    res.status(404).end();
  }
};
