const CACHE = 'games-ru-static-20261026-3';
const CORE = ['./','./index.html','./okoknew.html','./assets/site.css','./assets/catalog.js','./assets/catalog-data.js','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('games-ru-static-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  // API responses are never cached; stale game results cannot masquerade as LIVE.
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||url.pathname.includes('/api/')||url.pathname.includes('/_serverFn/'))return;
  const sameResource=event.request.destination==='document'||['script','style','image','font'].includes(event.request.destination);
  if(!sameResource)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(async()=>{const cached=await caches.match(event.request);return cached||new Response('Нет сети. Для этой страницы подключитесь к интернету.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}));
});
