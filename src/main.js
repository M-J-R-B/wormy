import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "./styles.css";
import { onUser, signIn } from "./auth.js";
import { subscribe } from "./store.js";
import { showSignIn, showApp, applyData, setNote, setOnline, clearData } from "./ui.js";

let unsubscribe = null;

function signInMessage(e) {
  const c = (e && e.code) || "";
  if (c === "auth/network-request-failed") return "No connection — try again.";
  if (c === "auth/too-many-requests") return "Too many tries — wait a minute and try again.";
  return "Wrong email or password.";
}

document.addEventListener("submit", async ev => {
  if (ev.target.id !== "signin") return;
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const email = String(fd.get("email") || "").trim(), password = String(fd.get("password") || "");
  showSignIn("", email, true);
  try { await signIn(email, password) } catch (e) { showSignIn(signInMessage(e), email) }
});

window.addEventListener("online", () => setOnline(true));
window.addEventListener("offline", () => setOnline(false));

onUser(user => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
  if (!user) { clearData(); showSignIn(); return }
  showApp(user.email || "");
  unsubscribe = subscribe(user.uid, {
    onData: applyData,
    onLoaded: () => setNote(""),
    onSlow: () => { if (navigator.onLine) setNote("Can't reach your saved data yet — what you see may be out of date.") },
    onError: () => setNote("Lost connection to your saved data. Reopen the app to retry."),
  });
});
