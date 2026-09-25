'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from './ui/button';
import { clearDeviceState, deviceEpoch, readDeviceBinding, registerBrowserToken, saveDeviceBinding } from '@/lib/push/browser';

const receipt=z.strictObject({type:z.literal('loyalty.registration.v1'),challengeId:z.uuid(),installationId:z.uuid(),nonce:z.string().regex(/^[A-Za-z0-9_-]{43}$/u)});
const confirmation=z.strictObject({installationId:z.uuid(),bindingGeneration:z.uuid(),status:z.literal('active')});
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function PushRegistration({userId,configured}:{userId:string;configured:boolean}) {
  const [state,setState]=useState<'idle'|'pending'|'active'>('idle'),[message,setMessage]=useState('');
  const [install,setInstall]=useState<InstallPrompt|null>(null),[iphone,setIphone]=useState(false),[standalone,setStandalone]=useState(false);
  const pending=useRef<{challengeId:string;installationId:string}|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const busy=useRef(false);
  const epoch=useRef<string|null>(null);
  const starting=useRef(false);
  const early=useRef<z.infer<typeof receipt>|null>(null);
  const confirm=useRef<((data:z.infer<typeof receipt>)=>Promise<void>)|null>(null);
  useEffect(()=>{
    setIphone(/iPhone|iPad|iPod/u.test(navigator.userAgent)||/Macintosh/u.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
    setStandalone(window.matchMedia('(display-mode: standalone)').matches||('standalone' in navigator&&Boolean((navigator as Navigator&{standalone?:boolean}).standalone)));
    const onPrompt=(event:Event)=>{event.preventDefault();setInstall(event as InstallPrompt);};
    window.addEventListener('beforeinstallprompt',onPrompt);
    return()=>window.removeEventListener('beforeinstallprompt',onPrompt);
  },[]);
  useEffect(()=>{
    let disposed=false;
    void readDeviceBinding().then(async binding=>{
      if(binding&&binding.userId!==userId) await clearDeviceState();
      if(!disposed&&binding?.userId===userId) setState('active');
    }).catch(()=>{if(!disposed)setMessage('Device storage is unavailable. You can still use loyalty cards.');});
    const accept=async(data:z.infer<typeof receipt>)=>{
      if(disposed||document.visibilityState!=='visible'||busy.current)return;
      const expected=pending.current;
      if(!expected){if(starting.current)early.current=data;return;}
      if(data.challengeId!==expected.challengeId||data.installationId!==expected.installationId)return;
      busy.current=true;
      try {
        const response=await fetch('/api/push/acknowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:data.challengeId,installationId:data.installationId,nonce:data.nonce})});
        const result=await response.json();
        if(!response.ok) throw new Error(result.error?.message||'The device confirmation failed.');
        const binding=confirmation.parse(result.data);
        if(disposed||!pending.current) return;
        await saveDeviceBinding({userId,installationId:binding.installationId,bindingGeneration:binding.bindingGeneration},epoch.current??undefined);
        pending.current=null;if(timer.current)clearTimeout(timer.current);
        setState('active');setMessage('This device is confirmed. Choose message preferences separately on each business card.');
      } catch(error) {setState('idle');setMessage(error instanceof Error?error.message:'This device could not be confirmed.');}
      finally {busy.current=false;}
    };
    confirm.current=accept;
    const listener=(event:MessageEvent)=>{
      if(event.data?.type!=='loyalty-foreground-challenge')return;
      const parsed=receipt.safeParse(event.data.data);
      if(parsed.success)void accept(parsed.data);
    };
    navigator.serviceWorker?.addEventListener('message',listener);
    return()=>{disposed=true;pending.current=null;confirm.current=null;early.current=null;if(timer.current)clearTimeout(timer.current);navigator.serviceWorker?.removeEventListener('message',listener);};
  },[userId]);
  async function enable() {
    setMessage('');setState('pending');starting.current=true;early.current=null;
    try {
      if(!('Notification' in window)||!('serviceWorker' in navigator)) throw new Error('Notifications are unavailable in this browser.');
      epoch.current=await deviceEpoch();
      if(await Notification.requestPermission()!=='granted') throw new Error('Notifications are off. You can still use all your loyalty cards.');
      const token=await registerBrowserToken();
      const response=await fetch('/api/push/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error?.message||'Notifications could not be registered.');
      pending.current=z.object({challengeId:z.uuid(),installationId:z.uuid()}).parse(result.data);
      setMessage('Keep this page open while we confirm that this device can receive notifications.');
      timer.current=setTimeout(()=>{pending.current=null;setState('idle');setMessage('Device confirmation expired. Keep this page open and try again.');},300_000);
      starting.current=false;
      if(early.current)await confirm.current?.(early.current);
      early.current=null;
    } catch(error) {starting.current=false;early.current=null;setState('idle');setMessage(error instanceof Error?error.message:'Notifications are unavailable.');}
  }
  async function disable() {
    pending.current=null;if(timer.current)clearTimeout(timer.current);
    setState('pending');
    try {
      await clearDeviceState();
      const response=await fetch('/api/push/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!response.ok) throw new Error('This device is cleared locally. Reconnect and retry to finish server revocation.');
      setState('idle');setMessage('Notifications are off on this device.');
    } catch(error) {setState('idle');setMessage(error instanceof Error?error.message:'Device revocation could not be completed.');}
  }
  return <div><p>Notifications are optional. Enabling this device does not subscribe you to business marketing.</p>
    {!standalone&&iphone&&<p>On iPhone or iPad, use Share → Add to Home Screen, then open the installed app to enable push notifications. Loyalty cards work without installing.</p>}
    {!standalone&&install&&<Button variant="secondary" onClick={()=>{void install.prompt().then(()=>install.userChoice).finally(()=>setInstall(null));}}>Install app</Button>}
    {!standalone&&!iphone&&!install&&<p>For easier access, use your browser menu to install this app if the option is available.</p>}
    {!configured&&<p className="notice">Notification setup is not configured in this environment.</p>}
    <Button disabled={!configured||state==='pending'} onClick={state==='active'?disable:enable}>{state==='active'?'Turn off this device':state==='pending'?'Confirming device…':'Enable notifications'}</Button>
    <p role="status" className="microcopy">{message}</p></div>;
}
