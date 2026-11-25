const key = 'cia2-study-desk-v5';
const shell = ['./','./index.html','./styles.css','./app.js','./bank.js','./podcasts.json','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(key).then(cache => cache.addAll(shell.map(url => new Request(url, {cache:'reload'}))))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('cia2-study-desk-') && name !== key).map(name => caches.delete(name))))));
self.addEventListener('fetch', event => {
  const scope = self.registration.scope;
  const url = event.request.url;
  const hostedBank = url === new URL('questions_part2.json', scope).href || url.startsWith(new URL('images/', scope).href);
  if (event.request.method !== 'GET' || (!hostedBank && !shell.some(file => new URL(file, scope).href === url))) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) event.waitUntil(caches.open(key).then(cache => cache.put(event.request, response.clone())));
    return response;
  }).catch(() => caches.match(event.request)));
});
