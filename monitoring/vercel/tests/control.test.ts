import test from 'node:test';
import assert from 'node:assert/strict';
import {authorized,response} from '../lib/http';
test('controls require full bearer match with a sufficiently strong secret',()=>{
 const secret='x'.repeat(64);
 assert(!authorized(new Request('https://monitor.test'),secret));
 assert(!authorized(new Request('https://monitor.test',{headers:{authorization:'Bearer bad'}}),secret));
 assert(!authorized(new Request('https://monitor.test',{headers:{authorization:'Bearer short'}}),'short'));
 assert(authorized(new Request('https://monitor.test',{headers:{authorization:`Bearer ${secret}`}}),secret));
});
test('control replies never allow caching or referrer leakage',()=>{
 const reply=response({error:'unauthorized'},401);assert.equal(reply.status,401);assert.equal(reply.headers.get('Cache-Control'),'private, no-store');assert.equal(reply.headers.get('Referrer-Policy'),'no-referrer');
});
