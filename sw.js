const key = 'cia2-study-desk-v8';
const shell = ['./','./index.html','./styles.css','./app.js','./bank.js','./podcasts.json','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(key)
    .then(cache => cache.addAll(shell.map(url => new Request(url, {cache:'reload'}))))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith('cia2-study-desk-') && name !== key).map(name => caches.delete(name))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const scope = self.registration.scope;
  const url = event.request.url;
  const hostedBank = url === new URL('questions_part2.json', scope).href || url.startsWith(new URL('images/', scope).href);
  if (event.request.method !== 'GET' || (!hostedBank && !shell.some(file => new URL(file, scope).href === url))) return;
  const catalog = url === new URL('podcasts.json', scope).href;
  const request = catalog ? new Request(event.request, {cache:'no-cache'}) : event.request;
  const fallback = () => caches.open(key).then(cache => cache.match(event.request));
  event.respondWith(fetch(request).then(response => {
    if (response.ok) event.waitUntil(caches.open(key).then(cache => cache.put(event.request, response.clone())));
    return response;
  }).catch(fallback));
});
