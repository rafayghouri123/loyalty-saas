'use client';
import { useEffect } from 'react';
export function PwaRegistration(){
  useEffect(()=>{
    if('serviceWorker' in navigator&&window.isSecureContext){
      // No skipWaiting: an update must not replace code during active checkout.
      void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
    }
  },[]);
  return null;
}
