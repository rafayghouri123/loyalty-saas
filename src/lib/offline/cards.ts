export type OfflineCard={id:string;businessName:string;units:string;programmeType:'stamps'|'points';status:string};
type State={ownerId:string|null;enabled:boolean;cards:OfflineCard[];fetchedAt:number;epoch:string};
const databaseName='loyalty-offline-v1',storeName='state',recordKey='cards';
const blank=():State=>({ownerId:null,enabled:false,cards:[],fetchedAt:0,epoch:crypto.randomUUID()});
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open(databaseName,1);
 request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Offline storage is unavailable.'));
});}
async function read():Promise<State>{const db=await database();try{return await new Promise((resolve,reject)=>{
 const request=db.transaction(storeName).objectStore(storeName).get(recordKey);
 request.onsuccess=()=>resolve(request.result??blank());request.onerror=()=>reject(new Error('Offline storage is unavailable.'));
});}finally{db.close();}}
async function update(change:(current:State)=>State|null){const db=await database();try{await new Promise<void>((resolve,reject)=>{
 const tx=db.transaction(storeName,'readwrite'),object=tx.objectStore(storeName);let reason:Error|null=null;
 const request=object.get(recordKey);
 request.onsuccess=()=>{try{const next=change(request.result??blank());if(next)object.put(next,recordKey);}
  catch(error){reason=error instanceof Error?error:new Error('Offline storage is unavailable.');tx.abort();}};
 tx.oncomplete=()=>resolve();tx.onerror=()=>reject(reason??new Error('Offline storage is unavailable.'));
 tx.onabort=()=>reject(reason??new Error('Offline storage is unavailable.'));
});}finally{db.close();}}
export async function offlineSettings(userId:string){const state=await read();return {enabled:state.ownerId===userId&&state.enabled,
 count:state.ownerId===userId?state.cards.length:0,fetchedAt:state.ownerId===userId?state.fetchedAt:0};}
export async function switchOfflineOwner(userId:string|null){
 await update(state=>state.ownerId===userId?null:{...blank(),ownerId:userId});
}
export async function setOfflineEnabled(userId:string,enabled:boolean){
 await update(state=>{if(state.ownerId!==userId)throw new Error('The account changed. Refresh this page.');
  return {...state,enabled,cards:enabled?state.cards:[],fetchedAt:enabled?state.fetchedAt:0,epoch:crypto.randomUUID()};});
}
export async function clearOfflineCards(){await update(state=>({...blank(),ownerId:state.ownerId}));}
export async function saveOfflineCards(userId:string,cards:OfflineCard[]){
 const safe=cards.slice(0,20).map(card=>({id:card.id,businessName:card.businessName.slice(0,80),
  units:card.units,programmeType:card.programmeType,status:card.status}));
 if(new TextEncoder().encode(JSON.stringify(safe)).byteLength>1_048_576)return;
 await update(state=>state.ownerId!==userId||!state.enabled?null:{...state,cards:safe,fetchedAt:Date.now()});
}
