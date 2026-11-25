// Blog admin: login, post list and the rich-text editor. All saving goes through /api/admin.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
  var cur = null;          // post being edited: { id|null, ... }
  var dirty = false;
  var sourceMode = false;
  var savedRange = null;
  var draftKey = function () { return 'ecph-draft-' + (cur && cur.id ? cur.id : 'new'); };

  /* ---------- helpers ---------- */
  function api(action, data) {
    var body = Object.assign({ action: action }, data || {});
    return fetch('/api/admin', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ecph-admin' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Der skete en fejl.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dk(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  var toastT;
  function toast(msg, err) {
    var t = $('toast'); t.textContent = msg; t.className = 'adm-toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, err ? 5000 : 2600);
  }
  function show(name) {
    ['Login', 'List', 'Edit', 'Text'].forEach(function (n) { $('screen' + n).hidden = n !== name; });
    $('admNav').hidden = name === 'Login';
    $('tabPosts').classList.toggle('on', name === 'List' || name === 'Edit');
    $('tabText').classList.toggle('on', name === 'Text');
    window.scrollTo(0, 0);
  }
  function toLocalInput(iso) {
    var d = iso ? new Date(iso) : new Date(); if (isNaN(d)) d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- client-side clean-up (the server sanitizes again) ---------- */
  var OK_TAGS = { P: 1, BR: 1, STRONG: 1, EM: 1, U: 1, H2: 1, H3: 1, H4: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, A: 1, IMG: 1, HR: 1, IFRAME: 1 };
  var RENAME = { B: 'STRONG', I: 'EM', H1: 'H2', H5: 'H4', H6: 'H4', DIV: 'P' };
  var DROP = { SCRIPT: 1, STYLE: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, OBJECT: 1, EMBED: 1, FORM: 1, SVG: 1, NOSCRIPT: 1 };
  function cleanNode(node, doc) {
    var out = doc.createDocumentFragment();
    Array.prototype.forEach.call(node.childNodes, function (n) {
      if (n.nodeType === 3) { out.appendChild(doc.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName;
      if (DROP[tag]) return;
      tag = RENAME[tag] || tag;
      if (!OK_TAGS[tag]) { out.appendChild(cleanNode(n, doc)); return; }
      if (tag === 'IFRAME') {
        var s = n.getAttribute('src') || '';
        if (/^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]+/.test(s)) {
          var f = doc.createElement('iframe'); f.setAttribute('src', s); f.setAttribute('allowfullscreen', ''); f.setAttribute('loading', 'lazy');
          out.appendChild(f);
        }
        return;
      }
      var el = doc.createElement(tag.toLowerCase());
      if (tag === 'A') { var h = n.getAttribute('href') || ''; if (/^(https?:|mailto:|tel:|\/|#|[\w.-]+\.html)/i.test(h)) el.setAttribute('href', h); }
      if (tag === 'IMG') { var src = n.getAttribute('src') || ''; if (!/^(https:|\/media\/)/.test(src)) return; el.setAttribute('src', src); el.setAttribute('alt', n.getAttribute('alt') || ''); el.setAttribute('loading', 'lazy'); }
      if (tag !== 'IMG' && tag !== 'HR' && tag !== 'BR') el.appendChild(cleanNode(n, doc));
      out.appendChild(el);
    });
    return out;
  }
  function clean(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    var tmp = document.createElement('div');
    tmp.appendChild(cleanNode(doc.body, document));
    return tmp.innerHTML;
  }
  function getHtml() {
    if (sourceMode) return clean($('source').value);
    var ed = $('editor');
    // Wrap any loose text at the top level in paragraphs so the post is well-formed.
    Array.prototype.slice.call(ed.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && n.nodeValue.trim()) { var p = document.createElement('p'); n.parentNode.insertBefore(p, n); p.appendChild(n); }
    });
    return clean(ed.innerHTML);
  }
  function setHtml(html) { $('editor').innerHTML = html || ''; $('source').value = html || ''; }

  /* ---------- state indicator ---------- */
  function setDirty(v) {
    dirty = v;
    var s = $('saveState');
    s.textContent = v ? 'Ikke gemt' : (cur && cur.id ? 'Gemt' : '');
    s.className = 'adm-status' + (v ? ' dirty' : (cur && cur.id ? ' saved' : ''));
    if (v) stashDraft(); else clearTimeout(stashT);
  }
  var stashT;
  function stashDraft() {
    clearTimeout(stashT);
    stashT = setTimeout(function () {
      try { localStorage.setItem(draftKey(), JSON.stringify(readForm())); } catch (e) {}
    }, 800);
  }
  function clearStash() { clearTimeout(stashT); try { localStorage.removeItem(draftKey()); } catch (e) {} }

  /* ---------- screens ---------- */
  function boot() {
    api('me').then(loadList).catch(function () { show('Login'); $('loginUser').focus(); });
  }
  $('formLogin').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('btnLogin'), er = $('loginError'); b.disabled = true; er.hidden = true;
    api('login', { user: $('loginUser').value, password: $('loginPass').value }).then(function () {
      $('loginPass').value = ''; loadList();
    }).catch(function (x) { er.textContent = x.message; er.hidden = false; }).then(function () { b.disabled = false; });
  });
  $('btnLogout').addEventListener('click', function () { api('logout').then(function () { show('Login'); }); });

  function loadList() {
    return api('list').then(function (r) {
      var box = $('postList');
      if (!r.posts.length) box.innerHTML = '<div class="adm-empty">Du har ikke skrevet nogen indlæg endnu. Klik på &ldquo;Nyt indlæg&rdquo; for at komme i gang.</div>';
      else box.innerHTML = r.posts.map(function (p) {
        var future = p.status === 'published' && new Date(p.date) > new Date();
        var badge = p.status === 'draft' ? ['draft', 'Kladde'] : future ? ['scheduled', 'Planlagt'] : ['published', 'Udgivet'];
        return '<div class="adm-row"><div><div class="adm-row-title">' + esc(p.title) + '</div><div class="adm-row-meta">' + dk(p.date) + ' · /blog/' + esc(p.slug) + '</div></div>' +
          '<span class="adm-badge ' + badge[0] + '">' + badge[1] + '</span>' +
          '<div class="adm-row-actions"><button type="button" class="adm-link" data-edit="' + esc(p.id) + '">Rediger</button>' +
          (p.status === 'published' && !future ? '<a class="adm-link" href="/blog/' + encodeURIComponent(p.slug) + '" target="_blank" rel="noopener">Se</a>' : '') + '</div></div>';
      }).join('');
      show('List');
    }).catch(function (x) { if (x.status === 401) show('Login'); else toast(x.message, true); });
  }
  $('postList').addEventListener('click', function (e) {
    var id = e.target.getAttribute && e.target.getAttribute('data-edit');
    if (!id) return;
    api('get', { id: id }).then(function (r) { openEditor(r.post); }).catch(function (x) { toast(x.message, true); });
  });
  $('btnNew').addEventListener('click', function () { openEditor(null); });

  function openEditor(p) {
    cur = p ? { id: p.id, slug: p.slug } : { id: null, slug: '' };
    sourceMode = false; $('source').hidden = true; $('editor').hidden = false; $('btnSource').classList.remove('on');
    var d = p || { title: '', author: '', date: new Date().toISOString(), status: 'draft', excerpt: '', cover: '', html: '' };
    try {
      var st = JSON.parse(localStorage.getItem(draftKey()) || 'null');
      if (st && st.title + st.html !== d.title + d.html && confirm('Der er en ikke-gemt kladde fra sidste gang. Vil du genoprette den?')) d = Object.assign({}, d, st);
      else if (st) clearStash();
    } catch (e) {}
    $('fTitle').value = d.title; $('fAuthor').value = d.author || ''; $('fExcerpt').value = d.excerpt || '';
    $('fDate').value = toLocalInput(d.date); $('fSlug').value = d.slug || (p ? p.slug : '');
    document.querySelector('input[name=status][value=' + (d.status === 'published' ? 'published' : 'draft') + ']').checked = true;
    setCover(d.cover || ''); setHtml(d.html);
    $('btnDelete').hidden = !p;
    var v = $('btnView'); v.hidden = !(p && p.status === 'published'); if (p) v.href = '/blog/' + encodeURIComponent(p.slug);
    setDirty(false); show('Edit');
    $('fTitle').focus();
  }
  function readForm() {
    return {
      id: cur && cur.id, title: $('fTitle').value, author: $('fAuthor').value, excerpt: $('fExcerpt').value,
      status: document.querySelector('input[name=status]:checked').value,
      date: $('fDate').value ? new Date($('fDate').value).toISOString() : new Date().toISOString(),
      slug: $('fSlug').value, cover: $('coverImg').getAttribute('data-src') || '', html: sourceMode ? $('source').value : $('editor').innerHTML
    };
  }
  function leave() { return !dirty || confirm('Du har ændringer, der ikke er gemt. Vil du forlade siden alligevel?'); }
  $('btnBack').addEventListener('click', function () { if (leave()) { dirty = false; loadList(); } });
  window.addEventListener('beforeunload', function (e) { if (dirty && !$('screenEdit').hidden) { e.preventDefault(); e.returnValue = ''; } });

  ['fTitle', 'fAuthor', 'fExcerpt', 'fDate', 'fSlug'].forEach(function (id) { $(id).addEventListener('input', function () { setDirty(true); }); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name=status]'), function (r) { r.addEventListener('change', function () { setDirty(true); }); });
  $('editor').addEventListener('input', function () { setDirty(true); });
  $('source').addEventListener('input', function () { setDirty(true); });

  /* ---------- save / delete ---------- */
  $('btnSave').addEventListener('click', save);
  function save() {
    var f = readForm();
    if (!f.title.trim()) { toast('Skriv en titel først.', true); $('fTitle').focus(); return Promise.resolve(); }
    f.html = getHtml();
    var b = $('btnSave'); b.disabled = true; b.textContent = 'Gemmer…';
    return api('save', f).then(function (r) {
      var p = r.post; clearStash();
      cur = { id: p.id, slug: p.slug };
      $('fSlug').value = p.slug; setHtml(p.html); $('btnDelete').hidden = false;
      var v = $('btnView'); v.hidden = p.status !== 'published'; v.href = '/blog/' + encodeURIComponent(p.slug);
      setDirty(false); toast(p.status === 'published' ? 'Gemt og udgivet' : 'Gemt som kladde');
    }).catch(function (x) { if (x.status === 401) { toast('Din session er udløbet – log ind igen (dine ændringer er gemt i browseren).', true); show('Login'); } else toast(x.message, true); })
      .then(function () { b.disabled = false; b.textContent = 'Gem'; });
  }
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('screenEdit').hidden) { e.preventDefault(); save(); }
  });
  $('btnDelete').addEventListener('click', function () {
    if (!cur || !cur.id || !confirm('Slet indlægget for altid? Det kan ikke fortrydes.')) return;
    api('delete', { id: cur.id }).then(function () { clearStash(); dirty = false; toast('Indlægget er slettet'); loadList(); }).catch(function (x) { toast(x.message, true); });
  });

  /* ---------- toolbar ---------- */
  var ed = $('editor');
  function saveSel() { var s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); }
  function restoreSel() { ed.focus(); if (savedRange) { var s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
  document.addEventListener('selectionchange', saveSel);
  function block(tag) {
    var cb = document.queryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '');
    document.execCommand('formatBlock', false, cb === tag ? 'p' : tag);
  }
  function insertHtml(h) { restoreSel(); document.execCommand('insertHTML', false, h); setDirty(true); }
  var actions = {
    h2: function () { block('h2'); }, h3: function () { block('h3'); }, quote: function () { block('blockquote'); },
    bold: function () { document.execCommand('bold'); }, italic: function () { document.execCommand('italic'); }, underline: function () { document.execCommand('underline'); },
    ul: function () { document.execCommand('insertUnorderedList'); }, ol: function () { document.execCommand('insertOrderedList'); },
    unlink: function () { document.execCommand('unlink'); }, hr: function () { document.execCommand('insertHorizontalRule'); },
    undo: function () { document.execCommand('undo'); }, redo: function () { document.execCommand('redo'); },
    clear: function () { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); },
    link: function () { saveSel(); $('linkUrl').value = ''; $('dlgLink').showModal(); $('linkUrl').focus(); },
    youtube: function () { saveSel(); $('ytUrl').value = ''; $('dlgYt').showModal(); $('ytUrl').focus(); },
    image: function () { saveSel(); $('fileImage').click(); },
    source: toggleSource
  };
  $('toolbar').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); }); // keep the selection
  $('toolbar').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var a = actions[b.getAttribute('data-cmd')]; if (!a) return;
    if (sourceMode && b.getAttribute('data-cmd') !== 'source') return;
    if (b.getAttribute('data-cmd') !== 'source') restoreSel();
    a(); setDirty(true);
  });
  ed.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); actions.link(); }
  });
  function toggleSource() {
    if (!sourceMode) { $('source').value = clean(ed.innerHTML).replace(/></g, '>\n<'); ed.hidden = true; $('source').hidden = false; }
    else { ed.innerHTML = clean($('source').value); $('source').hidden = true; ed.hidden = false; }
    sourceMode = !sourceMode; $('btnSource').classList.toggle('on', sourceMode);
  }

  // dialogs
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });
  // The page behind a modal <dialog> is inert, so close it first and only then touch the editor.
  function afterClose(dlg, fn) { dlg.close(); setTimeout(fn, 0); }
  $('formLink').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = $('linkUrl').value.trim(); if (!u) return;
    afterClose($('dlgLink'), function () { addLink(u); });
  });
  function addLink(u) {
    if (!/^(https?:|mailto:|tel:|\/|#)/i.test(u) && !/\.html($|[#?])/i.test(u)) u = 'https://' + u;
    restoreSel();
    var s = getSelection();
    if (s.isCollapsed) insertHtml('<a href="' + esc(u) + '">' + esc(u) + '</a>');
    else { document.execCommand('createLink', false, u); setDirty(true); }
  }
  $('formYt').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = $('ytUrl').value.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{6,15})/);
    if (!m) { toast('Det ligner ikke en YouTube-adresse.', true); return; }
    afterClose($('dlgYt'), function () { addYt(m[1]); });
  });
  function addYt(id) {
    insertHtml('<p><iframe src="https://www.youtube-nocookie.com/embed/' + id + '" allowfullscreen loading="lazy"></iframe></p><p><br></p>');
  }

  /* ---------- images ---------- */
  function fileToUpload(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('Vælg et billede (jpg, png, webp eller gif).'));
      var readB64 = function (blob) { return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result).split(',')[1]); }; fr.onerror = no; fr.readAsDataURL(blob); }); };
      if (file.type === 'image/gif') { if (file.size > 3.5 * 1024 * 1024) return reject(new Error('GIF-filen er for stor (maks. 3,5 MB).')); return readB64(file).then(resolve, reject); }
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var max = 1600, sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
        var g = c.getContext('2d');
        if (file.type !== 'image/png') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        c.toBlob(function (bl) {
          if (!bl) return reject(new Error('Billedet kunne ikke behandles.'));
          if (bl.size > 3.8 * 1024 * 1024) { c.toBlob(function (b2) { readB64(b2).then(resolve, reject); }, 'image/jpeg', 0.8); return; }
          readB64(bl).then(resolve, reject);
        }, type, 0.86);
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Billedet kunne ikke læses.')); };
      im.src = url;
    });
  }
  function upload(file) {
    toast('Uploader billede…');
    return fileToUpload(file).then(function (b64) { return api('upload', { data: b64 }); }).then(function (r) { $('toast').hidden = true; return r.url; });
  }
  $('fileImage').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    upload(f).then(function (url) {
      $('altPreview').src = url; $('altText').value = ''; $('dlgAlt').dataset.url = url; $('dlgAlt').showModal(); $('altText').focus();
    }).catch(function (x) { toast(x.message, true); });
  });
  $('formAlt').addEventListener('submit', function (e) {
    e.preventDefault();
    var url = $('dlgAlt').dataset.url, alt = $('altText').value.trim();
    afterClose($('dlgAlt'), function () { insertHtml('<p><img src="' + esc(url) + '" alt="' + esc(alt) + '"></p><p><br></p>'); });
  });
  function setCover(url) {
    var img = $('coverImg'); img.setAttribute('data-src', url || '');
    if (url) img.src = url; else img.removeAttribute('src');
    $('coverBox').hidden = !url; $('btnCover').textContent = url ? 'Skift billede' : 'Vælg billede';
  }
  $('btnCover').addEventListener('click', function () { $('fileCover').click(); });
  $('fileCover').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    upload(f).then(function (url) { setCover(url); setDirty(true); }).catch(function (x) { toast(x.message, true); });
  });
  $('btnCoverRemove').addEventListener('click', function () { setCover(''); setDirty(true); });
  // Dropping an image file into the text uploads it
  ed.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types, function (t) { return t === 'Files'; })) e.preventDefault(); });
  ed.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    e.preventDefault(); saveSel();
    upload(f).then(function (url) { insertHtml('<p><img src="' + esc(url) + '" alt=""></p><p><br></p>'); }).catch(function (x) { toast(x.message, true); });
  });
  // Paste: keep simple formatting, drop everything else
  ed.addEventListener('paste', function (e) {
    var cd = e.clipboardData; if (!cd) return;
    var file = cd.files && cd.files[0];
    if (file && /^image\//.test(file.type)) { e.preventDefault(); saveSel(); upload(file).then(function (url) { insertHtml('<p><img src="' + esc(url) + '" alt=""></p><p><br></p>'); }).catch(function (x) { toast(x.message, true); }); return; }
    var html = cd.getData('text/html');
    e.preventDefault();
    if (html) document.execCommand('insertHTML', false, clean(html).replace(/<img[^>]*>/g, ''));
    else document.execCommand('insertText', false, cd.getData('text/plain'));
  });

  /* ---------- preview ---------- */
  $('btnPreview').addEventListener('click', function () {
    $('pvTitle').textContent = $('fTitle').value || 'Uden titel';
    $('pvMeta').textContent = 'Skrevet af ' + ($('fAuthor').value || 'Escape Copenhagen') + ' d. ' + dk($('fDate').value);
    $('pvBody').innerHTML = getHtml(); $('preview').hidden = false;
  });
  $('btnPreviewClose').addEventListener('click', function () { $('preview').hidden = true; $('pvBody').innerHTML = ''; });

  /* ---------- site texts ---------- */
  var tx = { file: '', doc: null, orig: {}, base: {}, dirty: {}, cur: null, pages: null };
  function txSet() {
    var n = Object.keys(tx.dirty).length;
    $('txSave').disabled = !n; $('txSave').textContent = n ? 'Gem ændringer (' + n + ')' : 'Gem ændringer';
    $('txState').textContent = n ? 'Ikke gemt' : ''; $('txState').className = 'adm-status' + (n ? ' dirty' : '');
    $('txReset').disabled = !(tx.cur && tx.cur.getAttribute('data-et') && cleanText(tx.cur) !== tx.orig[tx.cur.getAttribute('data-et')]);
    dirty = n > 0;
  }
  function cleanText(el) { return clean(el.innerHTML).replace(/(<br>)+$/g, ''); }
  function openTexts() {
    if (!leave()) return; dirty = false; show('Text');
    if (tx.pages) return;
    fetch('admin-pages.json').then(function (r) { return r.json(); }).then(function (j) {
      tx.pages = j.pages;
      var groups = { 'Sider': [], 'Blogindlæg (gamle)': [] };
      j.pages.forEach(function (p) { (/^blog-/.test(p.file) && p.file !== 'blog.html' ? groups['Blogindlæg (gamle)'] : groups['Sider']).push(p); });
      $('txPage').innerHTML = Object.keys(groups).map(function (g) {
        return '<optgroup label="' + g + '">' + groups[g].map(function (p) { return '<option value="' + esc(p.file) + '">' + esc(p.title) + ' (' + p.file + ')</option>'; }).join('') + '</optgroup>';
      }).join('');
      txLoad($('txPage').value);
    });
  }
  function txLoad(file) {
    tx.file = file; tx.dirty = {}; tx.cur = null; txSet();
    var f = $('txFrame');
    f.onload = function () { txPrepare(f.contentDocument); };
    f.src = '/' + file + '?edit=1';
  }
  $('txPage').addEventListener('change', function () {
    var sel = this, prev = tx.file;
    if (!leave()) { sel.value = prev; return; }
    txLoad(sel.value);
  });
  function txPrepare(doc) {
    tx.doc = doc; tx.orig = {}; tx.base = {};
    var els = doc.querySelectorAll('[data-et]');
    Array.prototype.forEach.call(els, function (el) { tx.orig[el.getAttribute('data-et')] = cleanText(el); });
    api('content_get', { page: tx.file }).then(function (r) {
      Object.keys(r.changes).forEach(function (id) { var el = doc.querySelector('[data-et="' + id + '"]'); if (el) el.innerHTML = r.changes[id]; });
      Array.prototype.forEach.call(els, function (el) { tx.base[el.getAttribute('data-et')] = cleanText(el); el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'true'); });
    }).catch(function (x) { if (x.status === 401) show('Login'); else toast(x.message, true); });
    var st = doc.createElement('style');
    st.textContent = '[data-et][contenteditable]{cursor:text;transition:none!important}.ecph-show [data-et][contenteditable]{outline:1px dashed rgba(243,156,18,.55);outline-offset:3px}[data-et][contenteditable]:hover{outline:2px dashed #f39c12!important;outline-offset:3px}[data-et][contenteditable]:focus{outline:2px solid #f39c12!important;outline-offset:3px;background:rgba(243,156,18,.08)}[data-et].ecph-changed{box-shadow:-6px 0 0 -3px #81d742}html{scroll-behavior:auto!important}';
    doc.head.appendChild(st);
    doc.documentElement.classList.toggle('ecph-show', $('txShow').checked);
    // Make the page inert: no navigation, no booking pop-ups, no form posts while editing
    doc.addEventListener('click', function (e) { var t = e.target; if (t.closest && t.closest('[data-et]')) { e.preventDefault(); e.stopPropagation(); } else if (t.closest && t.closest('a,button,[onclick]')) { e.preventDefault(); e.stopPropagation(); } }, true);
    doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('keydown', function (e) {
      var el = e.target && e.target.closest && e.target.closest('[data-et]'); if (!el) return;
      if (e.key === 'Enter') { e.preventDefault(); doc.execCommand('insertLineBreak'); }
      else if (e.key === ' ' && el.closest('button,summary')) { e.preventDefault(); doc.execCommand('insertText', false, ' '); }
    }, true);
    doc.addEventListener('keyup', function (e) { if (e.key === ' ') e.preventDefault(); }, true);
    doc.addEventListener('paste', function (e) {
      var el = e.target && e.target.closest && e.target.closest('[data-et]'); if (!el) return;
      e.preventDefault(); doc.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' '));
    }, true);
    doc.addEventListener('focusin', function (e) { tx.cur = e.target.closest && e.target.closest('[data-et]'); txSet(); });
    doc.addEventListener('input', function (e) {
      var el = e.target.closest && e.target.closest('[data-et]'); if (!el) return;
      var id = el.getAttribute('data-et'), now = cleanText(el);
      if (now === tx.base[id]) delete tx.dirty[id]; else tx.dirty[id] = now;
      el.classList.toggle('ecph-changed', id in tx.dirty);
      txSet();
    });
  }
  $('txShow').addEventListener('change', function () { if (tx.doc) tx.doc.documentElement.classList.toggle('ecph-show', this.checked); });
  $('txReset').addEventListener('click', function () {
    var el = tx.cur; if (!el) return; var id = el.getAttribute('data-et');
    el.innerHTML = tx.orig[id];
    if (tx.orig[id] === tx.base[id]) delete tx.dirty[id]; else tx.dirty[id] = tx.orig[id];
    el.classList.toggle('ecph-changed', id in tx.dirty); txSet(); el.focus();
  });
  $('txSave').addEventListener('click', function () {
    var changes = {};
    Object.keys(tx.dirty).forEach(function (id) {
      var el = tx.doc.querySelector('[data-et="' + id + '"]');
      changes[id] = tx.dirty[id] === tx.orig[id] ? null : (el ? cleanText(el) : tx.dirty[id]);
    });
    var b = $('txSave'); b.disabled = true; b.textContent = 'Gemmer…';
    api('content_save', { page: tx.file, changes: changes }).then(function () {
      Object.keys(tx.dirty).forEach(function (id) { tx.base[id] = tx.dirty[id]; var el = tx.doc.querySelector('[data-et="' + id + '"]'); if (el) el.classList.remove('ecph-changed'); });
      tx.dirty = {}; txSet(); toast('Gemt – ændringerne er live om få sekunder');
    }).catch(function (x) { if (x.status === 401) { toast('Din session er udløbet – log ind igen.', true); show('Login'); } else toast(x.message, true); txSet(); });
  });
  $('tabText').addEventListener('click', function () { if (!$('screenText').hidden) return; if (!$('screenEdit').hidden && !leave()) return; dirty = false; openTexts(); });
  $('tabPosts').addEventListener('click', function () { if (!$('screenList').hidden) return; if (!leave()) return; dirty = false; loadList(); });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('screenText').hidden) { e.preventDefault(); if (!$('txSave').disabled) $('txSave').click(); }
  });
  window.addEventListener('beforeunload', function (e) { if (dirty && !$('screenText').hidden) { e.preventDefault(); e.returnValue = ''; } });

  boot();
})();
