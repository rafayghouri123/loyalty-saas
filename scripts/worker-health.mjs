import pg from 'pg';
const url=process.env.WORKER_DATABASE_URL;
const ca=process.env.DATABASE_CA_CERT_PEM|| (process.env.DATABASE_CA_CERT_BASE64?Buffer.from(process.env.DATABASE_CA_CERT_BASE64,'base64').toString():undefined);
let pool;
try{
 const parsed=new URL(url);if([...parsed.searchParams.keys()].some(k=>k.toLowerCase().startsWith('ssl')))throw new Error('invalid_database');
 if(process.env.WORKER_DB_SSL==='false'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw new Error('remote_database_requires_tls');
 if(!ca&&process.env.WORKER_DB_SSL!=='false')throw new Error('certificate_missing');
 pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:5000,query_timeout:5000,ssl:process.env.WORKER_DB_SSL==='false'?false:{rejectUnauthorized:true,ca}});
 pool.on('error',()=>{process.exitCode=1;});
 const state=(await pool.query('select public.worker_health_status() state')).rows[0].state;
 if(!state.workerFresh)throw new Error('worker_stale');
 console.log(JSON.stringify({component:'worker-health',status:'ok'}));
}catch{console.log(JSON.stringify({component:'worker-health',status:'failed'}));process.exitCode=1;}
finally{await pool?.end();}
