import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAFzBY0bOMWqxdpJTeyXlzahtJ_84gHf8k",
  authDomain: "sac-app-dcf1e.firebaseapp.com",
  projectId: "sac-app-dcf1e",
  storageBucket: "sac-app-dcf1e.firebasestorage.app",
  messagingSenderId: "680691879055",
  appId: "1:680691879055:web:8a15c7b13f0448cf3534fa"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function loginAdmin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function createCoachAccount(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function resetAdminPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function logoutAdmin() {
  return signOut(auth);
}

export function listenToGames(callback) {
  const q = query(collection(db, "games"));
  return onSnapshot(q, snap => {
    const games = snap.docs.map(d => d.data());
    games.sort((a, b) => new Date(a.date) - new Date(b.date));
    callback(games);
  });
}

export async function saveGame(game) {
  const id = game.id || generateId(game);
  const g = { ...game, id };
  await setDoc(doc(db, "games", id), g);
  return g;
}

export function generateId(game) {
  return (game.date + "-" + game.opponent).toLowerCase()
    .replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40);
}

export async function deleteGame(id) {
  await deleteDoc(doc(db, "games", id));
}
