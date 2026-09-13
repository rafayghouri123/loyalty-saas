import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { safeReturnPath } from '@/lib/security/http';
import { StatePanel } from '@/components/ui/state-panel';
import { ProfileForm } from './profile-form';
export const dynamic='force-dynamic';
export default async function CompleteProfile({searchParams}:{searchParams:Promise<{next?:string}>}){
  const {user,unavailable,client}=await verifiedUser();
  if(unavailable)return <main id="main" className="container"><StatePanel title="Account setup is unavailable" href="/auth/login" action="Back to sign in"><p>Authentication needs to be configured for this environment.</p></StatePanel></main>;
  if(!user||!client)redirect('/auth/login');
  const next=safeReturnPath((await searchParams).next);
  const {data,error}=await client.from('profiles').select('user_id').eq('auth_user_id',user.id).maybeSingle();
  if(error)return <main id="main" className="container"><StatePanel title="Account setup could not be checked" href="/auth/complete" action="Try again"><p>The database is temporarily unavailable.</p></StatePanel></main>;
  if(data)redirect(next);
  return <main id="main" className="auth-wrap"><section className="auth-card"><h1>What should we call you?</h1><p className="muted">Add your display name to finish setting up your account.</p><ProfileForm next={next}/></section></main>;
}
