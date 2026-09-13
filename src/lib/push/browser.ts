'use client';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseWebConfig } from './config';

export type DeviceBinding = { userId: string; installationId: string; bindingGeneration: string };
async function database() {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('loyalty-device-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Device storage is unavailable.'));
  });
}
export async function readDeviceBinding() {
  const db=await database();
  try { return await new Promise<DeviceBinding | undefined>((resolve,reject)=>{
    const request=db.transaction('state').objectStore('state').get('binding');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Device storage is unavailable.'));
  }); } finally { db.close(); }
}
export async function deviceEpoch() {
  const db=await database();
  try {return await new Promise<string>((resolve,reject)=>{
    let epoch:string;
    const transaction=db.transaction('state','readwrite'),store=transaction.objectStore('state'),request=store.get('epoch');
    request.onsuccess=()=>{epoch=request.result??crypto.randomUUID();store.put(epoch,'epoch');};
    transaction.oncomplete=()=>resolve(epoch);transaction.onerror=()=>reject(new Error('Device storage is unavailable.'));
  });}finally{db.close();}
}
export async function saveDeviceBinding(binding: DeviceBinding | null,expectedEpoch?:string) {
  const db=await database();
  try { await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction('state','readwrite'), store=transaction.objectStore('state');
    if(binding) {
      const request=store.get('epoch');
      request.onsuccess=()=>{if(!expectedEpoch||request.result!==expectedEpoch){transaction.abort();return;}store.put(binding,'binding');};
    } else {store.put(crypto.randomUUID(),'epoch');store.delete('binding');}
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(new Error('Device storage is unavailable.'));transaction.onabort=()=>reject(new Error('The account changed. Enable notifications again.'));
  }); } finally { db.close(); }
}
export async function browserMessaging() {
  const config=firebaseWebConfig();
  if(!config || !await isSupported()) throw new Error('Push notifications are unavailable in this browser. On iPhone, open the installed app from your Home Screen.');
  return getMessaging(getApps().length?getApp():initializeApp(config));
}
export async function registerBrowserToken() {
  const registration=await navigator.serviceWorker.ready;
  return getToken(await browserMessaging(),{vapidKey:process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,serviceWorkerRegistration:registration});
}
export async function clearDeviceState() {
  // Drop the generation before network work, so queued old-account messages are suppressed.
  await saveDeviceBinding(null);
  const registration=await navigator.serviceWorker?.getRegistration('/');
  const notifications=await registration?.getNotifications();
  notifications?.forEach(notification=>notification.close());
  try { await deleteToken(await browserMessaging()); } catch { /* Token deletion is best effort; server binding revocation is authoritative. */ }
}
