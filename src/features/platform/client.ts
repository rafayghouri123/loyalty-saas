import {ZodError} from 'zod';
export function platformError(error:unknown){return error instanceof ZodError?error.issues[0]?.message??'Check the required fields.':error instanceof Error?error.message:'The operation could not complete. Retry.';}
export async function platformRequest<T>(operation:string,input:unknown):Promise<T>{
 const response=await fetch(`/api/platform/${operation}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),cache:'no-store'});
 const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'The operation could not complete. Retry.');return result.data as T;
}
export function formPaisa(value:FormDataEntryValue|null){const raw=String(value??'').trim();if(!/^[0-9]+(?:\.[0-9]{1,2})?$/u.test(raw))throw new Error('Enter a valid PKR amount.');const [whole,fraction='']=raw.split('.');return (BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'))).toString();}
