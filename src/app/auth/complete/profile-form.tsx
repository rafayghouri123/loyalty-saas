'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileCompletionSchema } from '@/lib/validation/primitives';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { copy } from '@/lib/copy';
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
  return <form onSubmit={submit} noValidate aria-busy={isSubmitting}>
    <TextField id="displayName" label={copy.profile.name} help={copy.profile.nameHelp} error={errors.displayName?.message}
      autoComplete="given-name" required disabled={isSubmitting} {...register('displayName')} />
    <Button type="submit" className="full-width" disabled={isSubmitting}>{isSubmitting?copy.profile.saving:copy.profile.save}</Button>
    {serverError&&<p role="alert" className="error-text">{serverError}</p>}
  </form>;
}
