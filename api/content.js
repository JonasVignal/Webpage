const B = require('./_blog');

// Public: GET /api/content?page=vikings.html  ->  { changes: { t12: "<sanitized html>" } }
module.exports = async function handler(req, res) {
  // Browsers always revalidate (so an edit shows on the next page load); Vercel's CDN may keep it for a few seconds.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control', 'max-age=10');
  const page = String((req.query && req.query.page) || '');
  if (!/^[a-z0-9][a-z0-9._-]{0,80}\.html$/.test(page)) return res.status(400).json({ changes: {} });
  try {
    const { state } = await B.readContent();
    return res.status(200).json({ changes: state.pages[page] || {} });
  } catch (e) {
    console.error('content api error', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ changes: {}, error: 'unavailable' });
  }
};
