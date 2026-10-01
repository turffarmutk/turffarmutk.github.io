# Setting up the thing that makes phones buzz

Written 2026-10-01. This is a **twenty-minute job you do once, at a computer.**
Nothing here requires you to understand the file you are pasting, and nothing
here asks for a card.

---

## What this is, in one paragraph

The app already works out its own alerts and shows them on the bell. That only
works while somebody has the app open. A phone sitting in a pocket with the app
closed can only be reached by a machine somewhere else sending it a message —
and one phone cannot do that to another phone. So something has to sit outside
the farm and do the sending. That something is a small program called a
**Worker**, it runs on Cloudflare's free plan, and the whole reason we chose it
over the Firebase version is that **it never asks for a payment method.**

It holds one thing and one thing only: a list of "this phone can be reached at
this address". No tasks, no chemicals, no timesheets, no names beyond a person
id. If it vanished tomorrow the farm would lose buzzing and nothing else.

---

## Before you start

- **The account should be the farm's, not yours.** Use the same farm address
  that holds the website and the database, so whoever is running things in 2030
  can get into it without tracking you down. This was your call on 2026-10-01
  and it is the right one.
- You will need the project folder open, same as when you publish the rules.
- Have about twenty minutes. Steps 5 and 6 are typing two long lines carefully.

---

## The steps

**1. Make the account.** Go to **dash.cloudflare.com**, choose Sign Up, and use
the farm address. It will email you a link to confirm. It does not ask for a
card for what we are doing. *If it ever does ask for one, stop and tell me —
that would mean something has changed and we should talk before going further.*

**2. Make the Worker.** In the left-hand menu find **Workers & Pages**, then
**Create**. Choose to start from **Hello World** (the plainest option) and give
it the name `ut-turf-push`. Press Deploy. It will now show you a web address
ending in `.workers.dev` — **write that address down, you need it at the end.**

**3. Paste in the real program.** On the Worker's page, choose **Edit code**
(you may have to look under a "..." or a Settings tab for it). You will see the
Hello World example. Click inside, select everything, delete it. Then open
`worker/ut-turf-push.js` from the project folder in any text editor, select all,
copy, and paste it in. Press **Deploy**. You are not losing anything — the Hello
World example is a sample that does nothing.

**4. Give it somewhere to keep the list of phones.** In the left-hand menu find
**Storage & Databases**, then **KV**, then create a namespace called
`ut-turf-subs`. Then go back to your Worker → **Settings** → **Bindings** (older
versions say "Variables"), add a **KV namespace binding**, and set:

- the **Variable name** to exactly `SUBS` — capital letters, no spaces
- the namespace to the `ut-turf-subs` you just made

The name `SUBS` is not a label, it is how the program finds it. Spell it exactly.

**5. Make the sending keys.** On your laptop, in the project folder, run:

```bash
node tools/make-push-keys.js
```

It prints two lines, `VAPID_PUBLIC` and `VAPID_PRIVATE`. The public one is not a
secret and ends up in the app where anyone can read it — that is by design. **The
private one is a secret.** Do not commit it, do not paste it into a chat, do not
save it in a document. Type it into Cloudflare once (next step) and then close
the window.

**6. Put the four settings into Cloudflare.** Worker → **Settings** →
**Variables and Secrets**. Add each of these as a **Secret** (not a plain
variable — a secret is hidden once saved):

| Name | What to put |
|---|---|
| `VAPID_PUBLIC` | the long public line from step 5 |
| `VAPID_PRIVATE` | the shorter private line from step 5 |
| `VAPID_SUBJECT` | `mailto:` and your farm email, e.g. `mailto:turffarm@utk.edu` |
| `FB_PROJECT` | `utk-turf-farm-app` — the Firebase project name you already use |

Spell the names exactly as written. Press Deploy when it offers.

**7. Check it.** In a browser, go to your worker address with `/health` on the
end:

```
https://ut-turf-push.<your-account>.workers.dev/health
```

You want to see `"ok":true`. If you see a list under `"missing"`, it is telling
you which of steps 4–6 did not take. Nothing is broken; go back and do that one.

**8. Tell me the address.** The app needs to know where to send things, and that
is a one-line change to the app that I make and push. Until that happens the
Worker sits there doing nothing, costing nothing, which is a perfectly safe
place for it to sit.

---

## What it costs

Nothing, and here is the arithmetic rather than a promise. Cloudflare's free
plan allows **100,000 requests a day**. A busy farm day is a few hundred. The
storage allows **1,000 writes a day**; registering a phone is one write and
happens once per phone, ever.

There is no payment method on the account, so there is nothing that *can* be
charged — the same protection the Firebase free plan gives you. If the farm ever
somehow went past the free allowance, Cloudflare stops answering until the next
day. The app keeps working; the buzzing pauses.

---

## If you ever want to turn it off

Delete the Worker, or just delete the `SUBS` binding. Phones stop being told.
The bell inside the app carries on exactly as it does today, because that has
never depended on any of this.

---

## For whoever is doing this in 2030

The program in `worker/ut-turf-push.js` is deliberately **one file with no
imports and no build step**, so it can be replaced by pasting a new version into
that same web editor. There is nothing to install and no tool to keep up to
date. The encryption it does is checked against the published standard's own
worked example by `tools/test-push-crypto.js`, which runs as part of `npm test`
— if that passes, the messages it sends are ones a phone can read.
