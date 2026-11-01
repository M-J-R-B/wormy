import { signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";

export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOut = () => fbSignOut(auth);
export const onUser = cb => onAuthStateChanged(auth, cb);
