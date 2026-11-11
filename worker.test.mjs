import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker, {osloParts,hasVisit,validSubscription,checkVisits} from './worker.mjs';
const sqlite=new DatabaseSync(':memory:');
const env={DB:{exec:async sql=>sqlite.exec(sql),prepare(sql){return{bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...(this.values||[]))||null;},async all(){return{results:sqlite.prepare(sql).all(...(this.values||[]))};},async run(){const r=sqlite.prepare(sql).run(...(this.values||[]));return{meta:{changes:r.changes}};}};}}};
const b64=b=>Buffer.from(b).toString('base64url');
const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
const subscription={endpoint:'https://web.push.apple.com/test-only',keys:{p256dh:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}};
const token=b64(crypto.getRandomValues(new Uint8Array(32)));
const request=(path,body,cap=token)=>worker.fetch(new Request('https://example.workers.dev'+path,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://alkasin84.github.io','Authorization':'Bearer '+cap},body:JSON.stringify(body)}),env);
let id;
test('19 Oslo in both seasons and DST transition days',()=>{
 for(const [iso,hour] of [['2026-11-10T18:00:00Z',19],['2026-07-10T17:00:00Z',19],['2026-03-29T17:00:00Z',19],['2026-10-25T18:00:00Z',19],['2026-11-10T17:00:00Z',18]]) assert.equal(osloParts(new Date(iso)).hour,hour);
 assert.equal(osloParts(new Date('2026-07-09T22:30:00Z')).day,'2026-07-10');
});
test('today, yesterday, future, empty, malformed log',()=>{
 const now=new Date('2026-07-10T17:00:00Z');
 assert.equal(hasVisit({a:{timestamp:'2026-07-09T22:30:00Z'}},now),true);
 assert.equal(hasVisit({a:{timestamp:'2026-07-09T21:30:00Z'}},now),false);
 assert.equal(hasVisit({a:{timestamp:'2026-07-10T18:30:00Z'}},now),false);
 assert.equal(hasVisit(null,now),false);
 assert.throws(()=>hasVisit({a:{timestamp:'broken'}},now));
 assert.throws(()=>hasVisit({error:'permission denied'},now));
});
test('push endpoint restrictions',()=>{
 assert.equal(validSubscription(subscription),true);
 for(const endpoint of ['http://web.push.apple.com/test','https://evil.test/test','https://web.push.apple.com.evil.test/test','https://user@web.push.apple.com/test','https://127.0.0.1/test']) assert.equal(validSubscription({...subscription,endpoint}),false);
 assert.equal(validSubscription({...subscription,keys:{p256dh:'wrong',auth:'wrong'}}),false);
});
test('activation, secret keys stay server side, no shared code, phone authorization',async()=>{
 const config=await worker.fetch(new Request('https://example.workers.dev/config'),env);
 const body=await config.json(); assert.equal(body.hour,19);assert.ok(body.publicKey);assert.equal(body.privateKey,undefined);
 assert.equal((await request('/subscribe',{subscription},'')).status,401);
 const res=await request('/subscribe',{subscription}); assert.equal(res.status,200);id=(await res.json()).id;
 assert.equal((await request('/unsubscribe',{id},b64(new Uint8Array(32)))).status,404);
 assert.equal((await request('/subscribe',{subscription},b64(new Uint8Array(32)))).status,409);
 assert.equal((await request('/test',{id},b64(new Uint8Array(32)))).status,404);
});
test('no notification for visits or source failure; once per phone/day under concurrent calls',async()=>{
 const oldFetch=globalThis.fetch;let pushes=0;let mode='visited';
 globalThis.fetch=async(url,init)=>{
  if(url.includes('firebasedatabase.app')){
   if(mode==='error')return new Response('denied',{status:403});
   return Response.json(mode==='visited'?{a:{timestamp:'2026-11-10T12:00:00Z'}}:null);
  }
  assert.equal(url,subscription.endpoint);assert.equal(init.redirect,'error');
  assert.equal(init.headers['Content-Encoding']||init.headers['content-encoding'],'aes128gcm');
  pushes++;return new Response(null,{status:201});
 };
 try {
  const now=new Date('2026-11-10T18:00:00Z');
  assert.equal((await checkVisits(env,now)).skipped,'visit-registered');assert.equal(pushes,0);
  mode='error';await assert.rejects(checkVisits(env,now));assert.equal(pushes,0);
  mode='empty';await Promise.all([checkVisits(env,now),checkVisits(env,now)]);assert.equal(pushes,1);
  await checkVisits(env,now);assert.equal(pushes,1);
  await checkVisits(env,new Date('2026-11-11T17:00:00Z'));assert.equal(pushes,1);
  await checkVisits(env,new Date('2026-11-11T18:00:00Z'));assert.equal(pushes,2);
  assert.equal((await request('/test',{id})).status,200);assert.equal(pushes,3);
  assert.equal((await request('/test',{id})).status,429);assert.equal(pushes,3);
 } finally {globalThis.fetch=oldFetch;}
});
test('unsubscribe only this phone',async()=>{
 assert.equal((await request('/unsubscribe',{id})).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM subscribers').get().n,0);
});
