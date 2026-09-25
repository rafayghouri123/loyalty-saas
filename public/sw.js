/* One coordinated worker. FCM sends data-only Web Push to this exact registration. */
importScripts('/push-protocol.js');
const SHELL_CACHE='loyalty-shell-v2';
const SHELL='/offline-v2.html';
const PUBLIC_ASSETS=[SHELL,'/icons/icon-192-v1.png','/icons/icon-512-v1.png',
  '/icons/maskable-192-v1.png','/icons/maskable-512-v1.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(PUBLIC_ASSETS))));
self.addEventListener('message',event=>{if(event.data?.type==='loyalty-activate-update')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('loyalty-shell-')&&key!==SHELL_CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin) return;
  if(PUBLIC_ASSETS.includes(url.pathname)&&url.pathname!==SHELL){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
    return;
  }
  if(event.request.mode==='navigate'&&!/^\/(api|auth|invite)(\/|$)/.test(url.pathname)){
    event.respondWith(fetch(event.request).catch(async()=>await caches.match(SHELL)||Response.error()));
  }
  // Never cache authenticated HTML, API responses, contacts, reports or mutations.
});

function pushState() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('loyalty-device-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Device state unavailable.'));
  });
}
async function readBinding() {
  const database=await pushState();
  try { return await new Promise((resolve,reject)=>{
    const request=database.transaction('state').objectStore('state').get('binding');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Device state unavailable.'));
  }); } finally { database.close(); }
}
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload;
    try { payload=event.data?.json(); } catch { return; }
    // Reject notification payloads: the application owns preview and account-switch checks.
    if(payload?.notification || !payload?.data) return;
    const data=payload.data;
    if(self.LoyaltyPushProtocol.challenge(data)) {
      const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of windows) if(client.visibilityState==='visible') client.postMessage({type:'loyalty-foreground-challenge',data});
      return; // A background registration challenge never activates or displays a notification.
    }
    const binding=await readBinding();
    if(!self.LoyaltyPushProtocol.matchesBinding(data,binding)) return;
    if(!/^[0-9a-f-]{36}$/i.test(data.recipientId||'') || !/^\/app\/(?:cards\/[0-9a-f-]{36}(?:\/rewards)?|offers\/[0-9a-f-]{36}|notifications)$/i.test(data.destination||'')) return;
    const imageUrl=/^https:\/\/[A-Za-z0-9.-]+\/storage\/v1\/object\/public\/loyalty-brand\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/v1\.webp$/i.test(data.imageUrl||'')?data.imageUrl:undefined;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const visible=windows.filter(client=>client.visibilityState==='visible');
    if(visible.length){for(const client of visible)client.postMessage({type:'loyalty-foreground-notification',
      data:{title:data.title,body:data.body,imageUrl,destination:data.destination,recipientId:data.recipientId,testOnly:data.testOnly==='true'}});return;}
    await self.registration.showNotification('Cafe loyalty update',{body:'Open the app to view your update.',icon:'/icons/icon-192-v1.png',
      image:imageUrl,
      tag:`loyalty-${data.eventKey}`,data:{bindingGeneration:binding.bindingGeneration,destination:data.destination,
        recipientId:data.recipientId,testOnly:data.testOnly==='true'}});
    const latest=await readBinding();
    if(!self.LoyaltyPushProtocol.matchesBinding(data,latest)) {
      const notifications=await self.registration.getNotifications({tag:`loyalty-${data.eventKey}`});
      notifications.forEach(notification=>notification.close());
    }
  })().catch(()=>{}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const binding=await readBinding();
    if(!binding || binding.bindingGeneration!==event.notification.data?.bindingGeneration) return;
    const destination=event.notification.data?.destination;
    if(!/^\/app\/(?:cards\/[0-9a-f-]{36}(?:\/rewards)?|offers\/[0-9a-f-]{36}|notifications)$/i.test(destination||''))return;
    if(!event.notification.data?.testOnly)try{await fetch('/api/communications/observe-campaign-click',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({id:event.notification.data.recipientId})});}catch{}
    await self.clients.openWindow(destination);
  })().catch(()=>{}));
});
