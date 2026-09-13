'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileCompletionSchema } from '@/lib/validation/primitives';
import { Button } from '@/components/ui/button';
export function ProfileForm({next}:{next:string}){
  const [serverError,setServerError]=useState('');
  const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm({resolver:zodResolver(profileCompletionSchema),defaultValues:{displayName:''}});
  const submit=handleSubmit(async values=>{
    setServerError('');
    try{
      const response=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
      const result=await response.json();
      if(!response.ok){setServerError(result.error?.message||'Your name could not be saved. Please retry.');return;}
      window.location.assign(next);
    }catch{setServerError('Your name could not be saved. Check your connection and retry.');}
  });
  return <form onSubmit={submit} noValidate><div className="field"><label htmlFor="displayName">Display name</label><input id="displayName" autoComplete="given-name" {...register('displayName')} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName?'name-error':'name-help'}/><small id="name-help">1–80 characters. You can choose what to share with each cafe.</small>{errors.displayName&&<p className="error-text" id="name-error">{errors.displayName.message}</p>}</div><Button type="submit" className="full-width" disabled={isSubmitting}>{isSubmitting?'Saving…':'Save and continue'}</Button>{serverError&&<p role="alert" className="error-text">{serverError}</p>}</form>;
}
