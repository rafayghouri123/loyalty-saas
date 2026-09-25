import { getPublicConfig } from '@/lib/config';

export function publicOfferImageUrl(path:string|null|undefined){
 const config=getPublicConfig();
 if(!config||!path||!/^\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/v1\.webp$/iu.test(`/${path}`))return null;
 return `${config.supabaseUrl}/storage/v1/object/public/loyalty-brand/${path.split('/').map(encodeURIComponent).join('/')}`;
}
