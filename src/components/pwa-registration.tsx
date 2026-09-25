'use client';
import { useEffect,useState } from 'react';
export function PwaRegistration(){
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  useEffect(()=>{
    if('serviceWorker' in navigator&&window.isSecureContext){
      // Activation is offered explicitly and disabled during active checkout.
      void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(registration=>{
        if(registration.waiting)setWaiting(registration.waiting);
        registration.addEventListener('updatefound',()=>{const installing=registration.installing;
          installing?.addEventListener('statechange',()=>{if(installing.state==='installed'&&navigator.serviceWorker.controller)setWaiting(registration.waiting);});});
      }).catch(()=>{});
    }
  },[]);
  if(!waiting)return null;
  const checkout=typeof window!=='undefined'&&/^\/staff\/[^/]+\/(checkout|redeem)/.test(window.location.pathname);
  return <aside className="screen-panel" role="status"><p>An app update is ready.</p><button disabled={checkout} onClick={()=>{
    navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});
    waiting.postMessage({type:'loyalty-activate-update'});}}>Update app</button>{checkout&&<p>Finish this checkout before updating.</p>}</aside>;
}
