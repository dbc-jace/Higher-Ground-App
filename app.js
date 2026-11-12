import { createStore } from './store.js';

const COLLECTIONS = ['people', 'categories', 'leaders', 'entries', 'attendance', 'settings'];
const SESSION_KEY = 'hgsess_leader';

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
  loginPick: null,
  leaderId: (() => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } })(),
};
let store;

const settings = () => state.settings.find((s) => s.id === 'main') || {};
const attendancePoints = () => Number(settings().attendancePoints ?? 10);
const me = () => state.leaders.find((l) => l.id === state.leaderId);
const people = () => [...state.people].sort(byName);
const categories = () => [...state.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || byName(a, b));

function totals(weekId) {
  const t = new Map(state.people.map((p) => [p.id, { pts: 0, att: 0 }]));
  for (const e of state.entries) if ((!weekId || e.weekId === weekId) && t.has(e.personId)) t.get(e.personId).pts += Number(e.points) || 0;
  for (const a of state.attendance) if ((!weekId || a.weekId === weekId) && t.has(a.personId)) { const r = t.get(a.personId); r.pts += Number(a.points) || 0; r.att++; }
  return t;
}

async function hashPin(pin) {
  const text = 'higher-ground:' + pin;
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return 'plain:' + text;
}

function setSession(id) {
  state.leaderId = id;
  try { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
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
  if (state.loaded.size < COLLECTIONS.length) { app.innerHTML = '<p class="center muted">Loading…</p>'; return; }
  if (!state.leaders.length) return renderSetup();
  if (!me()) return renderLogin();

  const leader = me();
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
    ${store.mode === 'local' ? '<div class="demo">Demo mode: data is saved on this device only. See README to turn on sharing.</div>' : ''}
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

function renderSetup() {
  app.innerHTML = `
    <div class="card narrow">
      <h1>Higher Ground</h1>
      <p>Welcome! Create the admin account. You'll add other leaders, people, and point categories afterward.</p>
      <form data-form="setup">
        <label>Your name<input name="name" required autocomplete="name"></label>
        <label>PIN<input name="pin" required inputmode="numeric" pattern="[0-9]{4,8}" title="4–8 digits" type="password"></label>
        <button class="primary">Create admin</button>
      </form>
    </div>`;
}

function renderLogin() {
  const pick = state.leaders.find((l) => l.id === state.loginPick);
  app.innerHTML = `
    <div class="card narrow">
      <h1>Higher Ground</h1>
      ${pick ? `
        <p>Hi ${esc(pick.name)}! Enter your PIN.</p>
        <form data-form="login">
          <input name="pin" required inputmode="numeric" type="password" autofocus aria-label="PIN">
          <button class="primary">Log in</button>
        </form>
        <button class="link" data-act="loginBack">Not you?</button>` : `
        <p>Who's entering points?</p>
        <div class="chips">${[...state.leaders].sort(byName).map((l) => `<button class="chip" data-act="loginPick" data-id="${l.id}">${esc(l.name)}</button>`).join('')}</div>`}
    </div>`;
  app.querySelector('input[name=pin]')?.focus();
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
  const myId = state.leaderId;
  return `
    <section class="card">
      <h2>People</h2>
      <form data-form="addPerson" class="row">
        <input name="name" placeholder="Name" required><button class="primary">Add</button>
      </form>
      <ul class="edit">
        ${people().map((p) => `<li>
          <input value="${esc(p.name)}" data-col="people" data-id="${p.id}" data-field="name" aria-label="Name">
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
      <form data-form="addLeader">
        <div class="row">
          <input name="name" placeholder="Name" required>
          <input name="pin" placeholder="PIN" required inputmode="numeric" pattern="[0-9]{4,8}" title="4–8 digits" class="pts">
        </div>
        <label class="check"><input type="checkbox" name="admin"> Admin (can change settings)</label>
        <button class="primary wide">Add leader</button>
      </form>
      <ul class="edit">
        ${[...state.leaders].sort(byName).map((l) => `<li>
          <span class="grow">${esc(l.name)} ${l.admin ? '<em class="badge">admin</em>' : ''}</span>
          <button class="ghost small" data-act="resetPin" data-id="${l.id}">New PIN</button>
          ${l.id !== myId ? `<button class="x" data-act="del" data-col="leaders" data-id="${l.id}" data-name="${esc(l.name)}" aria-label="Delete">✕</button>` : ''}
        </li>`).join('')}
      </ul>
    </section>

    <section class="card">
      <h2>Backup</h2>
      <button class="ghost wide" data-act="export">Download all points (CSV)</button>
    </section>`;
}

const emptyState = (title, sub) => `<div class="center muted empty"><p><strong>${title}</strong></p><p>${sub}</p></div>`;

/* ---------- actions ---------- */
function addEntry(person, name, points, categoryId = null) {
  const id = store.add('entries', {
    weekId: state.week, personId: person.id, personName: person.name,
    categoryId, categoryName: name, points,
    leaderId: state.leaderId, leaderName: me()?.name || '', ts: Date.now(),
  });
  navigator.vibrate?.(15);
  toast(`${points >= 0 ? '+' : ''}${points} ${esc(name)} → ${esc(person.name)}`, () => store.remove('entries', id));
}

const actions = {
  tab: (d) => { state.tab = d.tab; },
  week: (d) => { state.week = shiftWeek(state.week, Number(d.n)); },
  thisWeek: () => { state.week = weekStart(new Date()); },
  board: (d) => { state.board = d.v; },
  logout: () => { setSession(null); state.loginPick = null; },
  loginPick: (d) => { state.loginPick = d.id; },
  loginBack: () => { state.loginPick = null; },
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
  resetPin: async (d) => {
    const l = state.leaders.find((x) => x.id === d.id);
    const pin = prompt(`New PIN for ${l.name} (4–8 digits):`);
    if (pin === null) return;
    if (!/^\d{4,8}$/.test(pin)) return alert('PIN must be 4–8 digits.');
    store.update('leaders', l.id, { pinHash: await hashPin(pin) });
    toast('PIN updated');
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

const forms = {
  setup: async (f) => {
    const id = store.add('leaders', { name: f.get('name').trim(), pinHash: await hashPin(f.get('pin')), admin: true });
    store.set('settings', 'main', { attendancePoints: 10 });
    setSession(id);
    state.tab = 'settings';
  },
  login: async (f) => {
    const l = state.leaders.find((x) => x.id === state.loginPick);
    if (l && l.pinHash === await hashPin(f.get('pin'))) { setSession(l.id); state.loginPick = null; }
    else { alert('Wrong PIN'); }
  },
  addPerson: (f) => { store.add('people', { name: f.get('name').trim() }); },
  addCategory: (f) => {
    const max = Math.max(-1, ...state.categories.map((c) => c.order ?? 0));
    store.add('categories', { name: f.get('name').trim(), points: Number(f.get('points')) || 0, order: max + 1 });
  },
  addLeader: async (f) => {
    store.add('leaders', { name: f.get('name').trim(), pinHash: await hashPin(f.get('pin')), admin: f.get('admin') === 'on' });
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
  await forms[form.dataset.form]?.(new FormData(form));
  form.reset();
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
(async () => {
  try {
    store = await createStore(showError);
  } catch (err) {
    console.error(err);
    app.innerHTML = '<p class="center">Could not connect to the database. Check firebase-config.js.</p>';
    return;
  }
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
  render();
})();
