/*
 * Makes the one pair of keys the notification sender needs.
 *
 *   node tools/make-push-keys.js
 *
 * It prints two lines. The PUBLIC one is not a secret -- it ends up in the app
 * where anybody can read it, and that is fine and by design. The PRIVATE one
 * is typed into Cloudflare once and then never again; it must never be
 * committed to this repo, pasted into a chat, or written in a document.
 *
 * You only ever need to run this again if the private half leaks. Doing so
 * means every phone has to be re-registered, so do not run it for tidiness.
 */
const { webcrypto } = require('crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

(async () => {
  const kp = await webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey);

  console.log('');
  console.log('VAPID_PUBLIC   ' + b64url(pub));
  console.log('VAPID_PRIVATE  ' + jwk.d);
  console.log('');
  console.log('Put BOTH into Cloudflare as secrets, exactly as printed.');
  console.log('Keep the private one out of this folder and out of git.');
})();
