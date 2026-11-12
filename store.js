// Data + sign-in layer: Firebase (shared, live, real logins) when configured,
// localStorage demo mode (no login, this device only) otherwise.
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function createStore(onError) {
  if (firebaseConfig.apiKey) return firebaseStore(onError);
  return localStore();
}

async function firebaseStore(onError) {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-firestore.js'),
    import(FB + 'firebase-auth.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  const fail = (e) => { console.error(e); onError?.(e); };
  const toUser = (u) => u && { email: (u.email || '').toLowerCase(), verified: u.emailVerified, name: u.displayName || '' };

  return {
    mode: 'shared',

    // ---- sign-in ----
    onAuth(cb) { au.onAuthStateChanged(auth, (u) => cb(toUser(u))); },
    signInGoogle() { return au.signInWithPopup(auth, new au.GoogleAuthProvider()); },
    signIn(email, pw) { return au.signInWithEmailAndPassword(auth, email, pw); },
    async signUp(email, pw) {
      const cred = await au.createUserWithEmailAndPassword(auth, email, pw);
      await au.sendEmailVerification(cred.user);
    },
    resendVerification() { return au.sendEmailVerification(auth.currentUser); },
    async reloadUser() {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true); // refresh so the database sees "verified"
      return toUser(auth.currentUser);
    },
    resetPassword(email) { return au.sendPasswordResetEmail(auth, email); },
    signOut() { return au.signOut(auth); },

    // ---- data ----
    watch(name, cb) {
      return fs.onSnapshot(fs.collection(db, name),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), fail);
    },
    watchDoc(name, id, cb, onErr) {
      return fs.onSnapshot(fs.doc(db, name, id),
        (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), onErr || fail);
    },
    async getDoc(name, id) {
      const s = await fs.getDoc(fs.doc(db, name, id));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    },
    async claimSetup(email, name) {
      const b = fs.writeBatch(db);
      b.set(fs.doc(db, 'leaders', email), { name, admin: true });
      b.set(fs.doc(db, 'meta', 'setup'), { owner: email, ts: Date.now() });
      await b.commit();
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
  const watch = (n, cb) => { (subs[n] ??= []).push(cb); queueMicrotask(() => cb(list(n))); };
  const set = (n, id, data) => { const o = read(n); o[id] = data; write(n, o); };
  return {
    mode: 'local',
    onAuth(cb) { cb({ email: 'demo@example.com', verified: true, name: 'Demo' }); },
    signOut() { return Promise.resolve(); },
    watch,
    watchDoc(n, id, cb) { watch(n, (docs) => cb(docs.find((d) => d.id === id) || null)); },
    async getDoc(n, id) { const v = read(n)[id]; return v ? { id, ...v } : null; },
    async claimSetup(email, name) { set('leaders', email, { name, admin: true }); set('meta', 'setup', { owner: email }); },
    add(n, data) { const id = newId(); set(n, id, data); return id; },
    set,
    update(n, id, data) { const o = read(n); o[id] = { ...o[id], ...data }; write(n, o); },
    remove(n, id) { const o = read(n); delete o[id]; write(n, o); },
  };
}
