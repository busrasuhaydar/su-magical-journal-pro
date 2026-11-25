// Su's Magical Journal · bildirim service worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let d = { title: "Su's Magical Journal", body: '', url: '/' };
  try { d = { ...d, ...event.data.json() }; } catch { /* düz metin */ }
  event.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url }, tag: d.url }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data?.url || '/').replace(/^\//, ''), self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((w) => w.url.startsWith(self.registration.scope));
    if (c) { c.focus(); return c.navigate(url); }
    return self.clients.openWindow(url);
  }));
});

// Paylaşım hedefi (share_target): paylaşılan metin/bağlantı/görsel önce cihazda saklanır,
// uygulama "Gelen kutusu" açılınca yükler. Oturum service worker'da olmadığı için yükleme uygulamada yapılır.
async function receiveShare(request) {
  const form = await request.formData();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const cache = await caches.open('su-share');
  const files = form.getAll('media').filter((f) => f && typeof f === 'object' && f.size);
  for (let i = 0; i < files.length; i++) {
    await cache.put(`/__share/${id}/file-${i}`, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'application/octet-stream', 'X-Name': encodeURIComponent(files[i].name || 'shared') } }));
  }
  const meta = { id, title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '', files: files.length, at: Date.now() };
  await cache.put(`/__share/${id}/meta`, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  return Response.redirect(new URL('inbox?shared=1', self.registration.scope).href, 303);
}

// Çevrim dışıyken uygulama kabuğunu aç; veriler her zaman ağdan gelir.
self.addEventListener('fetch', (event) => {
  const u = new URL(event.request.url);
  if (event.request.method === 'POST' && u.href.startsWith(self.registration.scope) && u.pathname.endsWith('/share-target')) { event.respondWith(receiveShare(event.request)); return; }
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(self.registration.scope)));
});
self.addEventListener('install', (e) => e.waitUntil(caches.open('crystal-shell-v1').then((c) => c.add(self.registration.scope)).catch(() => undefined)));
