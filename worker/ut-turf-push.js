/*
 * ut-turf-push — the thing that makes a phone buzz when the app is shut.
 * =====================================================================
 *
 * WHAT THIS IS, in one paragraph. The app works out its own alerts on each
 * phone and shows them on the bell. That only works while somebody has the app
 * open. A phone in a pocket with the app closed can only be reached by an
 * outside machine sending it a message, and a phone cannot do that to another
 * phone. This file is that outside machine. It runs on Cloudflare's free
 * plan, which needs no card on anybody's account -- the whole reason it exists
 * rather than the Firebase version, which would have needed one.
 *
 * WHY IT IS ONE FILE WITH NO IMPORTS AND NO BUILD STEP. Because somebody who
 * is not a programmer has to be able to replace it in 2030. The way you deploy
 * this is: open Cloudflare in a browser, paste the whole file into the editor,
 * press Save. No command line, no npm, nothing to install, nothing to keep up
 * to date. docs/SET-UP-NOTIFICATIONS.md is the walk-through.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   It does not decide who should hear anything. The phone that noticed the
 *   event works that out and sends the list of people with it, because the
 *   rules about who hears what are farm policy and they live in the app, in
 *   one place. A copy of them in here would drift from the app the first time
 *   somebody changed one -- which is the shape of the bug that cost this farm
 *   a month in September (see CLAUDE.md, the third trap).
 *
 *   It does not decide whether a person actually wants that alert -- but it
 *   does CHECK, and the difference matters. Each phone uploads its owner's own
 *   switches, as a plain list of names they left on or turned off, and the
 *   message says which switch governs it. So this file looks up a yes or no
 *   it was handed; it has never heard of "somebody clocks in" and does not
 *   need to.
 *
 *   That check has to happen HERE rather than on the phone, and the reason is
 *   a browser quirk worth writing down: if a phone receives a message and then
 *   decides not to show anything, Chrome shows its own "this site was updated
 *   in the background" notice instead. Filtering on the phone would therefore
 *   turn every muted alert into a mystery notification nobody can turn off.
 *   So a message a person does not want is never sent to them at all.
 *
 *   It does not hold any farm records. The only thing it stores is "this
 *   phone can be reached at this address" -- no names beyond a person id, no
 *   tasks, no chemicals, no timesheets. If this whole service disappeared
 *   tomorrow the farm would lose buzzing, and nothing else.
 *
 * WHAT IT NEEDS SET UP AROUND IT (all in the Cloudflare dashboard):
 *   a KV namespace bound as  SUBS
 *   secrets  VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, FB_PROJECT
 *   a cron trigger of  *\/5 * * * *  (every five minutes)
 *
 * THE CRON TRIGGER is what makes the clock-driven alerts possible at all, and
 * it is worth understanding why they need anything new. Everything else here
 * is set off by somebody tapping something: a phone notices, and asks this
 * worker to tell the others. But "45 minutes before a shift", "9am on the day
 * the pay period ends" and "30 minutes after a shift started" are set off by
 * the CLOCK, and at those moments every phone on the farm may be asleep with
 * nobody to notice anything.
 *
 * So a phone works the message out IN ADVANCE -- it knows the schedule days
 * ahead -- and hands it over with a time on it. This worker holds it and sends
 * it when the time comes. A phone can also take it back: if Bill fills in the
 * task board, the reason for the reminder has gone, and whichever phone sees
 * that cancels it.
 */

const VERSION = '3';

/* Who is allowed to call this. The app is served from GitHub Pages; localhost
   is here so a copy of the app on a laptop can be tested against it without
   deploying a second worker. Anything else gets no CORS headers and so cannot
   call from a browser at all. */
const ALLOW = [
  'https://turffarmutk.github.io',
  'http://localhost:8891', 'http://localhost:8914', 'http://localhost:8915'
];

/* How long one event is remembered, so the same thing is not sent twice.
   TWENTY-FOUR HOURS, and that length is deliberate: the events with nobody
   behind them -- ground closing because the date rolled over -- are noticed
   independently by every phone that opens the app that day, and all of them
   try to send it. The first one through wins and the rest are ignored here. */
const SEEN_TTL = 86400;

/* ===================== small helpers ===================== */
const enc = new TextEncoder();

function b64urlToBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(b) {
  const a = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function join(...parts) {
  let n = 0;
  parts.forEach(p => { n += p.length; });
  const out = new Uint8Array(n);
  let i = 0;
  parts.forEach(p => { out.set(p, i); i += p.length; });
  return out;
}
/* "Content-Encoding: aes128gcm" and friends are all <label>\0 */
function infoBytes(label) { return join(enc.encode(label), new Uint8Array([0])); }

async function sha256Hex(txt) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(txt));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* HKDF, the one key-stretching step everything below is built out of. */
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: info }, key, len * 8);
  return new Uint8Array(bits);
}

/* ===================== the push message itself =====================
   RFC 8291 (how a push payload is encrypted) sitting on RFC 8188 (how the
   bytes are laid out). Written out the long way, step by step, because this
   is the one part of the farm's software that CANNOT be debugged by looking
   at it: get a step wrong and the phone's browser silently drops the message
   with no error anywhere -- not on the phone, not here, not in Cloudflare's
   log. tools/test-push-crypto.js takes it apart again and checks every step,
   which is the only reason anybody can be confident in it. */
/* `fixed` is for ONE caller and it is not this worker. The web push standard
   publishes a worked example -- known keys, known salt, known answer -- and
   tools/test-push-crypto.js feeds those exact values in here and checks that
   what comes out matches the published answer byte for byte. That is the only
   way to know a real browser can read these messages, because a browser that
   cannot simply drops them in silence. Nothing in the worker below ever passes
   it, so every real message gets a fresh random key and salt. */
async function encryptPayload(plaintext, p256dhB64, authB64, fixed) {
  const uaPublic = b64urlToBytes(p256dhB64);     /* the phone's public key, 65 bytes */
  const authSecret = b64urlToBytes(authB64);     /* and its shared secret, 16 bytes  */

  /* A throwaway key pair for THIS message. New every time on purpose: reusing
     one would let anybody who ever saw the private half read every message
     this worker has sent since. */
  const kp = (fixed && fixed.keys) || await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic,
                                              { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, kp.privateKey, 256));

  /* The two sides now share a secret. Everything from here is turning that
     into one key and one nonce, exactly the way the phone will. */
  const keyInfo = join(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = (fixed && fixed.salt) || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, infoBytes('Content-Encoding: aes128gcm'), 16);
  const nonce = await hkdf(salt, ikm, infoBytes('Content-Encoding: nonce'), 12);

  /* One record, so it carries the 0x02 "this is the last one" marker. */
  const body = join(enc.encode(plaintext), new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aes, body));

  /* salt(16) | record size(4) | key length(1) | our public key(65) | sealed */
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return join(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

/* The note that says "this really is the farm's own sender" -- a short signed
   message the push service checks before it will carry anything. */
async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const head = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claim = bytesToB64url(enc.encode(JSON.stringify({
    aud: aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:turffarm@utk.edu'
  })));
  const signing = enc.encode(head + '.' + claim);

  /* The private half is stored as the raw 32-byte number the key generator
     printed; WebCrypto wants it alongside the public half, so it is put back
     together here rather than stored twice and risking the two disagreeing. */
  const pub = b64urlToBytes(env.VAPID_PUBLIC);
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE,
    ext: true
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, signing));
  return 'vapid t=' + head + '.' + claim + '.' + bytesToB64url(sig) + ', k=' + env.VAPID_PUBLIC;
}

/* Send one message to one phone. Returns the push service's status so the
   caller can throw away an address that no longer exists. */
async function pushOne(sub, text, env) {
  const body = await encryptPayload(text, sub.p256dh, sub.auth);
  const auth = await vapidHeader(sub.endpoint, env);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'normal'
    },
    body: body
  });
  return res.status;
}

/* ===================== who is allowed to ask =====================
   A valid sign-in for the farm's own Firebase project, and nothing else. The
   app's address is public -- anybody can read it off the website -- so the
   address of this worker is public too, and without this check a stranger
   could buzz twenty-three phones at three in the morning.

   It checks the token the same way Google's own libraries do: fetch Google's
   public keys, check the signature, check the token was issued for THIS farm's
   project and has not expired. No card, no account, no Firebase library. */
let _jwks = null, _jwksAt = 0;
async function googleKeys() {
  if (_jwks && (Date.now() - _jwksAt) < 3600000) return _jwks;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('could not fetch Google keys');
  _jwks = await r.json(); _jwksAt = Date.now();
  return _jwks;
}
async function whoIsCalling(req, env) {
  const h = req.headers.get('Authorization') || '';
  const tok = h.replace(/^Bearer /, '');
  const bits = tok.split('.');
  if (bits.length !== 3) return null;

  let head, claims;
  try {
    head = JSON.parse(new TextDecoder().decode(b64urlToBytes(bits[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(bits[1])));
  } catch (e) { return null; }

  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) return null;
  if (claims.aud !== env.FB_PROJECT) return null;
  if (claims.iss !== 'https://securetoken.google.com/' + env.FB_PROJECT) return null;

  const jwks = await googleKeys();
  const jwk = (jwks.keys || []).filter(k => k.kid === head.kid)[0];
  if (!jwk) return null;

  const key = await crypto.subtle.importKey('jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
    b64urlToBytes(bits[2]), enc.encode(bits[0] + '.' + bits[1]));
  if (!ok) return null;
  return claims.sub || null;                     /* the Firebase account id */
}

/* ===================== messages held for later =====================
   Stored under a key that begins with the time they are due, because KV hands
   keys back in alphabetical order -- so "everything due by now" is simply
   everything up to a certain prefix, with no index to keep and nothing to
   search. The id is on the end so a message can be taken back by name.

   They are kept for a day past their time and then dropped. A reminder nobody
   sent on the morning it was for is not worth sending in the afternoon, and a
   phone that was off for a week must not come back to a pile of them. */
const LATER_GRACE = 3600000;             /* an hour late is still worth sending */
const LATER_MAX_AHEAD = 30 * 86400000;   /* nothing may be booked further out */

function laterKey(whenMs, id) {
  return 'later:' + new Date(whenMs).toISOString() + ':' + id;
}
/* Everything whose time has come, oldest first. */
async function laterDue(env, nowMs) {
  const out = [];
  const list = await env.SUBS.list({ prefix: 'later:' });
  for (const k of list.keys) {
    const stamp = k.name.slice(6, 30);     /* the ISO time sits right after "later:" */
    const due = Date.parse(stamp);
    if (!isFinite(due) || due > nowMs) continue;
    const msg = await env.SUBS.get(k.name, 'json');
    /* Too late to be useful, or unreadable: drop it rather than send it. */
    if (!msg || (nowMs - due) > LATER_GRACE) { await env.SUBS.delete(k.name); continue; }
    out.push({ key: k.name, msg: msg });
  }
  return out;
}

/* ===================== does this person want it =====================
   Two questions, both answered from what that person's own phone uploaded.
   Neither is a decision this file makes: the first is a switch they set, the
   second is a window they chose. If a phone has never uploaded anything, the
   answer is yes to everything -- somebody who went to the trouble of turning
   notifications on should hear things, not be silenced by a missing record. */
function wantsIt(sub, msg) {
  const p = sub.prefs;
  if (!p) return true;

  /* The switch this alert answers to. The phone says which one; this file
     never needs to know what alerts exist. */
  const name = msg.sw || msg.kind;
  if (name && p.alerts && p.alerts['a_' + name] === false) return false;

  /* Delivery hours. The phone also uploads which part of the world it is in,
     because this worker runs in UTC and "nine at night" is a local idea. */
  if (p.quiet && p.start && p.end) {
    let hhmm;
    try {
      hhmm = new Date().toLocaleTimeString('en-GB',
        { timeZone: p.tz || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) { return true; }         /* an unknown timezone must not silence anybody */
    const now = hhmm.slice(0, 5);
    /* A window that runs past midnight (22:00 to 06:00) is the other way
       round, and reads as "outside the gap" rather than "inside the range". */
    const inside = (p.start <= p.end) ? (now >= p.start && now <= p.end)
                                      : (now >= p.start || now <= p.end);
    if (!inside) return false;
  }
  return true;
}

/* ===================== the worker ===================== */
function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
              'Access-Control-Allow-Headers': 'Authorization,Content-Type' };
  if (ALLOW.indexOf(o) >= 0) h['Access-Control-Allow-Origin'] = o;
  return h;
}
function reply(req, status, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body),
    { status: status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(req)) });
}

async function subsFor(pids, env) {
  const out = [];
  for (const pid of pids) {
    const list = await env.SUBS.list({ prefix: 'sub:' + pid + ':' });
    for (const k of list.keys) {
      const v = await env.SUBS.get(k.name, 'json');
      if (v && v.endpoint) out.push(Object.assign({ _key: k.name }, v));
    }
  }
  return out;
}

/* Send one piece of news to everybody it is addressed to. Used by /tell, which
   is a phone saying "this just happened", and by the cron below, which is a
   message whose time has come -- one routine for both, because two would
   eventually disagree about something like whether muting is checked. */
async function fanOut(msg, env) {
  const text = JSON.stringify({
    k: String(msg.kind || ''), t: String(msg.title || '').slice(0, 120),
    b: String(msg.body || '').slice(0, 200), u: String(msg.url || ''),
    g: String(msg.tag || msg.id || '')
  });
  const subs = await subsFor((msg.to || []).slice(0, 60), env);
  let sent = 0, dropped = 0, muted = 0;
  for (const s of subs) {
    /* Not wanted is not a failure: it is the person's own setting doing
       exactly what they asked it to. */
    if (!wantsIt(s, { sw: msg.sw, kind: msg.kind })) { muted++; continue; }
    let st = 0;
    try { st = await pushOne(s, text, env); } catch (e) { st = 0; }
    if (st >= 200 && st < 300) sent++;
    /* The push service says this address is dead. Nothing else will ever clean
       these up, and a phone that was wiped or reinstalled leaves one behind
       every time. */
    else if (st === 404 || st === 410) { await env.SUBS.delete(s._key); dropped++; }
  }
  return { sent: sent, dropped: dropped, muted: muted, phones: subs.length };
}

export default {
  /* THE CLOCK. Cloudflare calls this on the schedule set in the dashboard, and
     it is the only thing here that runs with every phone on the farm asleep.
     It sends what is due and nothing else -- it never decides anything, never
     reads the farm's records, and cannot invent a message. */
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const due = await laterDue(env, now);
    for (const d of due) {
      try { await fanOut(d.msg, env); } catch (e) {}
      /* Deleted whatever happened. A message that failed to send is not worth
         trying again at the wrong time, and leaving it would send it on every
         tick for an hour. */
      await env.SUBS.delete(d.key);
    }
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

    /* Is it alive, and is it set up. Deliberately says what is MISSING rather
       than just failing, because the person reading this will be following a
       written sheet and needs to know which step did not take. */
    if (url.pathname === '/health') {
      const miss = ['VAPID_PUBLIC', 'VAPID_PRIVATE', 'FB_PROJECT'].filter(k => !env[k]);
      if (!env.SUBS) miss.push('SUBS (the KV namespace)');
      return reply(req, 200, { ok: miss.length === 0, version: VERSION, missing: miss });
    }

    /* The public half of the sending key. Served rather than written into the
       app so the key can be replaced without pushing a new app to the farm. */
    if (url.pathname === '/key') return reply(req, 200, { key: env.VAPID_PUBLIC || '' });

    const pid = await whoIsCalling(req, env);
    if (!pid) return reply(req, 401, { error: 'not signed in to the farm' });

    /* This phone can be reached here. One record per device, so somebody with
       a phone and an iPad gets both. */
    if (url.pathname === '/subscribe' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      const s = b && b.sub;
      if (!s || !s.endpoint || !s.keys) return reply(req, 400, { error: 'no subscription' });
      const id = (await sha256Hex(s.endpoint)).slice(0, 16);
      await env.SUBS.put('sub:' + (b.pid || pid) + ':' + id, JSON.stringify({
        endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
        pid: b.pid || pid, at: Date.now(), prefs: b.prefs || null
      }));
      return reply(req, 200, { ok: true, id: id });
    }

    /* Somebody changed a switch, or their delivery hours. Sent on its own so
       changing a setting does not mean asking the browser to subscribe again,
       which it would make the person approve a second time. */
    if (url.pathname === '/prefs' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !b.endpoint) return reply(req, 400, { error: 'no endpoint' });
      const id = (await sha256Hex(b.endpoint)).slice(0, 16);
      const key = 'sub:' + (b.pid || pid) + ':' + id;
      const had = await env.SUBS.get(key, 'json');
      if (!had) return reply(req, 404, { error: 'this phone is not registered' });
      had.prefs = b.prefs || null;
      await env.SUBS.put(key, JSON.stringify(had));
      return reply(req, 200, { ok: true });
    }

    /* This phone no longer wants them, or is being handed to somebody else. */
    if (url.pathname === '/forget' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !b.endpoint) return reply(req, 400, { error: 'no endpoint' });
      const id = (await sha256Hex(b.endpoint)).slice(0, 16);
      const list = await env.SUBS.list({ prefix: 'sub:' });
      let gone = 0;
      for (const k of list.keys) {
        if (k.name.endsWith(':' + id)) { await env.SUBS.delete(k.name); gone++; }
      }
      return reply(req, 200, { ok: true, removed: gone });
    }

    /* Tell these people this AT A SET TIME. The phone works the message out in
       advance, because at the moment it is due there may be nobody awake to
       work anything out. */
    if (url.pathname === '/later' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !b.id || !Array.isArray(b.to) || !b.title) return reply(req, 400, { error: 'bad message' });
      const when = Date.parse(b.at || '');
      if (!isFinite(when)) return reply(req, 400, { error: 'no time on it' });
      if (when - Date.now() > LATER_MAX_AHEAD) return reply(req, 400, { error: 'too far ahead' });

      /* Booked twice by two phones is one booking: the key is built from the
         time and the id, both of which every phone works out the same way. */
      await env.SUBS.put(laterKey(when, b.id), JSON.stringify({
        id: b.id, to: b.to, kind: b.kind || '', sw: b.sw || '',
        title: b.title, body: b.body || '', url: b.url || '', tag: b.tag || b.id
      }), { expirationTtl: Math.max(60, Math.floor((when - Date.now() + LATER_GRACE * 2) / 1000)) });
      return reply(req, 200, { ok: true, at: new Date(when).toISOString() });
    }

    /* Take one back. The reason for a reminder can go away before its time --
       Bill fills the task board in, the student clocks in -- and whichever
       phone notices that says so. */
    if (url.pathname === '/cancel' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !b.id) return reply(req, 400, { error: 'no id' });
      const list = await env.SUBS.list({ prefix: 'later:' });
      let gone = 0;
      for (const k of list.keys) {
        if (k.name.endsWith(':' + b.id)) { await env.SUBS.delete(k.name); gone++; }
      }
      return reply(req, 200, { ok: true, cancelled: gone });
    }

    /* What is booked, so a person can be shown it and a test can check it. */
    if (url.pathname === '/pending' && req.method === 'GET') {
      const list = await env.SUBS.list({ prefix: 'later:' });
      return reply(req, 200, { ok: true, count: list.keys.length,
        items: list.keys.slice(0, 50).map(k => ({ at: k.name.slice(6, 30),
                                                  id: k.name.slice(31) })) });
    }

    /* Tell these people this. */
    if (url.pathname === '/tell' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !b.id || !Array.isArray(b.to) || !b.title) return reply(req, 400, { error: 'bad message' });

      /* Said once, however many phones noticed it. */
      const seen = 'seen:' + b.id;
      if (await env.SUBS.get(seen)) return reply(req, 200, { ok: true, already: true });
      await env.SUBS.put(seen, '1', { expirationTtl: SEEN_TTL });

      const text = JSON.stringify({
        k: String(b.kind || ''), t: String(b.title).slice(0, 120),
        b: String(b.body || '').slice(0, 200), u: String(b.url || ''),
        g: String(b.tag || b.id)
      });

      const r = await fanOut(b, env);
      return reply(req, 200, Object.assign({ ok: true }, r));
    }

    return reply(req, 404, { error: 'no such thing here' });
  }
};

/* Cloudflare only ever looks at the default above. These are named as well so
   tools/test-push-crypto.js can take the encryption apart and check each step
   against the specification -- the alternative being to find out it was wrong
   when twenty-three phones quietly never buzz. */
export { encryptPayload, vapidHeader, b64urlToBytes, bytesToB64url, hkdf, infoBytes, join,
         wantsIt, laterKey, laterDue, LATER_GRACE };
