'use client';
import { useEffect, useState } from 'react';
import { clearDeviceState, readDeviceBinding } from '@/lib/push/browser';
import { Button } from './ui/button';

export function DeviceSessionGuard({userId}:{userId:string|null}) {
  useEffect(()=>{
    if(!('indexedDB' in window))return;
    void readDeviceBinding().then(async binding=>{if(binding&&binding.userId!==userId)await clearDeviceState();}).catch(()=>{});
  },[userId]);
  return null;
}
export function SignOutButton() {
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  async function signOut() {
    setPending(true);setError('');
    try {
      await clearDeviceState();
      const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const result=await response.json();
      if(!response.ok&&response.status!==401)throw new Error(result.error?.message||'Sign-out could not be completed.');
      // Full navigation discards React/router state from the old account.
      window.location.replace('/auth/login');
    } catch(e) {setError(e instanceof Error?e.message:'Sign-out could not be completed.');setPending(false);}
  }
  return <div><Button variant="secondary" disabled={pending} onClick={signOut}>{pending?'Signing out…':'Sign out'}</Button>{error&&<p role="alert" className="error-text">{error}</p>}</div>;
}
