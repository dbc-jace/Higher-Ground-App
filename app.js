import { createStore } from './store.js?v=2026.11.12-1';

const APP_VERSION = '2026.11.12-1';

const COLLECTIONS = ['people', 'categories', 'leaders', 'entries', 'attendance', 'settings'];

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const bannerEl = document.getElementById('banner');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });

/* ---------- weeks (start on Wednesday) ---------- */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function weekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() - 3 + 7) % 7)); // 3 = Wednesday
  return ymd(d);
}
function shiftWeek(id, n) { const d = parseYmd(id); d.setDate(d.getDate() + 7 * n); return ymd(d); }
function weekLabel(id) {
  const s = parseYmd(id); const e = new Date(s); e.setDate(e.getDate() + 6);
  const f = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString(undefined, f)} – ${e.toLocaleDateString(undefined, f)}`;
}

/* ---------- state ---------- */
const state = {
  loaded: new Set(),
  people: [], categories: [], leaders: [], entries: [], attendance: [], settings: [],
  tab: 'points',
  week: weekStart(new Date()),
  personId: null,
  board: 'week',
  user: null,        // { email, verified, name } from sign-in
  access: null,      // null | 'checking' | 'ok' | 'none'
  setupDone: true,   // has an admin claimed this app yet?
  authMsg: '',
};
let store;

// One-tap import links: #import=<base64url text>. The part after # never leaves the phone.
let pendingImport = (() => {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return null; }
})();

const settings = () => state.settings.find((s) => s.id === 'main') || {};
const attendancePoints = () => Number(settings().attendancePoints ?? 10);
const me = () => state.leaders.find((l) => l.id === state.user?.email);
const people = () => [...state.people].sort(byName);
const categories = () => [...state.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || byName(a, b));

function totals(weekId) {
  const t = new Map(state.people.map((p) => [p.id, { pts: 0, att: 0 }]));
  for (const e of state.entries) if ((!weekId || e.weekId === weekId) && t.has(e.personId)) t.get(e.personId).pts += Number(e.points) || 0;
  for (const a of state.attendance) if ((!weekId || a.weekId === weekId) && t.has(a.personId)) { const r = t.get(a.personId); r.pts += Number(a.points) || 0; r.att++; }
  return t;
}

/* ---------- toast & banner ---------- */
let toastTimer;
function toast(html, undo) {
  toastEl.innerHTML = `<span>${html}</span>${undo ? '<button data-act="undo">Undo</button>' : ''}`;
  toastEl._undo = undo;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4000);
}
toastEl.addEventListener('click', (e) => {
  if (e.target.dataset.act === 'undo' && toastEl._undo) { toastEl._undo(); toastEl._undo = null; toastEl.classList.remove('show'); }
});
function showError() {
  bannerEl.textContent = 'Could not save to the shared database. Check your connection or Firebase setup.';
  bannerEl.hidden = false;
  setTimeout(() => { bannerEl.hidden = true; }, 6000);
}

/* ---------- views ---------- */
function render() {
  if (!state.user) return renderSignIn();
  if (!state.user.verified) return renderVerify();
  if (state.access === 'none') return renderNoAccess();
  if (state.access !== 'ok' || state.loaded.size < COLLECTIONS.length || !me()) {
    app.innerHTML = '<p class="center muted">Loading…</p>'; return;
  }

  const leader = me();
  if (pendingImport) {
    if (leader.admin) {
      state.importPreview = parseImport(pendingImport);
      state.tab = 'settings';
    } else {
      toast('Only admins can import.');
    }
    pendingImport = null;
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (state.tab === 'settings' && !leader.admin) state.tab = 'points';
  const showWeek = state.tab !== 'settings' && !(state.tab === 'board' && state.board === 'all');
  const isThisWeek = state.week === weekStart(new Date());

  const body = { points: viewPoints, attendance: viewAttendance, board: viewBoard, settings: viewSettings }[state.tab]();
  const tabs = [['points', '★', 'Points'], ['attendance', '✓', 'Attendance'], ['board', '🏆', 'Board']];
  if (leader.admin) tabs.push(['settings', '⚙', 'Settings']);

  app.innerHTML = `
    <header class="top">
      <h1>Higher Ground</h1>
      <button class="link" data-act="logout">${esc(leader.name)} · Log out</button>
    </header>
    ${store.mode === 'local' ? '<div class="demo">Demo mode: no login, and data is saved on this device only. See README to turn on sharing.</div>' : ''}
    ${showWeek ? `
      <nav class="week">
        <button data-act="week" data-n="-1" aria-label="Previous week">◀</button>
        <div><strong>Week of ${weekLabel(state.week)}</strong>
          ${isThisWeek ? '<small>This week</small>' : '<button class="link small" data-act="thisWeek">Jump to this week</button>'}</div>
        <button data-act="week" data-n="1" aria-label="Next week">▶</button>
      </nav>` : ''}
    <main>${body}</main>
    <nav class="tabs">
      ${tabs.map(([id, icon, label]) => `<button data-act="tab" data-tab="${id}" class="${state.tab === id ? 'on' : ''}"><span>${icon}</span>${label}</button>`).join('')}
    </nav>`;
}

const authCard = (inner) => `
  <div class="card narrow">
    <img src="icon.svg" alt="" class="logo">
    <h1>Higher Ground</h1>
    ${state.authMsg ? `<p class="msg">${esc(state.authMsg)}</p>` : ''}
    ${inner}
  </div>`;

function renderSignIn() {
  app.innerHTML = authCard(`
    <p class="muted">Leaders sign in to enter points.</p>
    <button class="ghost wide google" data-act="google">
      <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.6 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>
      Sign in with Google</button>
    <div class="or"><span>or use email</span></div>
    <form data-form="emailAuth">
      <input name="email" type="email" placeholder="Email" required autocomplete="email">
      <input name="password" type="password" placeholder="Password (6+ characters)" required minlength="6" autocomplete="current-password">
      <div class="row">
        <button class="primary grow" name="mode" value="in">Sign in</button>
        <button class="ghost grow" name="mode" value="up">Create account</button>
      </div>
    </form>
    <button class="link" data-act="forgot">Forgot password?</button>`);
}

function renderVerify() {
  app.innerHTML = authCard(`
    <p>We emailed a link to <strong>${esc(state.user.email)}</strong>. Tap it to confirm your email, then come back here.</p>
    <button class="primary wide" data-act="verified">I've confirmed it</button>
    <button class="ghost wide" data-act="resend">Send the email again</button>
    <button class="link" data-act="logout">Use a different account</button>`);
}

function renderNoAccess() {
  app.innerHTML = authCard(state.setupDone ? `
    <p>You're signed in as <strong>${esc(state.user.email)}</strong>, but that email isn't on the leader list yet.</p>
    <p class="muted">Ask an admin to add this exact email in Settings → Leaders. This page will open automatically once they do.</p>
    <button class="link" data-act="logout">Sign out</button>` : `
    <p><strong>Welcome!</strong> No one has set up this app yet. You'll be the admin, and you can add other leaders afterward.</p>
    <form data-form="setup">
      <input name="name" placeholder="Your name" required value="${esc(state.user.name)}">
      <button class="primary">Set up as admin</button>
    </form>
    <button class="link" data-act="logout">Sign out</button>`);
}

function viewPoints() {
  const ppl = people();
  if (!ppl.length) return emptyState('No people yet.', 'Add people in Settings.');
  const t = totals(state.week);
  const person = ppl.find((p) => p.id === state.personId);
  const cats = categories();
  const list = person ? state.entries.filter((e) => e.personId === person.id && e.weekId === state.week).sort((a, b) => b.ts - a.ts) : [];
  const att = person && state.attendance.find((a) => a.personId === person.id && a.weekId === state.week);

  return `
    <div class="chips people">
      ${ppl.map((p) => `<button class="chip ${p.id === state.personId ? 'on' : ''}" data-act="pickPerson" data-id="${p.id}">${esc(p.name)} <b>${t.get(p.id).pts}</b></button>`).join('')}
    </div>
    ${!person ? '<p class="center muted">Tap a name to give points.</p>' : `
      <div class="person-head">
        <h2>${esc(person.name)}</h2>
        <div class="big">${t.get(person.id).pts} <small>pts this week</small></div>
      </div>
      ${cats.length ? `<div class="cat-grid">
        ${cats.map((c) => `<button class="cat" data-act="give" data-id="${c.id}"><span>${esc(c.name)}</span><b>+${Number(c.points) || 0}</b></button>`).join('')}
      </div>` : '<p class="muted center">No categories yet. Add some in Settings.</p>'}
      <button class="ghost wide" data-act="custom">Custom amount…</button>
      <h3>This week</h3>
      <ul class="log">
        ${att ? `<li><span>Attendance</span><b>+${Number(att.points) || 0}</b><span></span></li>` : ''}
        ${list.map((e) => `<li><span>${esc(e.categoryName)}<small>${esc(e.leaderName || '')}</small></span><b>${e.points >= 0 ? '+' : ''}${e.points}</b><button class="x" data-act="delEntry" data-id="${e.id}" aria-label="Remove">✕</button></li>`).join('')}
        ${!list.length && !att ? '<li class="muted">Nothing yet.</li>' : ''}
      </ul>`}`;
}

function viewAttendance() {
  const ppl = people();
  if (!ppl.length) return emptyState('No people yet.', 'Add people in Settings.');
  const here = new Set(state.attendance.filter((a) => a.weekId === state.week).map((a) => a.personId));
  const count = ppl.filter((p) => here.has(p.id)).length;
  return `
    <p class="center"><strong>${count} of ${ppl.length}</strong> here · +${attendancePoints()} pts each</p>
    <ul class="att">
      ${ppl.map((p) => `<li><button class="${here.has(p.id) ? 'on' : ''}" data-act="toggleAtt" data-id="${p.id}"><span class="box">${here.has(p.id) ? '✓' : ''}</span>${esc(p.name)}</button></li>`).join('')}
    </ul>`;
}

function viewBoard() {
  const t = totals(state.board === 'week' ? state.week : null);
  const rows = people().map((p) => ({ p, ...t.get(p.id) })).sort((a, b) => b.pts - a.pts || byName(a.p, b.p));
  let rank = 0, prev = null;
  return `
    <div class="seg">
      <button class="${state.board === 'week' ? 'on' : ''}" data-act="board" data-v="week">This week</button>
      <button class="${state.board === 'all' ? 'on' : ''}" data-act="board" data-v="all">All time</button>
    </div>
    ${!rows.length ? emptyState('No people yet.', '') : `<ol class="board">
      ${rows.map((r, i) => { if (r.pts !== prev) { rank = i + 1; prev = r.pts; } return `
        <li data-act="pickPerson" data-id="${r.p.id}" data-go="points">
          <span class="rank r${rank}">${rank}</span>
          <span class="name">${esc(r.p.name)}<small>${r.att} attended</small></span>
          <b>${r.pts}</b>
        </li>`; }).join('')}
    </ol>`}`;
}

function viewSettings() {
  const myEmail = state.user.email;
  return `
    <section class="card">
      <h2>People</h2>
      ${mergePanelHtml()}
      <form data-form="addPerson" class="row">
        <input name="name" placeholder="Name" required><button class="primary">Add</button>
      </form>
      <ul class="edit">
        ${people().map((p) => `<li>
          <input value="${esc(p.name)}" data-col="people" data-id="${p.id}" data-field="name" aria-label="Name">
          <button class="ghost small" data-act="mergeStart" data-id="${p.id}">Merge</button>
          <button class="x" data-act="del" data-col="people" data-id="${p.id}" data-name="${esc(p.name)}" aria-label="Delete">✕</button>
        </li>`).join('')}
      </ul>
    </section>

    <section class="card">
      <h2>Point categories</h2>
      <p class="muted small">Each category becomes a button. Changing points only affects new taps.</p>
      <form data-form="addCategory" class="row">
        <input name="name" placeholder="Category" required>
        <input name="points" type="number" inputmode="numeric" placeholder="Pts" required class="pts">
        <button class="primary">Add</button>
      </form>
      <ul class="edit">
        ${categories().map((c, i, all) => `<li>
          <input value="${esc(c.name)}" data-col="categories" data-id="${c.id}" data-field="name" aria-label="Category name">
          <input type="number" inputmode="numeric" class="pts" value="${Number(c.points) || 0}" data-col="categories" data-id="${c.id}" data-field="points" aria-label="Points">
          <button class="x" data-act="move" data-id="${c.id}" data-n="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
          <button class="x" data-act="move" data-id="${c.id}" data-n="1" ${i === all.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
          <button class="x" data-act="del" data-col="categories" data-id="${c.id}" data-name="${esc(c.name)}" aria-label="Delete">✕</button>
        </li>`).join('')}
      </ul>
    </section>

    <section class="card">
      <h2>Attendance</h2>
      <label class="row">Points for being here
        <input type="number" inputmode="numeric" class="pts" value="${attendancePoints()}" data-col="settings" data-id="main" data-field="attendancePoints">
      </label>
    </section>

    <section class="card">
      <h2>Leaders</h2>
      <p class="muted small">Only these emails can sign in. Each leader signs in with Google or creates an email account using the same address.</p>
      <form data-form="addLeader">
        <input name="name" placeholder="Name" required>
        <input name="email" type="email" placeholder="Email" required autocapitalize="off">
        <label class="check"><input type="checkbox" name="admin"> Admin (can change settings)</label>
        <button class="primary wide">Add leader</button>
      </form>
      <ul class="edit">
        ${[...state.leaders].sort(byName).map((l) => `<li>
          <span class="grow">${esc(l.name)} ${l.admin ? '<em class="badge">admin</em>' : ''}<small class="email">${esc(l.id)}</small></span>
          ${l.id !== myEmail ? `<button class="ghost small" data-act="toggleAdmin" data-id="${esc(l.id)}">${l.admin ? 'Remove admin' : 'Make admin'}</button>
          <button class="x" data-act="del" data-col="leaders" data-id="${esc(l.id)}" data-name="${esc(l.name)}" aria-label="Delete">✕</button>` : '<small class="muted">you</small>'}
        </li>`).join('')}
      </ul>
    </section>

    <section class="card">
      <h2>Import</h2>
      <p class="muted small">Paste a list (or copy two columns straight from Google Sheets). Put <b>CATEGORIES</b> on its own line, then one "name, points" per line. Then <b>KIDS</b> on its own line, then one "name, current total" per line. Totals are added as a one-time "Starting total" that counts toward All time. Optional: <b>ATTENDANCE</b>, then "name: 2026-09-16, 2026-09-23" to record past weeks attended (no extra points).</p>
      ${state.importPreview ? `<div id="import-preview">${importPreviewHtml()}</div>` : `
      <form data-form="importPreview">
        <textarea name="text" rows="8" placeholder="CATEGORIES&#10;Memory Verse, 10&#10;Brought Bible, 5&#10;KIDS&#10;Sam, 120&#10;Ava, 85" required></textarea>
        <button class="primary wide">Preview import</button>
      </form>`}
    </section>

    <section class="card">
      <h2>Backup</h2>
      <button class="ghost wide" data-act="export">Download all points (CSV)</button>
      <p class="muted small center">App version ${APP_VERSION}</p>
    </section>`;
}

const emptyState = (title, sub) => `<div class="center muted empty"><p><strong>${title}</strong></p><p>${sub}</p></div>`;

/* ---------- actions ---------- */
function addEntry(person, name, points, categoryId = null) {
  const id = store.add('entries', {
    weekId: state.week, personId: person.id, personName: person.name,
    categoryId, categoryName: name, points,
    leaderEmail: state.user.email, leaderName: me()?.name || '', ts: Date.now(),
  });
  navigator.vibrate?.(15);
  toast(`${points >= 0 ? '+' : ''}${points} ${esc(name)} → ${esc(person.name)}`, () => store.remove('entries', id));
}

const actions = {
  tab: (d) => { state.tab = d.tab; },
  week: (d) => { state.week = shiftWeek(state.week, Number(d.n)); },
  thisWeek: () => { state.week = weekStart(new Date()); },
  board: (d) => { state.board = d.v; },
  logout: async () => { await store.signOut(); location.reload(); },
  google: async () => {
    try { await store.signInGoogle(); } catch (e) { authError(e); }
  },
  forgot: async () => {
    const email = app.querySelector('input[name=email]')?.value.trim() || prompt('Your email:');
    if (!email) return;
    try { await store.resetPassword(email); state.authMsg = `Password reset email sent to ${email}.`; } catch (e) { authError(e); }
  },
  resend: async () => {
    try { await store.resendVerification(); state.authMsg = 'Sent! Check your inbox (and spam).'; } catch (e) { authError(e); }
  },
  verified: async () => {
    const u = await store.reloadUser();
    if (!u.verified) { state.authMsg = "Not confirmed yet. Tap the link in the email first."; return; }
    onUser(u);
  },
  toggleAdmin: (d) => {
    const l = state.leaders.find((x) => x.id === d.id);
    if (l) store.update('leaders', l.id, { admin: !l.admin });
  },
  pickPerson: (d) => { state.personId = d.id; if (d.go) state.tab = d.go; },
  give: (d) => {
    const person = state.people.find((p) => p.id === state.personId);
    const cat = state.categories.find((c) => c.id === d.id);
    if (person && cat) addEntry(person, cat.name, Number(cat.points) || 0, cat.id);
  },
  custom: () => {
    const person = state.people.find((p) => p.id === state.personId);
    if (!person) return;
    const raw = prompt(`Points for ${person.name} (use a minus sign to take away):`);
    if (raw === null) return;
    const points = Number(raw);
    if (!Number.isFinite(points) || raw.trim() === '') return alert('Please enter a number.');
    const note = prompt('What for? (optional)') || 'Custom';
    addEntry(person, note, points);
  },
  delEntry: (d) => {
    const e = state.entries.find((x) => x.id === d.id);
    if (e && confirm(`Remove ${e.points} pts for "${e.categoryName}"?`)) store.remove('entries', d.id);
  },
  undo: () => {},
  toggleAtt: (d) => {
    const id = `${state.week}_${d.id}`;
    const person = state.people.find((p) => p.id === d.id);
    if (state.attendance.some((a) => a.id === id)) store.remove('attendance', id);
    else {
      store.set('attendance', id, { weekId: state.week, personId: d.id, personName: person?.name || '', points: attendancePoints(), leaderName: me()?.name || '', ts: Date.now() });
      navigator.vibrate?.(15);
    }
  },
  del: (d) => {
    const extra = d.col === 'people' ? ' Their points will no longer appear on the board.' : '';
    if (confirm(`Delete "${d.name}"?${extra}`)) store.remove(d.col, d.id);
  },
  move: (d) => {
    const cats = categories();
    const i = cats.findIndex((c) => c.id === d.id);
    const j = i + Number(d.n);
    if (j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    cats.forEach((c, k) => { if (c.order !== k) store.update('categories', c.id, { order: k }); });
  },
  importCancel: () => { state.importPreview = null; },
  mergeStart: (d) => { state.mergeFrom = d.id; window.scrollTo({ top: 0, behavior: 'smooth' }); },
  mergeCancel: () => { state.mergeFrom = null; },
  mergeInto: (d) => {
    const from = state.people.find((p) => p.id === state.mergeFrom);
    const to = state.people.find((p) => p.id === d.id);
    if (!from || !to) return;
    if (!confirm(`Move all of ${from.name}'s points and attendance to ${to.name}, then remove ${from.name}?`)) return;
    mergeKids(from.id, to.id);
    state.mergeFrom = null;
    toast(`Merged ${esc(from.name)} into ${esc(to.name)}`);
  },
  importRun: () => {
    const p = state.importPreview;
    if (!p) return;
    const cats = new Map(state.categories.map((c) => [norm(c.name), c]));
    let order = Math.max(-1, ...state.categories.map((c) => c.order ?? 0));
    for (const c of p.categories) {
      const ex = cats.get(norm(c.name));
      if (ex) store.update('categories', ex.id, { points: c.points });
      else store.add('categories', { name: c.name, points: c.points, order: ++order });
    }
    const ppl = new Map(state.people.map((x) => [norm(x.name), x]));
    const personId = (name) => {
      let id = ppl.get(norm(name))?.id;
      if (!id) { id = store.add('people', { name }); ppl.set(norm(name), { id, name }); }
      return id;
    };
    for (const k of p.kids) {
      const id = personId(k.name);
      // One starting-total entry per kid; re-importing replaces it instead of doubling.
      const entryId = 'carryover_' + id;
      if (k.total) {
        store.set('entries', entryId, {
          weekId: CARRYOVER, personId: id, personName: k.name,
          categoryId: null, categoryName: 'Starting total', points: k.total,
          leaderEmail: state.user.email, leaderName: me()?.name || '', ts: Date.now(),
        });
      } else if (state.entries.some((e) => e.id === entryId)) {
        store.remove('entries', entryId);
      }
    }
    // Past attendance: 0 points (already counted in starting totals). Weeks already marked in the app are left as-is.
    let marks = 0;
    for (const a of p.attendance) {
      const id = personId(a.name);
      for (const w of a.weeks) {
        const docId = `${w}_${id}`;
        if (state.attendance.some((x) => x.id === docId)) continue;
        store.set('attendance', docId, { weekId: w, personId: id, personName: a.name, points: 0, imported: true,
          leaderName: me()?.name || '', ts: Date.now() });
        marks++;
      }
    }
    toast(`Imported ${p.categories.length} categories, ${p.kids.length} kids, ${marks} attendance marks`);
    state.importPreview = null;
  },
  export: () => {
    const rows = [['Week starting', 'Person', 'Category', 'Points', 'Entered by', 'Time']];
    const name = (id, fallback) => state.people.find((p) => p.id === id)?.name || fallback || '';
    for (const e of state.entries) rows.push([e.weekId, name(e.personId, e.personName), e.categoryName, e.points, e.leaderName, new Date(e.ts).toLocaleString()]);
    for (const a of state.attendance) rows.push([a.weekId, name(a.personId, a.personName), 'Attendance', a.points, a.leaderName, new Date(a.ts).toLocaleString()]);
    rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `higher-ground-points-${ymd(new Date())}.csv`;
    a.click();
  },
};

/* ---------- import ---------- */
const CARRYOVER = 'carryover';
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

function parseImport(text) {
  const out = { categories: [], kids: [], attendance: [], skipped: [] };
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = norm(line).replace(/[:\t,]+$/, '');
    if (/^(categories|category)$/.test(head)) { section = 'categories'; continue; }
    if (/^(kids|people|students|names)$/.test(head)) { section = 'kids'; continue; }
    if (/^(attendance|attended)$/.test(head)) { section = 'attendance'; continue; }
    if (section === 'attendance') {
      // "Name: 2026-09-16, 2026-09-23" -> one attendance mark per date (week).
      const dates = line.match(/\d{4}-\d{2}-\d{2}/g) || [];
      const name = line.split(/\d{4}-\d{2}-\d{2}/)[0].replace(/[\s,:\t-]+$/, '').trim();
      if (!name || !dates.length) { out.skipped.push(line); continue; }
      out.attendance.push({ name, weeks: [...new Set(dates.map((d) => weekStart(parseYmd(d))))] });
      continue;
    }
    // "name<TAB>number" or "name, number" or "name - 12" — number is the last numeric field.
    const m = line.match(/^(.*?)[\s,\t:=-]+(-?\d+(?:\.\d+)?)\s*(?:pts?|points?)?$/i);
    const name = (m ? m[1] : line).replace(/[\t,]+$/, '').trim();
    const num = m ? Number(m[2]) : null;
    if (!name || !section) { out.skipped.push(line); continue; }
    if (section === 'categories') {
      if (num === null) { out.skipped.push(line); continue; }
      out.categories.push({ name, points: num });
    } else {
      out.kids.push({ name, total: num ?? 0 });
    }
  }
  return out;
}

function mergePanelHtml() {
  const from = state.people.find((p) => p.id === state.mergeFrom);
  if (!from) return '';
  const t = totals(null);
  return `
    <div class="merge">
      <p><strong>Merge ${esc(from.name)}</strong> (${t.get(from.id)?.pts ?? 0} pts) into which kid?</p>
      <p class="muted small">All of ${esc(from.name)}'s points and attendance move to the kid you pick, then ${esc(from.name)} is removed.</p>
      <div class="chips">${people().filter((p) => p.id !== from.id).map((p) =>
        `<button class="chip" data-act="mergeInto" data-id="${p.id}">${esc(p.name)} <b>${t.get(p.id)?.pts ?? 0}</b></button>`).join('')}</div>
      <button class="ghost wide" data-act="mergeCancel">Cancel</button>
    </div>`;
}

function mergeKids(fromId, toId) {
  const to = state.people.find((p) => p.id === toId);
  // Points: move every entry; starting totals combine into one.
  for (const e of state.entries.filter((x) => x.personId === fromId)) {
    if (e.weekId === CARRYOVER) {
      const targetId = 'carryover_' + toId;
      const existing = state.entries.find((x) => x.id === targetId);
      const { id, ...rest } = e;
      store.set('entries', targetId, { ...rest, personId: toId, personName: to.name,
        points: (Number(existing?.points) || 0) + (Number(e.points) || 0) });
      if (e.id !== targetId) store.remove('entries', e.id);
    } else {
      store.update('entries', e.id, { personId: toId, personName: to.name });
    }
  }
  // Attendance: one per kid per week, so skip weeks the target was already marked.
  for (const a of state.attendance.filter((x) => x.personId === fromId)) {
    const newId = `${a.weekId}_${toId}`;
    if (!state.attendance.some((x) => x.id === newId)) {
      const { id, ...rest } = a;
      store.set('attendance', newId, { ...rest, personId: toId, personName: to.name });
    }
    store.remove('attendance', a.id);
  }
  store.remove('people', fromId);
  if (state.personId === fromId) state.personId = toId;
}

function importPreviewHtml() {
  const p = state.importPreview;
  const existingP = new Set(state.people.map((x) => norm(x.name)));
  const existingC = new Set(state.categories.map((x) => norm(x.name)));
  return `
    <p><strong>${p.categories.length}</strong> categories · <strong>${p.kids.length}</strong> kids${p.attendance.length ? ` · <strong>${p.attendance.reduce((n, a) => n + a.weeks.length, 0)}</strong> attendance marks` : ''}</p>
    ${p.categories.length ? `<h3>Categories</h3><ul class="preview">${p.categories.map((c) =>
      `<li><span>${esc(c.name)}${existingC.has(norm(c.name)) ? ' <em class="badge">update</em>' : ''}</span><b>${c.points}</b></li>`).join('')}</ul>` : ''}
    ${p.kids.length ? `<h3>Kids & starting totals</h3><ul class="preview">${p.kids.map((k) =>
      `<li><span>${esc(k.name)}${existingP.has(norm(k.name)) ? ' <em class="badge">exists</em>' : ''}</span><b>${k.total}</b></li>`).join('')}</ul>` : ''}
    ${p.attendance.length ? `<h3>Times attended (no extra points)</h3><ul class="preview">${p.attendance.map((a) =>
      `<li><span>${esc(a.name)}${existingP.has(norm(a.name)) ? ' <em class="badge">exists</em>' : ''}</span><b>${a.weeks.length}</b></li>`).join('')}</ul>` : ''}
    ${p.skipped.length ? `<p class="msg">Couldn't read ${p.skipped.length} line(s): ${p.skipped.map(esc).join(' · ')}</p>` : ''}
    <div class="row">
      <button class="ghost grow" data-act="importCancel">Cancel</button>
      <button class="primary grow" data-act="importRun">Import</button>
    </div>`;
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email. Tap "Create account".',
  'auth/email-already-in-use': 'That email already has an account. Tap "Sign in" (or "Forgot password?").',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': "That email doesn't look right.",
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/unauthorized-domain': 'This website address is not allowed yet. See README: Authorized domains.',
  'auth/popup-blocked': 'Pop-up was blocked. Allow pop-ups or use email sign-in.',
};
function authError(e) {
  console.error(e);
  if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
  state.authMsg = AUTH_ERRORS[e?.code] || 'Something went wrong. Please try again.';
  render();
}

const forms = {
  importPreview: (f) => {
    const parsed = parseImport(f.get('text'));
    if (!parsed.categories.length && !parsed.kids.length && !parsed.attendance.length) {
      alert('Nothing found. Make sure you have a line that says CATEGORIES, KIDS, or ATTENDANCE above each list.');
      return;
    }
    state.importPreview = parsed;
  },
  emailAuth: async (f, submitter) => {
    const email = f.get('email').trim(), pw = f.get('password');
    state.authMsg = '';
    try {
      if (submitter?.value === 'up') await store.signUp(email, pw);
      else await store.signIn(email, pw);
    } catch (e) { authError(e); }
  },
  setup: async (f) => {
    try {
      await store.claimSetup(state.user.email, f.get('name').trim());
      if (!state.settings.length) store.set('settings', 'main', { attendancePoints: 10 });
      state.tab = 'settings';
    } catch (e) {
      console.error(e);
      state.setupDone = true;
      state.authMsg = 'Someone already set up this app. Ask them to add you.';
    }
  },
  addPerson: (f) => { store.add('people', { name: f.get('name').trim() }); },
  addCategory: (f) => {
    const max = Math.max(-1, ...state.categories.map((c) => c.order ?? 0));
    store.add('categories', { name: f.get('name').trim(), points: Number(f.get('points')) || 0, order: max + 1 });
  },
  addLeader: (f) => {
    const email = f.get('email').trim().toLowerCase();
    store.set('leaders', email, { name: f.get('name').trim(), admin: f.get('admin') === 'on' });
  },
};

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  await actions[el.dataset.act](el.dataset);
  render();
});
app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  await forms[form.dataset.form]?.(new FormData(form), e.submitter);
  if (form.isConnected && form.dataset.form !== 'emailAuth') form.reset();
  render();
});
app.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.dataset.col) return;
  let v = el.value;
  if (el.type === 'number') v = Number(v) || 0;
  else { v = v.trim(); if (!v) return render(); }
  store.update(el.dataset.col, el.dataset.id, { [el.dataset.field]: v });
});

let pendingRender = false;
app.addEventListener('focusout', () => {
  if (!pendingRender) return;
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a.tagName === 'INPUT' && app.contains(a)) return;
    pendingRender = false;
    render();
  }, 400);
});

/* ---------- start ---------- */
let watching = false;
function startWatching() {
  if (watching) return;
  watching = true;
  for (const name of COLLECTIONS) {
    store.watch(name, (docs) => {
      state[name] = docs;
      state.loaded.add(name);
      // Don't clobber an input someone is typing in.
      const active = document.activeElement;
      if (active && active.tagName === 'INPUT' && app.contains(active)) { pendingRender = true; return; }
      render();
    });
  }
}

function onUser(user) {
  state.user = user;
  state.authMsg = '';
  if (!user || !user.verified) { state.access = null; return render(); }
  state.access = 'checking';
  render();
  // Am I on the leader list? (Updates live, so access opens as soon as an admin adds me.)
  store.watchDoc('leaders', user.email, async (doc) => {
    if (doc) {
      state.access = 'ok';
      startWatching();
    } else if (state.access !== 'ok') {
      try { state.setupDone = !!(await store.getDoc('meta', 'setup')); } catch { state.setupDone = true; }
      state.access = 'none';
    } else {
      location.reload(); // removed from leader list while signed in
    }
    render();
  }, (err) => { console.error(err); state.access = 'none'; state.setupDone = true; render(); });
}

(async () => {
  try {
    store = await createStore(showError);
  } catch (err) {
    console.error(err);
    app.innerHTML = '<p class="center">Could not connect to the database. Check firebase-config.js.</p>';
    return;
  }
  store.onAuth(onUser);
  render();
})();
