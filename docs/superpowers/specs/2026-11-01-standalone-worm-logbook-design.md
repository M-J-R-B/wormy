# Standalone Worm Bin Logbook — Design

Date: 2026-11-01
Status: Approved in brainstorming, pending spec review

## Goal

Turn the Worm Bin Logbook claude.ai artifact (`https://claude.ai/artifact/8Qaws6kpdxqzDfpA4UzJA8`) into a standalone app that runs on the user's iPhone without claude.ai, syncs across the user's devices, and keeps working with no signal.

## Requirements

- Installs on iPhone from Safari via **Add to Home Screen**; opens full-screen with its own name and icon.
- One user (the owner). No sign-up in the app.
- Data syncs across devices (phone, computer).
- Works offline: logging with no connection saves locally and syncs when back online. The app itself opens with no connection after the first load.
- Same features and behaviour as the artifact (home, log, batches, history, settings tabs; readiness rule; alerts; avatars; temperature chart; JSON copy).
- Starts with empty data. No import from the artifact.

## Out of scope

Push notifications, multiple users or sharing, data import, Android-specific polish, native App Store app.

## Approach

Progressive Web App built with Vite, data in Firebase (Firestore + Auth), hosted on Firebase Hosting.

Rejected:
- **Supabase/Postgres:** no built-in browser offline sync; would need a hand-written sync queue or an extra sync service. The data is small, document-shaped and needs no joins.
- **Native iOS (React Native/Expo):** needs a $99/year Apple Developer account (or reinstalling every 7 days) and a full UI rewrite.
- **GitHub Pages hosting:** a free plan needs a public repo; Firebase Hosting uses the same account and keeps the repo local.

## Architecture

Static site, no server code. Source in `D:\worm-farm-tracker`, local git.

| File | Responsibility | Depends on |
|---|---|---|
| `src/domain.js` | Pure logic moved from the artifact: date helpers (`dayKey`, `daysBetween`, `ago`, …), `batchReadings`, `lastStir`, `lastSmell`, `binTempOnDay`, `readiness`, `alerts`, `bName`/`bShort`. Functions take the state `S` (and `now` where time matters) as arguments instead of reading globals. | nothing |
| `src/store.js` | The only Firebase data access. Exposes `put(coll, id, obj)`, `del(coll, id)` and `subscribe(uid, {onData, onLoaded, onSlow, onError})`. Online/offline status comes from the browser's `online`/`offline` events in `main.js`. | Firebase Firestore |
| `src/auth.js` | `signIn(email, password)`, `signOut()`, `onUser(cb)`. | Firebase Auth |
| `src/firebase.js` | Initialises the Firebase app from `firebase-config.js`, with Firestore's persistent local cache (multi-tab) and Auth with IndexedDB persistence. | Firebase SDK |
| `src/firebase-config.js` | The project's public web config object. | — |
| `src/ui.js` | Rendering, tabs, sheets, forms and event handlers moved from the artifact. Uses `domain.js` for logic and `store.js` for writes. Adds a sign-in screen and a Sign out button in Settings. | domain, store, auth |
| `src/main.js` | Entry point: watches auth state; shows sign-in when signed out, otherwise subscribes to the user's data and renders. | all |
| `src/styles.css` | CSS moved from the artifact unchanged. | — |
| `index.html` | Shell, viewport/safe-area meta, `apple-touch-icon`, `apple-mobile-web-app-capable`, theme colour. | — |
| `public/icons/` | 180px apple-touch-icon, 192px and 512px PWA icons (worm emoji on the bin green). | — |
| `vite.config.js` | Vite + `vite-plugin-pwa` (manifest, generated service worker precaching the built app). | — |
| `firestore.rules`, `firebase.json`, `.firebaserc` | Security rules and hosting config. | — |

Removed from the artifact: all `window.claude` code, the local-only (`localStorage`) mode and its banner. Kept: **Copy all data (JSON)** as a manual backup.

Fonts: Fraunces and Inter are bundled locally (via `@fontsource`) so the app looks the same offline.

## Data model

Firestore paths, all under the signed-in user's ID:

- `users/{uid}/batches/{batchId}` — same fields as the artifact's batch docs (`num`, `nickname`, `container`, `startedFrom`, `notes`, `status`, `createdAt`, `restStartedAt`, `readyAt`, `feedStartAt`, `usedAt`, `lastAddedAt`, `avatar`).
- `users/{uid}/events/{eventId}` — same fields as the artifact's event docs (`type`, `ts`, `day`, plus type-specific fields).
- `users/{uid}/config/settings` — `{readings, spread, maxTemp, stirDays, checkinDays}`.
- `users/{uid}/config/bin` — `{name, avatar}`.

Avatar photos stay as ~20 KB JPEG data URLs inside the doc (well under Firestore's 1 MB doc limit).

## Security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Everything else is denied by default.

## Sign-in

- Email + password via Firebase Auth. The one account is created by the user in the Firebase console; the app has no sign-up form.
- The session persists until **Sign out** (Settings tab).
- An iPhone home-screen app has storage separate from Safari, so the user signs in inside the installed app.
- Sign-in errors show a short message ("Wrong email or password", "No connection — try again").

## Sync and offline

- Firestore persistent local cache: writes apply locally at once (the UI updates through the snapshot listeners) and upload when online. Conflicts resolve last-write-wins, which is acceptable for one user.
- The service worker precaches the built app, so it opens offline after the first visit.
- A banner shows **"Offline — changes will sync"** while `navigator.onLine` is false.
- Write failures other than being offline (e.g. permission denied) show a toast, as the artifact's `handleErr` does today.
- First sign-in on a device with no connection: the sign-in screen shows "No connection — try again".

## Testing

- **Unit (Vitest), `domain.js`:** readiness — counts steady qualifying days, stops at temp over limit, stops when outside spread of bin temp, stops on sour/ammonia, ignores readings before `restStartedAt`, uses latest reading per day, falls back to that day's bin temp; alerts — hot bin, escaping, wet/dry, no check-in, overdue check-in, stir reminder, ready batch, no filling batch; date helpers across midnight.
- **Security rules:** run against the Firestore emulator if Java is installed (signed-out denied; other uid denied; own uid allowed). Otherwise verify against the live project: a signed-out REST read of `users/{uid}/events` is refused.
- **Manual on iPhone:** install from Safari, sign in, log a check, enable airplane mode, log another, disable it, confirm both appear on the computer; close and reopen the app offline and confirm it opens.

## Setup the user does (Claude cannot create accounts or sign in)

1. Create a free (Spark) Firebase project.
2. Enable Email/Password sign-in and add one user.
3. Create the Firestore database.
4. Register a web app and paste its config into `src/firebase-config.js` (Claude can do the pasting from what the user copies).
5. Run `firebase login` once on this PC.

Then `npm run deploy` builds and deploys hosting and rules.
