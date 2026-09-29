'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { whatsappRequest } from './client';
export type MemberContact={phone:string|null;phoneStatus:string;sharedEmail:string|null;rowVersion:number;phoneConfirmedAt:string|null;whatsappConsent:boolean;
 history:{taskId:string;state:string;openedAt:string|null;markedSentAt:string|null}[]};
export function ContactTools({businessId,membershipId,initial}:{businessId:string;membershipId:string;initial:MemberContact}){
 const [contact,setContact]=useState(initial),[note,setNote]=useState(''),[attested,setAttested]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[action,setAction]=useState<'opt_out'|'confirm_number'|null>(null);
 async function save(){if(!action)return;const selected=action;setAction(null);setBusy(true);setMessage('');
  try{setContact(await whatsappRequest<MemberContact>('member-contact-action',{businessId,membershipId,rowVersion:contact.rowVersion,action:selected,note,attested}));setAttested(false);setMessage(selected==='opt_out'?'WhatsApp consent revoked and pending tasks suppressed.':'Customer-initiated chat confirmation recorded. Consent is unchanged.');}
  catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 return <section className="screen-panel manual-followups"><h2>Shared contact and communication history</h2><p>WhatsApp: {contact.phone??'Not shared'} · {contact.phoneStatus.replaceAll('_',' ')} · Consent {contact.whatsappConsent?'allowed':'off'}</p>
  <p>Email deliberately shared with this cafe: {contact.sharedEmail??'Not shared'}</p>
  {contact.phone&&contact.whatsappConsent&&<Link href={`/dashboard/${businessId}/whatsapp/new?member=${membershipId}`}>Create manual follow-up</Link>}
  <label className="field">Contact action source / reason<textarea value={note} onChange={e=>setNote(e.target.value)}/></label>
  <label className="check-label"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>I verified this customer&apos;s opt-out request or customer-initiated chat</label>
  <div className="actions"><Button disabled={busy||!attested||note.trim().length<2} variant="secondary" onClick={()=>setAction('opt_out')}>Record WhatsApp opt-out</Button>
   <Button disabled={busy||!attested||note.trim().length<2||!contact.phone} variant="secondary" onClick={()=>setAction('confirm_number')}>Confirm number from customer-initiated chat</Button></div>
  <p>Staff cannot opt a customer in or replace the number. Confirmation does not prove ownership automatically and cannot recover or merge an account.</p><p role="status">{message}</p>
  <ul>{contact.history.map(t=><li key={t.taskId}><Link href={`/dashboard/${businessId}/whatsapp/tasks/${t.taskId}`}>Follow-up</Link> · {t.state.replaceAll('_',' ')} · Opened {t.openedAt?new Date(t.openedAt).toLocaleString('en-PK'):'never'} · Staff-marked sent {t.markedSentAt?new Date(t.markedSentAt).toLocaleString('en-PK'):'never'}</li>)}</ul>
  {action&&<ConfirmDialog title={action==='opt_out'?'Record customer opt-out?':'Confirm customer-initiated chat?'} description={action==='opt_out'?'This turns off WhatsApp marketing consent at this cafe immediately.':'Record only a number you actually verified through a customer-initiated chat. Marketing consent will remain unchanged.'} onCancel={()=>setAction(null)} onConfirm={()=>void save()} confirmLabel="Confirm contact action"/>}
 </section>;
}
