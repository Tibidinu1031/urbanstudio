/* Service worker: funcționare offline + reamintiri în fundal. */
const VERSION = 'us-2026-11-10-3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/app.css',
  'assets/js/app.js',
  'assets/js/lib.js',
  'assets/js/data.js',
  'assets/js/icons.js',
  'assets/js/store.js',
  'assets/js/logo.js',
  'assets/js/slots.js',
  'assets/js/reminders.js',
  'assets/js/components.js',
  'assets/js/gallery.js',
  'assets/js/splash.js',
  'assets/js/views/home.js',
  'assets/js/views/booking.js',
  'assets/js/views/agenda.js',
  'assets/js/views/about.js',
  'assets/icons/icon-192.png',
  'assets/icons/favicon-64.png',
  'assets/img/team/adita.jpg',
  'assets/img/gallery/01.jpg',
];
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);
const DATA_URL = new URL('__us/reminders.json', self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION && k !== 'us-data' && k !== 'us-runtime').map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href === DATA_URL) return;

  // navigare: rețea întâi, apoi index-ul din cache (offline)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  if (DEV && url.origin === self.location.origin) return;

  // fonturi și dale de hartă: cache întâi
  if (/fonts\.(googleapis|gstatic)\.com|tile\.openstreetmap\.org/.test(url.hostname)) {
    e.respondWith(caches.open('us-runtime').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // codul propriu (JS, CSS, manifest): rețea întâi, ca actualizările să apară imediat; cache doar offline
  if (url.origin === self.location.origin && /\.(js|css|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return (await c.match(req, { ignoreSearch: true })) || Response.error();
      }
    }));
    return;
  }

  // imaginile proprii: din cache, actualizate în fundal
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

/* ---------- reamintiri ---------- */
async function readItems() {
  const c = await caches.open('us-data');
  const r = await c.match(DATA_URL);
  return r ? r.json() : [];
}
async function writeItems(items) {
  const c = await caches.open('us-data');
  await c.put(DATA_URL, new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } }));
}

async function checkReminders() {
  const items = await readItems();
  const now = Date.now();
  let changed = false;
  for (const it of items) {
    if (!it.notified && it.at <= now && it.startMs > now) {
      await self.registration.showNotification(it.title, {
        body: it.body,
        tag: it.tag,
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/favicon-64.png',
        data: { url: './#/agenda' },
        vibrate: [12, 60, 18],
      });
      it.notified = true;
      changed = true;
    }
  }
  if (changed) await writeItems(items);
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'us-reminders') e.waitUntil(checkReminders());
});

// Push de la server (dacă se configurează ulterior Web Push)
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Urban Studio', {
    body: data.body || 'Ai o programare în curând.',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/favicon-64.png',
    data: { url: data.url || './#/agenda' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './#/agenda', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: 'open', tab: 'agenda' });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'check') e.waitUntil(checkReminders());
});
