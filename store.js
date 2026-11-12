// Tiny data layer: Firestore (shared, live) when configured, localStorage (demo) otherwise.
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function createStore(onError) {
  if (firebaseConfig.apiKey) return firestoreStore(onError);
  return localStore();
}

async function firestoreStore(onError) {
  const { initializeApp } = await import(FB + 'firebase-app.js');
  const fs = await import(FB + 'firebase-firestore.js');
  const db = fs.getFirestore(initializeApp(firebaseConfig));
  const fail = (e) => { console.error(e); onError?.(e); };
  return {
    mode: 'shared',
    watch(name, cb) {
      fs.onSnapshot(fs.collection(db, name),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), fail);
    },
    add(name, data) {
      const ref = fs.doc(fs.collection(db, name));
      fs.setDoc(ref, data).catch(fail);
      return ref.id;
    },
    set(name, id, data) { fs.setDoc(fs.doc(db, name, id), data).catch(fail); },
    update(name, id, data) { fs.setDoc(fs.doc(db, name, id), data, { merge: true }).catch(fail); },
    remove(name, id) { fs.deleteDoc(fs.doc(db, name, id)).catch(fail); },
  };
}

function localStore() {
  const key = (n) => 'hg_' + n;
  const subs = {};
  const read = (n) => { try { return JSON.parse(localStorage.getItem(key(n))) || {}; } catch { return {}; } };
  const list = (n) => Object.entries(read(n)).map(([id, v]) => ({ id, ...v }));
  const emit = (n) => (subs[n] || []).forEach((cb) => cb(list(n)));
  const write = (n, obj) => { localStorage.setItem(key(n), JSON.stringify(obj)); emit(n); };
  window.addEventListener('storage', (e) => { if (e.key?.startsWith('hg_')) emit(e.key.slice(3)); });
  return {
    mode: 'local',
    watch(n, cb) { (subs[n] ??= []).push(cb); queueMicrotask(() => cb(list(n))); },
    add(n, data) { const id = newId(); const o = read(n); o[id] = data; write(n, o); return id; },
    set(n, id, data) { const o = read(n); o[id] = data; write(n, o); },
    update(n, id, data) { const o = read(n); o[id] = { ...o[id], ...data }; write(n, o); },
    remove(n, id) { const o = read(n); delete o[id]; write(n, o); },
  };
}
