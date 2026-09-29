import {timingSafeEqual} from 'node:crypto';
export function authorized(request:Request,secret=process.env.CRON_SECRET){
 const supplied=request.headers.get('authorization');
 if(!secret||secret.length<32||!supplied)return false;
 const actual=Buffer.from(supplied),expected=Buffer.from(`Bearer ${secret}`);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function response(body:object,status=200){return Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}
