'use client';
import { useEffect,useState } from 'react';
import { Button } from './ui/button';
import { clearOfflineCards,offlineSettings,saveOfflineCards,setOfflineEnabled,type OfflineCard } from '@/lib/offline/cards';
export function CardsSnapshot({userId,cards}:{userId:string;cards:OfflineCard[]}){
 useEffect(()=>{let active=true;const timer=setTimeout(()=>{if(active)void saveOfflineCards(userId,cards).catch(()=>{});},100);
  return()=>{active=false;clearTimeout(timer);};},[userId,cards]);
 return null;
}
export function OfflineCardSettings({userId}:{userId:string}){
 const [enabled,setEnabled]=useState(false),[count,setCount]=useState(0),[message,setMessage]=useState('');
 useEffect(()=>{void offlineSettings(userId).then(value=>{setEnabled(value.enabled);setCount(value.count);}).catch(()=>setMessage('Offline storage is unavailable.'));},[userId]);
 return <section className="screen-panel"><h2>Offline cards</h2><p>Optional saved summaries are limited to 20 cards, 1 MiB, and 24 hours. Balances may be stale. Awards and rewards always need an online confirmation.</p>
  <label className="check-label"><input type="checkbox" checked={enabled} onChange={async event=>{
   try{await setOfflineEnabled(userId,event.target.checked);setEnabled(event.target.checked);setMessage(event.target.checked?'Your cards will be saved on this browser when you next open Cards.':'Saved card data cleared.');if(!event.target.checked)setCount(0);}
   catch(error){setMessage((error as Error).message);}}}/>Keep my cards available offline</label>
  <p>{count} saved card summaries on this installation.</p>
  <Button variant="secondary" onClick={async()=>{try{await clearOfflineCards();setEnabled(false);setCount(0);setMessage('Offline card data cleared.');}catch(error){setMessage((error as Error).message);}}}>Clear offline card data</Button>
  {message&&<p role="status">{message}</p>}</section>;
}
