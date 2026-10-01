/*
 * THE ENCRYPTION THAT MAKES A PHONE BUZZ, TAKEN BACK APART.
 *
 * worker/ut-turf-push.js encrypts every notification before sending it, the
 * way the web push standard requires (RFC 8291, sitting on RFC 8188). That
 * code has a property almost nothing else in this farm's software has: when it
 * is wrong, NOTHING SAYS SO. The push service accepts the message, the phone's
 * browser quietly throws it away because it cannot unwrap it, and there is no
 * error on the phone, none in the worker, and none in Cloudflare's log. The
 * only symptom is that nobody is ever told anything, which is also exactly
 * what it looks like when nobody has turned notifications on yet.
 *
 * So this file does what the phone does. It builds a pretend phone, has the
 * worker encrypt a message to it, and then UNWRAPS IT AGAIN -- with the steps
 * written out here independently, from the standard, rather than by calling
 * the worker's own helpers. If the two agree, the message a real phone gets
 * is one it can read.
 *
 * Run:  node tools/test-push-crypto.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { webcrypto, createPublicKey, createVerify } = require('crypto');
const subtle = webcrypto.subtle;

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

const enc = new TextEncoder();
const b64url = b => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => new Uint8Array(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
const cat = (...ps) => {
  const out = new Uint8Array(ps.reduce((n, p) => n + p.length, 0));
  let i = 0; ps.forEach(p => { out.set(p, i); i += p.length; });
  return out;
};

/* The worker is written as a module for Cloudflare; Node will only import it
   under a name it recognises as one, so it is copied next door and imported
   from there. Nothing is changed on the way -- the bytes under test are the
   bytes that get pasted into Cloudflare. */
async function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'ut-turf-push.js'), 'utf8');
  const tmp = path.join(os.tmpdir(), 'ut-turf-push-' + Date.now() + '.mjs');
  fs.writeFileSync(tmp, src);
  try { return await import('file://' + tmp); }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}

(async () => {
  const W = await loadWorker();

  /* ---------------------------------------------------------- a pretend phone
     Exactly what a browser hands the app when somebody says yes to
     notifications: a key pair it keeps, and a 16-byte shared secret. */
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
  const sub = { p256dh: b64url(uaPublic), auth: b64url(authSecret) };

  const MESSAGE = JSON.stringify({ k: 'eqdown', t: 'John Deere 7700A is out of service',
                                   b: 'Bill Czekai marked it down', u: '', g: 'eqdown:e3' });

  section('1. the message comes out shaped the way the standard says');
  const body = new Uint8Array(await W.encryptPayload(MESSAGE, sub.p256dh, sub.auth));
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);

  ok('it starts with a 16-byte salt', salt.length === 16);
  ok('a different message gets a DIFFERENT salt', await (async () => {
    const b2 = new Uint8Array(await W.encryptPayload(MESSAGE, sub.p256dh, sub.auth));
    return b64url(b2.slice(0, 16)) !== b64url(salt);
  })());
  ok('the record size is 4096', rs === 4096, String(rs));
  ok('the key length byte says 65', idlen === 65, String(idlen));
  ok('and that key is an uncompressed P-256 point', asPublic[0] === 0x04, String(asPublic[0]));
  ok('the sealed part is the message, its end-marker and a 16-byte tag',
     sealed.length === MESSAGE.length + 1 + 16, String(sealed.length));

  section('2. the pretend phone can actually unwrap it');
  /* Every step below is written out from the standard rather than borrowed
     from the worker, which is the entire point of this section. */
  const uaKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, ua.privateKey, 256));

  async function hk(saltB, ikm, info, len) {
    const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: saltB, info: info }, k, len * 8));
  }
  const keyInfo = cat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hk(authSecret, shared, keyInfo, 32);
  const cek = await hk(salt, ikm, cat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hk(salt, ikm, cat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  let plain = null, threw = null;
  try {
    const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const out = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, sealed));
    plain = out;
  } catch (e) { threw = e.message; }

  ok('it unwraps at all', !!plain, threw || '');
  if (plain) {
    ok('the last byte is the end-of-records marker', plain[plain.length - 1] === 2, String(plain[plain.length - 1]));
    const txt = new TextDecoder().decode(plain.slice(0, plain.length - 1));
    ok('and what comes out is exactly what went in', txt === MESSAGE, txt.slice(0, 80));
  }

  section('2b. THE PUBLISHED EXAMPLE, reproduced byte for byte');
  /* This is the section that actually proves a real phone can read what the
     farm sends. Everything above shows the code agrees with ITSELF, which it
     would also do if every step were wrong in the same way. The web push
     standard (RFC 8291, section 5 and appendix A) publishes a complete worked
     example: these keys, this salt, this message, that answer. Feed the same
     inputs in and the answer has to come out the same, because that is what
     every browser on every phone is going to check it against. */
  const RFC = {
    plaintext: 'When I grow up, I want to be a watermelon',
    auth:      'BTBZMqHH6r4Tts7J_aSIgg',
    uaPublic:  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    asPublic:  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    salt:      'DGv6ra1nlYgDCS1FRnbzlw',
    ikm:       'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
    cek:       'oIhVW04MRdy2XN9CiKLxTg',
    nonce:     '4h_95klXJ5E_qnoN',
    body:      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml'
             + 'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT'
             + 'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
  };

  /* The sender's key pair from the example, put back together the way
     WebCrypto wants it. */
  const asPub = unb64url(RFC.asPublic);
  const asKey = await subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: b64url(asPub.slice(1, 33)), y: b64url(asPub.slice(33, 65)),
    d: RFC.asPrivate, ext: true
  }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const asPubKey = await subtle.importKey('raw', asPub,
    { name: 'ECDH', namedCurve: 'P-256' }, true, []);

  const theirs = new Uint8Array(await W.encryptPayload(
    RFC.plaintext, RFC.uaPublic, RFC.auth,
    { keys: { privateKey: asKey, publicKey: asPubKey }, salt: unb64url(RFC.salt) }));

  ok('the whole message matches the published one, byte for byte',
     b64url(theirs) === RFC.body, b64url(theirs));

  /* If the line above ever fails, these say WHICH step went wrong rather than
     leaving somebody to stare at two walls of base64. They are computed with
     the worker's own helpers on purpose. */
  const rfcShared = new Uint8Array(await subtle.deriveBits(
    { name: 'ECDH', public: await subtle.importKey('raw', unb64url(RFC.uaPublic),
        { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, asKey, 256));
  const rfcKeyInfo = W.join(enc.encode('WebPush: info'), new Uint8Array([0]),
                            unb64url(RFC.uaPublic), asPub);
  const rfcIkm = await W.hkdf(unb64url(RFC.auth), rfcShared, rfcKeyInfo, 32);
  ok('step 1 of 3: the keying material matches the standard',
     b64url(rfcIkm) === RFC.ikm, b64url(rfcIkm));
  const rfcCek = await W.hkdf(unb64url(RFC.salt), rfcIkm, W.infoBytes('Content-Encoding: aes128gcm'), 16);
  ok('step 2 of 3: the encryption key matches', b64url(rfcCek) === RFC.cek, b64url(rfcCek));
  const rfcNonce = await W.hkdf(unb64url(RFC.salt), rfcIkm, W.infoBytes('Content-Encoding: nonce'), 12);
  ok('step 3 of 3: the nonce matches', b64url(rfcNonce) === RFC.nonce, b64url(rfcNonce));

  section('3. a phone that is not the one addressed cannot read it');
  const other = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const otherShared = new Uint8Array(await subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, other.privateKey, 256));
  const otherIkm = await hk(authSecret, otherShared, keyInfo, 32);
  const otherCek = await hk(salt, otherIkm, cat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  let leaked = false;
  try {
    const aes = await subtle.importKey('raw', otherCek, 'AES-GCM', false, ['decrypt']);
    await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, sealed);
    leaked = true;
  } catch (e) {}
  ok('the wrong key gets nothing', !leaked);

  section('4. the note proving the farm sent it');
  const KEYS = {
    VAPID_PUBLIC: 'BPGRXZfxzVaSANez5Xwe-60HRAMK7GHpnR_KLEox94gIwTN6e5qXVFYJbz2-zIfXLL-_AeHTXSEi4VRI8siWudU',
    VAPID_PRIVATE: 'iBqDdtYgMB6ZCWPuhiiOEiHglGCVXUpfXf8SDR4iPrE',
    VAPID_SUBJECT: 'mailto:turffarm@utk.edu'
  };
  /* Throwaway keys made by tools/make-push-keys.js for this test alone. The
     farm's real pair is typed into Cloudflare and exists nowhere in this repo,
     which is why this is safe to read and safe to commit. */
  const header = await W.vapidHeader('https://fcm.googleapis.com/fcm/send/abc123', KEYS);
  ok('it is a vapid header', /^vapid t=/.test(header), header.slice(0, 20));
  ok('and it carries the public key the phone was given',
     header.indexOf('k=' + KEYS.VAPID_PUBLIC) > 0);

  const jwt = header.replace(/^vapid t=/, '').split(',')[0].trim();
  const [h64, c64, s64] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c64.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  ok('it is addressed to the push service, not to us',
     claims.aud === 'https://fcm.googleapis.com', claims.aud);
  ok('it expires, and within the 24 hours the services allow',
     claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400, String(claims.exp));
  ok('it says who to shout at if it misbehaves', /^mailto:/.test(claims.sub || ''), claims.sub);

  /* THE SIGNATURE ITSELF, checked against the public half -- the one thing
     that proves the private half was really used and really matches. */
  const pubBytes = unb64url(KEYS.VAPID_PUBLIC);
  const pubKey = await subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: b64url(pubBytes.slice(1, 33)), y: b64url(pubBytes.slice(33, 65)), ext: true
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const good = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey,
    unb64url(s64), enc.encode(h64 + '.' + c64));
  ok('the signature checks out against the public key', good);

  const tampered = enc.encode(h64 + '.' + c64 + 'x');
  const bad = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, unb64url(s64), tampered);
  ok('and a changed message does not', !bad);

  section('5. the sender holds no farm records, and says so in its own source');
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'ut-turf-push.js'), 'utf8');
  /* If somebody ever teaches this worker to read the farm's database, these
     fail -- and that is a decision that should be argued about rather than
     slipped in, because it would put the farm's records on a second service
     and give a stranger's bug a second way to reach them. */
  ok('it never talks to Firestore', !/firestore/i.test(src));
  /* Not "the words do not appear" -- the worker legitimately fetches Google's
     PUBLIC keys from a URL with service_accounts in the path. What must never
     be in here is a CREDENTIAL: a PEM block, or the fields a downloaded Google
     service-account file carries. */
  ok('it never holds a credential of any kind',
     !/-----BEGIN|"private_key"|client_email/.test(src));
  ok('the Google address it does use is the public-keys one',
     /service_accounts\/v1\/jwk\//.test(src));
  ok('the only thing it stores is where to reach a phone',
     (src.match(/SUBS\.put\(/g) || []).length === 2, String((src.match(/SUBS\.put\(/g) || []).length));
  ok('and it refuses anybody who is not signed in to this farm',
     /whoIsCalling\(req, env\)/.test(src) && /401/.test(src));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('threw: ' + (e && e.stack || e)); process.exit(1); });
