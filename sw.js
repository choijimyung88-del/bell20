// Offline support: app files and music are cached on install, Google Fonts on first use.
const CACHE = 'bell20-v8';
const TRACKS = ['work', 'warm', 'rest', 'cool', 'build'];
const SHELL = ['./', 'index.html', 'music.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png',
  ...TRACKS.map(t => `music/${t}.m4a`), ...TRACKS.map(t => `music/${t}.mp3`)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Safari asks for audio in byte ranges; answer those from the cached file with a 206.
async function rangeResponse(req, cached){
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const start = m && m[1] ? +m[1] : 0, end = m && m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': cached.headers.get('Content-Type') || 'audio/mp4',
    'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes'}});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  if (req.headers.has('range')){
    e.respondWith(caches.match(url.pathname.replace(/^.*\/music\//, 'music/'), {ignoreSearch: true})
      .then(hit => hit || caches.match(req.url)).then(hit => hit ? rangeResponse(req, hit) : fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
