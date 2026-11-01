// Firebase setup: Firestore keeps a persistent offline cache; Auth stays signed in via IndexedDB.
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAuth, indexedDBLocalPersistence } from "firebase/auth";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});
export const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
