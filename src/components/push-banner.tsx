'use client';
import { useEffect,useState } from 'react';
import { communicationRequest } from '@/features/communications/client';
import Image from 'next/image';
type Notice={title:string;body:string;imageUrl?:string;destination:string;recipientId:string;testOnly?:boolean};
export function PushBanner(){
 const [notice,setNotice]=useState<Notice|null>(null);
 useEffect(()=>{
  const listener=(event:MessageEvent)=>{if(event.data?.type!=='loyalty-foreground-notification')return;
   const value=event.data.data;
   if(typeof value?.title==='string'&&typeof value?.body==='string'&&
    /^\/app\/(?:cards\/[0-9a-f-]{36}(?:\/rewards)?|offers\/[0-9a-f-]{36}|notifications)$/i.test(value?.destination||'')&&
    /^[0-9a-f-]{36}$/i.test(value?.recipientId||''))setNotice(value);};
  navigator.serviceWorker?.addEventListener('message',listener);
  return()=>navigator.serviceWorker?.removeEventListener('message',listener);
 },[]);
 if(!notice)return null;
 return <aside className="screen-panel" role="status" aria-label="New cafe notification"><strong>{notice.title}</strong><p>{notice.body}</p>
  {notice.imageUrl&&/^https:\/\/[A-Za-z0-9.-]+\/storage\/v1\/object\/public\/loyalty-brand\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/v1\.webp$/iu.test(notice.imageUrl)
    &&<Image unoptimized src={notice.imageUrl} width={320} height={180} alt=""/>}
  <div className="actions"><button onClick={()=>{if(!notice.testOnly)void communicationRequest('observe-campaign-click',{id:notice.recipientId});window.location.assign(notice.destination);}}>Open update</button>
  <button onClick={()=>setNotice(null)}>Dismiss</button></div></aside>;
}
