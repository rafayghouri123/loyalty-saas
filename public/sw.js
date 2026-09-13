/* One coordinated worker; push handlers will be added to this registration. */
const SHELL_CACHE='loyalty-shell-v1';
const SHELL='/offline-v1.html';
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.add(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('loyalty-shell-')&&key!==SHELL_CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin) return;
  if(event.request.mode==='navigate'&&!/^\/(api|auth|invite)(\/|$)/.test(url.pathname)){
    event.respondWith(fetch(event.request).catch(async()=>await caches.match(SHELL)||Response.error()));
  }
  // Never cache authenticated HTML, API responses, contacts, reports or mutations.
});
