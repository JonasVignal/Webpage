const { readState, publicPost } = require('./_blog');

// Public blog API (published posts only)
//   GET /api/blog            -> { posts: [ {slug,title,author,date,excerpt,cover}, ... ] }
//   GET /api/blog?slug=abc   -> { post: { ...,html } }
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { state } = await readState();
    const live = state.posts
      .filter((p) => p.status === 'published' && new Date(p.date) <= new Date(Date.now() + 5 * 60 * 1000))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
    const slug = req.query && req.query.slug;
    if (slug) {
      const p = live.find((x) => x.slug === String(slug));
      if (!p) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ post: publicPost(p, true) });
    }
    res.status(200).json({ posts: live.map((p) => publicPost(p, false)) });
  } catch (e) {
    console.error('blog api error', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ posts: [], error: 'unavailable' });
  }
};
