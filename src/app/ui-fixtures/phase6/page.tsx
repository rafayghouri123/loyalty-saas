import { notFound } from 'next/navigation';
import { fixturesEnabled } from '@/features/screens/fixture-gate';
import { TemplatesManager } from '@/features/whatsapp/templates-ui';
import { FollowupBatch } from '@/features/whatsapp/batch-ui';
import { FollowupTask, FollowupTasks } from '@/features/whatsapp/tasks-ui';
import type { Config, TaskDetail } from '@/features/whatsapp/types';
export const dynamic = 'force-dynamic';
const id=(n:number)=>`b6000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config:Config={businessName:'TEST cafe',staffId:id(2),role:'owner',marketingAvailable:true,
 templates:[{id:id(3),name:'TEST greeting',body:'Hello {{first_name}}, visit {{business_name}}.',version:1,rowVersion:1,active:true}],
 assignees:[{id:id(2),name:'TEST owner',role:'owner'}],rewards:[{id:id(4),title:'TEST coffee'}],offers:[],batches:[],members:[{id:id(5),name:'TEST Ayesha',status:'active'}]};
const task:TaskDetail={id:id(6),name:'TEST Ayesha',membershipId:id(5),batchName:'TEST batch',state:'pending',rowVersion:1,body:'Hello Ayesha 😀 & friends.\nVisit TEST cafe.',
 contactStale:false,consent:true,memberActive:true,phone:'+923001234567',phoneStatus:'unverified',contactVersion:1,assignedId:null,staffId:id(2),leaseOwnerId:null,leaseExpiresAt:null,
 openedAt:null,markedSentAt:null,marketingAvailable:true,history:[]};
export default async function Page({searchParams}:{searchParams:Promise<{form?:string}>}){
 if(!fixturesEnabled())notFound();const {form='templates'}=await searchParams;
 return <><p className="notice">Local Phase 6 component fixture. Synthetic data only; API results are not simulated by this page.</p>
 {form==='templates'&&<TemplatesManager businessId={id(1)} initial={config}/>}
 {form==='batch'&&<FollowupBatch businessId={id(1)} initial={config}/>}
 {['task','stale','opted-out'].includes(form)&&<FollowupTask businessId={id(1)} config={config} initial={{...task,contactStale:form==='stale',consent:form!=='opted-out'}}/>}
 {form==='list'&&<FollowupTasks businessId={id(1)} config={config} initial={{tasks:[],counts:{opened:0,staffMarkedSent:0},offset:0,dataAsOf:'2026-09-26T12:00:00Z'}}/>}</>;
}
