export async function communicationRequest<T>(operation:string,input:unknown):Promise<T>{
 const response=await fetch(`/api/communications/${operation}`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(input),cache:'no-store'});
 const payload=await response.json();
 if(!response.ok)throw new Error(payload.error?.message??'Could not complete this action.');
 return payload.data as T;
}
