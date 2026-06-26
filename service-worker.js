// ============================================================================
// AFFlow Service Worker
//  - หน้าเว็บ (navigation): network-first → ได้เวอร์ชันล่าสุดเสมอ, ออฟไลน์ใช้ cache
//  - ไฟล์ในโดเมน (ไอคอน/manifest): cache-first
//  - ไลบรารี CDN (jsdelivr): stale-while-revalidate (ออฟไลน์ยังเปิดได้)
//  - Supabase / Google / API อื่น ๆ: ปล่อยผ่าน ไม่ cache (กันข้อมูลค้าง)
// ============================================================================
const CACHE = 'afflow-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './vendor/react.production.min.js', './vendor/react-dom.production.min.js', './vendor/babel.min.js',
  './vendor/chart.umd.min.js', './vendor/supabase.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // หน้าเว็บ → network-first
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // ไฟล์ในโดเมนเดียวกัน → cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // ไลบรารี CDN → stale-while-revalidate
  if (url.hostname.indexOf('jsdelivr.net') !== -1 || url.hostname.indexOf('unpkg.com') !== -1) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // API อื่น ๆ (Supabase / Google / Gemini / Drive) → ไม่แตะ ปล่อยผ่านเน็ตปกติ
});
