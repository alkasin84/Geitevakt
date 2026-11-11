// varsling/node_modules/uint8array-extras/index.js
var objectToString = Object.prototype.toString;
var uint8ArrayStringified = "[object Uint8Array]";
var arrayBufferStringified = "[object ArrayBuffer]";
function isType(value, typeConstructor, typeStringified) {
  if (!value) {
    return false;
  }
  if (value.constructor === typeConstructor) {
    return true;
  }
  return objectToString.call(value) === typeStringified;
}
function isUint8Array(value) {
  return isType(value, Uint8Array, uint8ArrayStringified);
}
function isArrayBuffer(value) {
  return isType(value, ArrayBuffer, arrayBufferStringified);
}
function isUint8ArrayOrArrayBuffer(value) {
  return isUint8Array(value) || isArrayBuffer(value);
}
function toUint8ArrayIfArrayBuffer(value) {
  return isArrayBuffer(value) ? new Uint8Array(value) : value;
}
function assertUint8ArrayOrArrayBuffer(value) {
  if (!isUint8ArrayOrArrayBuffer(value)) {
    throw new TypeError(`Expected \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof value}\``);
  }
}
function toUint8Array(value) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError(`Unsupported value, got \`${typeof value}\`.`);
}
function concatUint8Arrays(arrays, totalLength) {
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }
  totalLength ??= arrays.reduce((accumulator, currentValue) => accumulator + currentValue.byteLength, 0);
  const returnValue = new Uint8Array(totalLength);
  let offset = 0;
  for (let array of arrays) {
    assertUint8ArrayOrArrayBuffer(array);
    array = toUint8ArrayIfArrayBuffer(array);
    returnValue.set(array, offset);
    offset += array.length;
  }
  return returnValue;
}
var cachedDecoders = {
  utf8: new globalThis.TextDecoder("utf8")
};
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(`Expected \`string\`, got \`${typeof value}\``);
  }
}
var cachedEncoder = new globalThis.TextEncoder();
function stringToUint8Array(string) {
  assertString(string);
  return cachedEncoder.encode(string);
}
function base64ToBase64Url(base64) {
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function base64UrlToBase64(base64url) {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - base64.length % 4) % 4;
  return base64 + "=".repeat(padding);
}
var MAX_BLOCK_SIZE = 65535;
function uint8ArrayToBase64(array, { urlSafe = false } = {}) {
  assertUint8ArrayOrArrayBuffer(array);
  array = toUint8ArrayIfArrayBuffer(array);
  let base64 = "";
  for (let index = 0; index < array.length; index += MAX_BLOCK_SIZE) {
    const chunk = array.subarray(index, index + MAX_BLOCK_SIZE);
    base64 += globalThis.btoa(String.fromCodePoint.apply(void 0, chunk));
  }
  return urlSafe ? base64ToBase64Url(base64) : base64;
}
function base64ToUint8Array(base64String) {
  assertString(base64String);
  return Uint8Array.from(globalThis.atob(base64UrlToBase64(base64String)), (x) => x.codePointAt(0));
}
var byteToHexLookupTable = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/utils.js
function encodeRecordSize(size) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, size);
  return bytes;
}
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/client-keys.js
async function deriveClientKeys(sub) {
  const bytes = base64ToUint8Array(sub.keys.p256dh);
  const authSecretBytes = base64ToUint8Array(sub.keys.auth);
  invariant(bytes.byteLength === 65 && bytes[0] === 4, "Subscription p256dh is not an uncompressed P-256 point");
  invariant(authSecretBytes.byteLength === 16, "Subscription auth secret is not 16 bytes");
  return {
    publicKeyBytes: bytes,
    publicKey: await crypto.subtle.importKey("raw", bytes, {
      name: "ECDH",
      namedCurve: "P-256"
    }, false, []),
    authSecretBytes
  };
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/hkdf.js
function createHMAC(data) {
  const keyPromise = crypto.subtle.importKey("raw", data, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  return {
    hash: async (input) => {
      const k = await keyPromise;
      return crypto.subtle.sign("HMAC", k, input);
    }
  };
}
async function hkdf(salt, ikm) {
  const prkhPromise = createHMAC(salt).hash(ikm).then((prk) => createHMAC(prk));
  return {
    extract: async (info, len) => {
      const prkh = await prkhPromise;
      const blocks = await Array.from({ length: Math.ceil(len / 32) }, (_, i) => i).reduce(async (acc, i) => {
        const previous = await acc;
        const hash2 = await prkh.hash(new Uint8Array([...previous.at(-1) ?? [], ...info, i + 1]));
        return [...previous, new Uint8Array(hash2)];
      }, Promise.resolve([]));
      return concatUint8Arrays(blocks).slice(0, len);
    }
  };
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/info.js
function createKeyInfo(clientPublic, serverPublic) {
  return new Uint8Array([
    ...stringToUint8Array("WebPush: info\0"),
    ...clientPublic,
    ...serverPublic
  ]);
}
function createInfo(type) {
  return stringToUint8Array(`Content-Encoding: ${type}\0`);
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/local-keys.js
async function generateLocalKeys() {
  const keyPair = await crypto.subtle.generateKey({
    name: "ECDH",
    namedCurve: "P-256"
  }, false, ["deriveBits"]);
  return {
    privateKey: keyPair.privateKey,
    publicKeyBytes: new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
  };
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/salt.js
async function getSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/encrypt.js
var recordSize = 4096;
var headerSize = 21 + 65;
var maxPlaintextSize = recordSize - headerSize - 17;
async function encryptNotification(subscription, plaintext, options = {}) {
  invariant(plaintext.byteLength <= maxPlaintextSize, `Payload is ${plaintext.byteLength} bytes, the maximum is ${maxPlaintextSize}`);
  const clientKeys = await deriveClientKeys(subscription);
  const salt = await getSalt();
  const localKeys = await generateLocalKeys();
  const sharedSecret = await crypto.subtle.deriveBits({
    name: "ECDH",
    public: clientKeys.publicKey
  }, localKeys.privateKey, 256);
  const keyInfo = createKeyInfo(clientKeys.publicKeyBytes, localKeys.publicKeyBytes);
  const cekInfo = createInfo("aes128gcm");
  const nonceInfo = createInfo("nonce");
  const ikmHkdf = await hkdf(clientKeys.authSecretBytes, sharedSecret);
  const ikm = await ikmHkdf.extract(keyInfo, 32);
  const messageHkdf = await hkdf(salt, ikm);
  const cekBytes = await messageHkdf.extract(cekInfo, 16);
  const nonceBytes = await messageHkdf.extract(nonceInfo, 12);
  const cekCryptoKey = await crypto.subtle.importKey("raw", cekBytes, {
    name: "AES-GCM",
    length: 128
  }, false, ["encrypt"]);
  const padTo = options.pad ?? true ? maxPlaintextSize : plaintext.byteLength;
  const padded = new Uint8Array(padTo + 1);
  padded.set(plaintext);
  padded[plaintext.byteLength] = 2;
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: nonceBytes
  }, cekCryptoKey, padded);
  return new Uint8Array([
    ...salt,
    ...encodeRecordSize(recordSize),
    localKeys.publicKeyBytes.byteLength,
    ...localKeys.publicKeyBytes,
    ...new Uint8Array(encrypted)
  ]);
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/base64.js
function encodeBase64Url(value) {
  return uint8ArrayToBase64(toUint8Array(value), { urlSafe: true });
}
function objectToBase64Url(obj) {
  return encodeBase64Url(stringToUint8Array(JSON.stringify(obj)));
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/jwt.js
async function sign(payload, key) {
  const headerStr = objectToBase64Url({
    typ: "JWT",
    alg: "ES256"
  });
  const payloadStr = objectToBase64Url({
    iat: Math.floor(Date.now() / 1e3),
    ...payload
  });
  const dataStr = `${headerStr}.${payloadStr}`;
  const signature = await crypto.subtle.sign({
    name: "ECDSA",
    hash: "SHA-256"
  }, key, stringToUint8Array(dataStr));
  return `${dataStr}.${encodeBase64Url(signature)}`;
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/vapid.js
async function vapidHeaders(subscription, vapid) {
  invariant(vapid.subject, "Vapid subject is empty");
  invariant(vapid.privateKey, "Vapid private key is empty");
  invariant(vapid.publicKey, "Vapid public key is empty");
  const endpoint = new URL(subscription.endpoint);
  invariant(endpoint.protocol === "https:", `Subscription endpoint is not https: ${endpoint.protocol}`);
  const vapidPublicKeyBytes = base64ToUint8Array(vapid.publicKey);
  const publicKey = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(vapidPublicKeyBytes.slice(1, 33)),
    y: encodeBase64Url(vapidPublicKeyBytes.slice(33, 65)),
    d: vapid.privateKey
  }, {
    name: "ECDSA",
    namedCurve: "P-256"
  }, false, ["sign"]);
  const jwt = await sign({
    aud: endpoint.origin,
    exp: Math.floor(Date.now() / 1e3) + 12 * 60 * 60,
    sub: vapid.subject
  }, publicKey);
  return {
    headers: {
      authorization: `vapid t=${jwt}, k=${vapid.publicKey}`
    }
  };
}

// varsling/node_modules/@block65/webcrypto-web-push/dist/lib/payload.js
async function buildPushPayload(message, subscription, vapid) {
  const { headers } = await vapidHeaders(subscription, vapid);
  const body = await encryptNotification(subscription, stringToUint8Array(
    // if its a primitive, convert to string, otherwise stringify
    typeof message.data === "string" || typeof message.data === "number" ? message.data.toString() : JSON.stringify(message.data)
  ));
  return {
    headers: {
      ...headers,
      ttl: (message.options?.ttl || 60).toString(),
      ...message.options?.urgency && {
        urgency: message.options.urgency
      },
      ...message.options?.topic && {
        topic: message.options.topic
      },
      "content-encoding": "aes128gcm",
      "content-length": body.byteLength.toString(),
      "content-type": "application/octet-stream"
    },
    method: "post",
    body
  };
}

// varsling/worker.mjs
var SITE = "https://alkasin84.github.io/Geitevakt/";
var ORIGIN = "https://alkasin84.github.io";
var LOG = "https://geitevakt-default-rtdb.europe-west1.firebasedatabase.app/log.json";
var utf8 = new TextEncoder();
function osloParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date).map((p2) => [p2.type, p2.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
function hasVisit(log, now) {
  if (log === null) return false;
  if (typeof log !== "object" || Array.isArray(log)) throw new Error("Ugyldig bes\xF8kslogg");
  const day = osloParts(now).day;
  return Object.values(log).some((e) => {
    if (!e || typeof e.timestamp !== "string" || !Number.isFinite(Date.parse(e.timestamp))) throw new Error("Ugyldig dato i bes\xF8kslogg");
    return osloParts(new Date(e.timestamp)).day === day && Date.parse(e.timestamp) <= +now;
  });
}
var b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
var hash = async (s) => b64(await crypto.subtle.digest("SHA-256", utf8.encode(s)));
var decode = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
function validSubscription(s) {
  try {
    const u = new URL(s.endpoint);
    const host = u.hostname;
    const allowed = host === "fcm.googleapis.com" || host === "web.push.apple.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".notify.windows.com");
    return allowed && u.protocol === "https:" && !u.port && !u.username && !u.password && !u.hash && s.endpoint.length < 2048 && /^[A-Za-z0-9_-]+$/.test(s.keys.p256dh) && /^[A-Za-z0-9_-]+$/.test(s.keys.auth) && decode(s.keys.p256dh).length === 65 && decode(s.keys.auth).length === 16;
  } catch {
    return false;
  }
}
var ready;
async function initialize(env) {
  if (!env.DB) throw new Error("Mangler DB");
  if (!ready) ready = (async () => {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS subscribers (id TEXT PRIMARY KEY, subscription TEXT NOT NULL, capability TEXT NOT NULL, created INTEGER NOT NULL, last_test INTEGER NOT NULL DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS deliveries (day TEXT NOT NULL, subscriber TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(day, subscriber))"
    ]) await env.DB.prepare(sql).run();
    let row = await env.DB.prepare("SELECT value FROM settings WHERE id=1").first();
    if (!row) {
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
      const pub = await crypto.subtle.exportKey("raw", pair.publicKey);
      const value = JSON.stringify({ subject: SITE, publicKey: b64(pub), privateKey: priv.d });
      await env.DB.prepare("INSERT OR IGNORE INTO settings (id,value) VALUES (1,?)").bind(value).run();
    }
  })().catch((e) => {
    ready = void 0;
    throw e;
  });
  await ready;
  return JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE id=1").first()).value);
}
async function send(subscription, keys, test, day) {
  const payload = await buildPushPayload({ data: JSON.stringify({ title: "Geitevakt", body: test ? "Testvarsel \u2013 denne telefonen er klar for varsler." : "Ingen bes\xF8k er registrert hos geitene i dag. Har noen v\xE6rt innom?", tag: test ? "geitevakt-test" : `geitevakt-${day}`, url: SITE }), options: { ttl: 3600 } }, subscription, keys);
  return fetch(subscription.endpoint, { ...payload, redirect: "error", signal: AbortSignal.timeout(15e3) });
}
function result(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGIN, "Vary": "Origin", "Cache-Control": "no-store", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
async function checkVisits(env, now = /* @__PURE__ */ new Date()) {
  const { day, hour } = osloParts(now);
  if (hour !== 19) return { skipped: "outside-hour" };
  const keys = await initialize(env);
  const response = await fetch(LOG, { cache: "no-store", signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw new Error(`Bes\xF8ksloggen kunne ikke leses (${response.status})`);
  if (hasVisit(await response.json(), now)) return { skipped: "visit-registered" };
  const { results: subscribers } = await env.DB.prepare("SELECT * FROM subscribers ORDER BY created LIMIT 10").all();
  let sent = 0, failed = 0;
  for (const row of subscribers) {
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO deliveries (day,subscriber,state) VALUES (?,?,'claimed')").bind(day, row.id).run();
    if (!claim.meta.changes) continue;
    try {
      const res = await send(JSON.parse(row.subscription), keys, false, day);
      if (res.status === 404 || res.status === 410) await env.DB.prepare("DELETE FROM subscribers WHERE id=?").bind(row.id).run();
      if (!res.ok) throw new Error(`Push svarte ${res.status}`);
      await env.DB.prepare("UPDATE deliveries SET state='sent' WHERE day=? AND subscriber=?").bind(day, row.id).run();
      sent++;
    } catch (e) {
      await env.DB.prepare("UPDATE deliveries SET state='failed' WHERE day=? AND subscriber=?").bind(day, row.id).run();
      console.error("Push sending failed", e.message);
      failed++;
    }
  }
  const cutoff = new Date(+now - 35 * 864e5).toISOString().slice(0, 10);
  await env.DB.prepare("DELETE FROM deliveries WHERE day < ?").bind(cutoff).run();
  return { sent, failed };
}
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkVisits(env, new Date(event.scheduledTime)).then((r) => console.log(JSON.stringify(r))));
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.headers.get("Origin") && request.headers.get("Origin") !== ORIGIN) return result({ error: "Ugyldig nettsted" }, 403);
    if (request.method === "OPTIONS") return result({ ok: true });
    try {
      const keys = await initialize(env);
      if (path === "/config" && request.method === "GET") return result({ publicKey: keys.publicKey, hour: 19, timeZone: "Europe/Oslo" });
      if (request.method !== "POST" || !["/subscribe", "/unsubscribe", "/test"].includes(path)) return result({ error: "Ikke funnet" }, 404);
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) return result({ error: "Forventet JSON" }, 415);
      const text = await request.text();
      if (text.length > 6e3) return result({ error: "For stor foresp\xF8rsel" }, 413);
      const data = JSON.parse(text);
      const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return result({ error: "Ugyldig telefonn\xF8kkel" }, 401);
      const cap = await hash(token);
      if (path === "/subscribe") {
        if (!validSubscription(data.subscription)) return result({ error: "Ugyldig push-abonnement" }, 400);
        const id = await hash(data.subscription.endpoint);
        const existing = await env.DB.prepare("SELECT capability FROM subscribers WHERE id=?").bind(id).first();
        if (existing && existing.capability !== cap) return result({ error: "Telefonen er allerede registrert. Sl\xE5 av varsler og pr\xF8v igjen." }, 409);
        const insert = await env.DB.prepare("INSERT OR IGNORE INTO subscribers (id,subscription,capability,created) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM subscribers)<10").bind(id, JSON.stringify(data.subscription), cap, Date.now()).run();
        if (!existing && !insert.meta.changes) return result({ error: "Maksimalt antall telefoner er n\xE5dd" }, 409);
        return result({ ok: true, id });
      }
      if (typeof data.id !== "string") return result({ error: "Mangler telefon-ID" }, 400);
      const row = await env.DB.prepare("SELECT * FROM subscribers WHERE id=? AND capability=?").bind(data.id, cap).first();
      if (!row) return result({ error: "Telefonen er ikke registrert. Aktiver varsler p\xE5 nytt." }, 404);
      if (path === "/unsubscribe") {
        await env.DB.prepare("DELETE FROM subscribers WHERE id=? AND capability=?").bind(data.id, cap).run();
        return result({ ok: true });
      }
      const claim = await env.DB.prepare("UPDATE subscribers SET last_test=? WHERE id=? AND last_test < ?").bind(Date.now(), row.id, Date.now() - 6e4).run();
      if (!claim.meta.changes) return result({ error: "Vent ett minutt mellom testvarsler" }, 429);
      const res = await send(JSON.parse(row.subscription), keys, true);
      if (!res.ok) throw new Error(`Push-tjenesten svarte ${res.status}`);
      return result({ ok: true });
    } catch (e) {
      console.error("Geitevakt error", e.message);
      return result({ error: "Varslingstjenesten er ikke klar eller kunne ikke svare. Pr\xF8v igjen senere." }, 503);
    }
  }
};
export {
  checkVisits,
  worker_default as default,
  hasVisit,
  osloParts,
  validSubscription
};
