// 離線快取：內建單字庫在沒有網路時也能使用；線上字典與翻譯一律走網路
const CACHE = 'pk-v5';
const FILES = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/sounds.js', 'js/phonics.js', 'js/explain.js',
  'js/audio.js', 'js/elkonin.js', 'js/app.js', 'data/custom-words.json', 'audio/index.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 先用網路取得最新版，失敗時用快取
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
