// The only Firestore data access. Everything lives under users/{uid}/.
// put/del return Firestore's promise, which only settles once the server has the write;
// callers must not await it (offline it stays pending until the phone reconnects).
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase.js";

let uid = null;
const ref = (coll, id) => doc(db, "users", uid, coll, id);

export function put(coll, id, obj) {
  if (!uid) return Promise.reject(new Error("Not signed in"));
  return setDoc(ref(coll, id), obj);
}

export function del(coll, id) {
  if (!uid) return Promise.reject(new Error("Not signed in"));
  return deleteDoc(ref(coll, id));
}

// onData(kind, data): kind is "batches" | "events" (map of id → doc with id) or "settings" | "bin" (doc).
// onLoaded(): both collections have arrived from the server. onSlow(): not loaded after 10 s.
export function subscribe(userId, { onData, onLoaded, onSlow, onError }) {
  uid = userId;
  const loaded = { batches: false, events: false };
  const timer = setTimeout(() => { if (!(loaded.batches && loaded.events)) onSlow() }, 10000);
  const err = e => { clearTimeout(timer); onError(e) };
  const toMap = s => { const m = {}; s.docs.forEach(x => { m[x.id] = { ...x.data(), id: x.id } }); return m };
  const coll = kind => onSnapshot(collection(db, "users", userId, kind), { includeMetadataChanges: true }, s => {
    onData(kind, toMap(s));
    if (!s.metadata.fromCache) { loaded[kind] = true; if (loaded.batches && loaded.events) { clearTimeout(timer); onLoaded() } }
  }, err);
  const single = kind => onSnapshot(ref("config", kind), s => { if (s.exists()) onData(kind, s.data()) }, err);
  const unsubs = [coll("batches"), coll("events"), single("settings"), single("bin")];
  return () => { clearTimeout(timer); unsubs.forEach(u => u()); uid = null };
}
