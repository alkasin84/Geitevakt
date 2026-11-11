import { buildPushPayload } from '@block65/webcrypto-web-push';
const SITE = 'https://alkasin84.github.io/Geitevakt/';
const ORIGIN = 'https://alkasin84.github.io';
const LOG = 'https://geitevakt-default-rtdb.europe-west1.firebasedatabase.app/log.json';
const utf8 = new TextEncoder();
export function osloParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  return {day:`${p.year}-${p.month}-${p.day}`, hour:Number(p.hour)};
}
export function hasVisit(log, now) {
  if (log === null) return false;
  if (typeof log !== 'object' || Array.isArray(log)) throw new Error('Ugyldig besøkslogg');
  const day = osloParts(now).day;
  return Object.values(log).some(e => {
    if (!e || typeof e.timestamp !== 'string' || !Number.isFinite(Date.parse(e.timestamp))) throw new Error('Ugyldig dato i besøkslogg');
    return osloParts(new Date(e.timestamp)).day === day && Date.parse(e.timestamp) <= +now;
  });
}
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const hash = async s => b64(await crypto.subtle.digest('SHA-256',utf8.encode(s)));
const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export function validSubscription(s) {
  try {
    const u = new URL(s.endpoint);
    const host = u.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.notify.windows.com');
    return allowed && u.protocol === 'https:' && !u.port && !u.username && !u.password && !u.hash && s.endpoint.length < 2048 && /^[A-Za-z0-9_-]+$/.test(s.keys.p256dh) && /^[A-Za-z0-9_-]+$/.test(s.keys.auth) && decode(s.keys.p256dh).length === 65 && decode(s.keys.auth).length === 16;
  } catch { return false; }
}
let ready;
async function initialize(env) {
  if (!env.DB) throw new Error('Mangler DB');
  if (!ready) ready = (async()=>{
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS subscribers (id TEXT PRIMARY KEY, subscription TEXT NOT NULL, capability TEXT NOT NULL, created INTEGER NOT NULL, last_test INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE IF NOT EXISTS deliveries (day TEXT NOT NULL, subscriber TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(day, subscriber))'
    ]) await env.DB.prepare(sql).run();
    let row = await env.DB.prepare('SELECT value FROM settings WHERE id=1').first();
    if (!row) {
      const pair = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
      const priv = await crypto.subtle.exportKey('jwk',pair.privateKey);
      const pub = await crypto.subtle.exportKey('raw',pair.publicKey);
      const value = JSON.stringify({subject:SITE,publicKey:b64(pub),privateKey:priv.d});
      await env.DB.prepare('INSERT OR IGNORE INTO settings (id,value) VALUES (1,?)').bind(value).run();
    }
  })().catch(e=>{ready=undefined;throw e;});
  await ready;
  return JSON.parse((await env.DB.prepare('SELECT value FROM settings WHERE id=1').first()).value);
}
async function send(subscription, keys, test, day) {
  const payload = await buildPushPayload({data:JSON.stringify({title:'Geitevakt',body:test?'Testvarsel – denne telefonen er klar for varsler.':'Ingen besøk er registrert hos geitene i dag. Har noen vært innom?',tag:test?'geitevakt-test':`geitevakt-${day}`,url:SITE}),options:{ttl:3600}},subscription,keys);
  return fetch(subscription.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(15000)});
}
function result(data,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
}
export async function checkVisits(env, now = new Date()) {
  const {day,hour} = osloParts(now);
  if (hour !== 19) return {skipped:'outside-hour'};
  const keys = await initialize(env);
  const response = await fetch(LOG,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Besøksloggen kunne ikke leses (${response.status})`);
  if (hasVisit(await response.json(),now)) return {skipped:'visit-registered'};
  const {results:subscribers} = await env.DB.prepare('SELECT * FROM subscribers ORDER BY created LIMIT 10').all();
  let sent=0, failed=0;
  for (const row of subscribers) {
    // Atomic claim prevents duplicate cron invocations from sending twice.
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO deliveries (day,subscriber,state) VALUES (?,?,'claimed')").bind(day,row.id).run();
    if (!claim.meta.changes) continue;
    try {
      const res = await send(JSON.parse(row.subscription), keys, false, day);
      if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM subscribers WHERE id=?').bind(row.id).run();
      if (!res.ok) throw new Error(`Push svarte ${res.status}`);
      await env.DB.prepare("UPDATE deliveries SET state='sent' WHERE day=? AND subscriber=?").bind(day,row.id).run();
      sent++;
    } catch (e) {
      // Do not automatically retry an uncertain send: it may have been delivered.
      await env.DB.prepare("UPDATE deliveries SET state='failed' WHERE day=? AND subscriber=?").bind(day,row.id).run();
      console.error('Push sending failed', e.message); failed++;
    }
  }
  const cutoff = new Date(+now-35*86400000).toISOString().slice(0,10);
  await env.DB.prepare('DELETE FROM deliveries WHERE day < ?').bind(cutoff).run();
  return {sent,failed};
}
export default {
  async scheduled(event,env,ctx) { ctx.waitUntil(checkVisits(env,new Date(event.scheduledTime)).then(r=>console.log(JSON.stringify(r)))); },
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    if (request.headers.get('Origin') && request.headers.get('Origin') !== ORIGIN) return result({error:'Ugyldig nettsted'},403);
    if (request.method==='OPTIONS') return result({ok:true});
    try {
      const keys = await initialize(env);
      if (path==='/config' && request.method==='GET') return result({publicKey:keys.publicKey,hour:19,timeZone:'Europe/Oslo'});
      if (request.method!=='POST' || !['/subscribe','/unsubscribe','/test'].includes(path)) return result({error:'Ikke funnet'},404);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return result({error:'Forventet JSON'},415);
      const text=await request.text();
      if (text.length>6000) return result({error:'For stor forespørsel'},413);
      const data=JSON.parse(text);
      const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return result({error:'Ugyldig telefonnøkkel'},401);
      const cap=await hash(token);
      if (path==='/subscribe') {
        if (!validSubscription(data.subscription)) return result({error:'Ugyldig push-abonnement'},400);
        const id=await hash(data.subscription.endpoint);
        const existing=await env.DB.prepare('SELECT capability FROM subscribers WHERE id=?').bind(id).first();
        if (existing && existing.capability!==cap) return result({error:'Telefonen er allerede registrert. Slå av varsler og prøv igjen.'},409);
        const insert=await env.DB.prepare('INSERT OR IGNORE INTO subscribers (id,subscription,capability,created) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM subscribers)<10').bind(id,JSON.stringify(data.subscription),cap,Date.now()).run();
        if (!existing && !insert.meta.changes) return result({error:'Maksimalt antall telefoner er nådd'},409);
        return result({ok:true,id});
      }
      if (typeof data.id!=='string') return result({error:'Mangler telefon-ID'},400);
      const row=await env.DB.prepare('SELECT * FROM subscribers WHERE id=? AND capability=?').bind(data.id,cap).first();
      if (!row) return result({error:'Telefonen er ikke registrert. Aktiver varsler på nytt.'},404);
      if (path==='/unsubscribe') {
        await env.DB.prepare('DELETE FROM subscribers WHERE id=? AND capability=?').bind(data.id,cap).run();
        return result({ok:true});
      }
      const claim=await env.DB.prepare('UPDATE subscribers SET last_test=? WHERE id=? AND last_test < ?').bind(Date.now(),row.id,Date.now()-60000).run();
      if (!claim.meta.changes) return result({error:'Vent ett minutt mellom testvarsler'},429);
      const res=await send(JSON.parse(row.subscription),keys,true);
      if (!res.ok) throw new Error(`Push-tjenesten svarte ${res.status}`);
      return result({ok:true});
    } catch(e) {
      console.error('Geitevakt error', e.message);
      return result({error:'Varslingstjenesten er ikke klar eller kunne ikke svare. Prøv igjen senere.'},503);
    }
  }
};
