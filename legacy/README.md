# RoadAssist — Web

A responsive web port of the RoadAssist roadside-assistance app, covering all
three portals: **Customer**, **Mechanic**, and **Admin**.

Plain HTML, CSS and JavaScript. No framework, no build step, no `npm install`.
The site you open locally is byte-for-byte the site you deploy.

---

## Run it

**Double-click `index.html`.** That is the whole procedure.

It opens in demo mode: a full set of realistic seeded data (mechanics, vehicles,
service history, live requests, earnings, admin analytics) stored in your
browser's `localStorage`. Nothing is sent anywhere. Refreshes persist; a
different browser or machine starts fresh.

Sign in with any email and any password of 6+ characters, or use **Continue as
guest** to jump straight into a portal. The seeded accounts are:

| Portal   | Email                  |
|----------|------------------------|
| Customer | `zaid@roadassist.com`  |
| Mechanic | `alex@apextowing.com`  |
| Admin    | `ops@roadassist.com`   |

To wipe your changes and return to the seeded state, use **Settings → Reset demo
data**.

---

## Going live with Firebase

Demo mode is the default for a specific technical reason: Firebase
Authentication refuses to run on a `file://` page, so a real backend cannot
coexist with the "just double-click it" promise. Switching on Firebase means
serving the folder over `http(s)://`.

Everything below is a one-time setup. Total time is about ten minutes.

### 1. Create the Firebase project

In the [Firebase console](https://console.firebase.google.com), create a
project, then add a **Web app** to it (the `</>` icon). Firebase shows you a
config object that looks like the block in step 3.

### 2. Turn on the two sign-in methods

**Build → Authentication → Get started → Sign-in method**, then enable:

- **Email/Password** — used by the sign-up and sign-in forms.
- **Anonymous** — used by the "Continue as guest" buttons. If you skip this,
  guest access still works; it just falls back to a local-only session.

Then **Build → Firestore Database → Create database**. Start in production mode;
the rules in this folder replace the defaults in step 5.

### 3. Paste your keys into `assets/js/config.js`

That file is the only one you edit. Replace every `PASTE_…` placeholder with the
values from your web app config, and flip the backend switch:

```js
var BACKEND = 'firebase';          // was 'demo'

var FIREBASE = {
  apiKey:            'AIza…',
  authDomain:        'your-project.firebaseapp.com',
  projectId:         'your-project',
  storageBucket:     'your-project.appspot.com',
  messagingSenderId: '000000000000',
  appId:             '1:000000000000:web:abc123'
};
```

These keys are not secrets — Firebase web config is designed to ship in the
browser. Your data is protected by the security rules in step 5, not by hiding
these values.

### 4. Serve over http, not file

Pick whichever you already have:

```bash
python -m http.server 8000      # then open http://localhost:8000
npx serve .
firebase serve
```

Opening `index.html` directly while `BACKEND = 'firebase'` is set is handled
gracefully: the app logs the reason and runs in demo mode instead of breaking.

### 5. Deploy the rules, indexes and the site

Install the CLI once with `npm i -g firebase-tools`, then from this folder:

```bash
firebase login
firebase use --add                        # pick your project
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only hosting            # optional — publishes the site
```

Set your project ID in `.firebaserc` (it also contains a `PASTE_…`
placeholder), or let `firebase use --add` write it for you.

If you deploy to a custom domain, add it under **Authentication → Settings →
Authorized domains**, or sign-in will be rejected there.

### 6. Check it worked

Open the site and look at the browser console. You'll see either

```
[RoadAssist] Firebase backend active — project: your-project
```

or a specific reason it fell back, such as a missing SDK, an unfilled config, or
a `file://` origin. It never fails silently and never shows a blank page.

You can also force either backend without editing the file by appending
`?backend=firebase` or `?backend=demo` to the URL — useful for A/B checking a
deployment.

---

## What the backend actually does

Being precise here, because it's easy to overclaim:

**Real.** Account creation and sign-in via Firebase Authentication, including
anonymous guest sessions. Your whole app state persists to Cloud Firestore under
`appState/{uid}`, so signing in on another device or browser restores your
vehicles, requests and history. Open tabs sync live through `onSnapshot`. Every
request is also mirrored into a queryable `requests/{id}` collection stamped with
`ownerId`, which is what the security rules and composite indexes are built
around.

**Not wired up.** Cross-account dispatch. A request created by one customer
account will not appear in a different mechanic account's incoming queue, because
each account reads its own state document. The `requests` mirror and its indexes
exist precisely so that this is a next step rather than a rewrite.

**Roles are client-side.** The portal you land in is chosen in the browser, so a
determined user could claim any role. `firestore.rules` documents this openly and
includes the upgrade path — Firebase custom claims set from a trusted
environment, checked as `request.auth.token.role`. Do that before real money or
real customer data flows through this.

Writes are throttled (2.5s by default, coalesced, flushed on page hide) because
live tracking ticks the store about once a second; without throttling the map
animation alone would burn thousands of writes an hour.

---

## Layout

```
web/
├── index.html               entry point — loads everything in dependency order
├── assets/
│   ├── css/
│   │   ├── tokens.css       colours, spacing, radius, shadows, motion
│   │   ├── base.css         reset, typography, layout primitives
│   │   ├── components.css   buttons, cards, pills, modals, charts, skeletons
│   │   └── views.css        per-screen styling
│   └── js/
│       ├── config.js        ★ the only file you edit to go live
│       ├── icons.js         inline SVG icon set
│       ├── util.js          formatting, geo, validators, DOM helpers
│       ├── seed.js          the demo dataset
│       ├── store.js         state tree, actions, persistence
│       ├── adapter-firebase.js   Firebase Auth + Firestore adapter
│       ├── backend.js       picks an adapter, falls back safely
│       ├── ui.js            reusable widgets and CSS/SVG charts
│       ├── map.js           Leaflet tracking map
│       ├── chrome.js        header, nav, shell
│       ├── views-*.js       screens: public, auth, customer, mechanic, admin
│       ├── router.js        hash router + role guards
│       └── app.js           boot sequence
├── firestore.rules          owner-scoped security rules — deploy these
├── firestore.indexes.json   composite indexes for the requests collection
├── storage.rules            locked-down bucket, ready if you add uploads
├── firebase.json            hosting + rules wiring for `firebase deploy`
└── .firebaserc              your project id
```

Swapping in a different backend means writing one object with `initial`, `load`,
`save`, `clear`, `signIn`, `signUp` and `signOut`, then registering it in
`backend.js`. No view code changes — that's what `adapter-firebase.js` does, and
it's the template to copy for a REST API.

---

## Notes

Chrome, Firefox, Edge and Safari, current versions. Layout is fluid from 320px
phones to widescreen, with the nav collapsing to a bottom bar on small screens.

Map tiles (OpenStreetMap), the Inter font and the Firebase SDK load from CDNs, so
the map and web fonts need a connection. Everything else runs offline.
