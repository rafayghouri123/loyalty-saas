import { notFound,redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { configuration } from './contracts';
export async function reportConfig(businessId:string){
 if(!z.uuid().safeParse(businessId).success)notFound();
 const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
 const {data,error}=await client.rpc('report_configuration',{p_business:businessId});
 if(error?.code==='42501'||error?.code==='P0002')notFound();
 if(error){console.error(JSON.stringify({event:'report_configuration_error',code:error.code}));throw new Error('Reports could not be loaded. Retry.');}
 const parsed=configuration.safeParse(data);
 if(!parsed.success){console.error(JSON.stringify({event:'report_configuration_invalid',issues:parsed.error.issues.map(issue=>({code:issue.code,path:issue.path}))}));throw new Error('Reports could not be loaded. Retry.');}
 return parsed.data;
}
