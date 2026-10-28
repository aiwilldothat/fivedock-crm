/* Fivedock CRM (Free) - single-page app. Vanilla JS, hash router. */
'use strict';
const API = 'index.php?r=';
const state = { user: null, csrf: '', settings: {}, cur: '$', imap: false };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = () => $('#root');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => state.cur + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s) => s ? String(s).slice(0, 16).replace('T', ' ') : '';
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const initials = (s) => String(s || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();

async function apiGet(a) {
  const r = await fetch(API + a, { credentials: 'same-origin' });
  const d = await r.json().catch(() => ({ ok: false, error: 'Bad response' }));
  if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
  return d;
}
async function apiPost(a, body) {
  const r = await fetch(API + a, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf }, credentials: 'same-origin', body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({ ok: false, error: 'Bad response' }));
  if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
  return d;
}
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

/* ---------- boot ---------- */
async function boot() {
  let me;
  try { me = await apiGet('me'); } catch (e) { root().innerHTML = '<div class="boot">Could not reach the server.</div>'; return; }
  state.csrf = me.csrf; state.settings = me.settings || {}; state.cur = me.settings?.currency || '$'; state.imap = !!me.settings?.imap_available;
  if (me.setup_needed) { renderSetup(); return; }
  if (!me.user) { renderLogin(); return; }
  state.user = me.user;
  renderShell();
  if (!location.hash) location.hash = 'dashboard';
  route();
}
window.addEventListener('hashchange', route);

/* ---------- setup + login ---------- */
function renderSetup() {
  root().innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <div class="brand"><div class="dot">F</div> Fivedock CRM</div>
    <h1>Welcome</h1><p class="sub">Create the first administrator account for your CRM.</p>
    <div id="msg"></div>
    <form id="f">
      <label class="fld"><span>Organisation / company name</span><input name="org_name" placeholder="My Company" required></label>
      <label class="fld"><span>Your name</span><input name="name" required autocomplete="name"></label>
      <div class="formgrid">
        <label class="fld"><span>Username</span><input name="username" required autocomplete="username"></label>
        <label class="fld"><span>Email</span><input name="email" type="email" autocomplete="email"></label>
      </div>
      <label class="fld"><span>Password (min 8 chars)</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn" style="width:100%" type="submit">Create account &amp; sign in</button>
    </form></div></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    try { await apiPost('setup', b); location.reload(); }
    catch (err) { $('#msg').innerHTML = `<div class="badge red" style="display:block;padding:9px;margin-bottom:12px">${esc(err.message)}</div>`; }
  };
}
function renderLogin() {
  root().innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <div class="brand"><div class="dot">F</div> Fivedock CRM</div>
    <h1>Sign in</h1><p class="sub">Welcome back.</p>
    <div id="msg"></div>
    <form id="f">
      <label class="fld"><span>Username or email</span><input name="username" required autocomplete="username"></label>
      <label class="fld"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn" style="width:100%" type="submit">Sign in</button>
    </form></div></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    try { await apiPost('login', b); location.reload(); }
    catch (err) { $('#msg').innerHTML = `<div class="badge red" style="display:block;padding:9px;margin-bottom:12px">${esc(err.message)}</div>`; }
  };
}

/* ---------- shell ---------- */
const NAV = [
  ['dashboard', 'Dashboard', '▦'],
  ['GRP', 'CRM'],
  ['contacts', 'Contacts', '👤'],
  ['companies', 'Companies', '🏢'],
  ['pipeline', 'Pipeline', '📊'],
  ['activities', 'Tasks & activity', '✅'],
  ['GRP', 'Email'],
  ['inbox', 'Inbox', '📥'],
  ['GRP', 'Admin'],
  ['settings', 'Settings', '⚙️'],
];
function renderShell() {
  const admin = state.user.role === 'admin';
  let nav = '';
  for (const n of NAV) {
    if (n[0] === 'GRP') { nav += `<div class="grp">${esc(n[1])}</div>`; continue; }
    if ((n[0] === 'settings') && !admin) { /* users still see settings for My account */ }
    nav += `<a class="nav" data-r="${n[0]}"><span class="ico">${n[2]}</span>${esc(n[1])}</a>`;
  }
  root().innerHTML = `<div class="shell">
    <nav class="sidebar">
      <div class="brand"><div class="dot">F</div> ${esc(state.settings.org_name || 'Fivedock CRM')}</div>
      ${nav}
      <div class="foot">${esc(APPV())}</div>
    </nav>
    <main class="main" id="view"><div class="boot">Loading...</div></main>
  </div>`;
  $$('.sidebar .nav').forEach((a) => (a.onclick = () => (location.hash = a.dataset.r)));
}
function APPV() { return 'Fivedock CRM - free, self-hosted'; }
const view = () => $('#view');
function setActive(r) { $$('.sidebar .nav').forEach((a) => a.classList.toggle('on', a.dataset.r === r)); }
function topbar(title, sub) {
  return `<div class="topbar"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
    <div class="spacer"></div>
    <div class="userchip" id="me"><div class="av">${esc(initials(state.user.name))}</div><div style="font-size:13px">${esc(state.user.name)}<div class="muted" style="font-size:11px">${esc(state.user.role)}</div></div></div></div>`;
}
function wireTopbar() { const m = $('#me'); if (m) m.onclick = openMyAccount; }

const ROUTES = {};
function route() {
  if (!state.user) return;
  const raw = (location.hash.slice(1) || 'dashboard');
  const [name, arg] = raw.split('/');
  setActive(name);
  const fn = ROUTES[name] || ROUTES.dashboard;
  if (view()) view().innerHTML = '<div class="boot">Loading...</div>';
  Promise.resolve(fn(arg)).then(wireTopbar).catch((e) => { if (view()) view().innerHTML = topbar('Error') + `<div class="card"><div class="bd">${esc(e.message)}</div></div>`; wireTopbar(); });
}

/* ---------- dashboard ---------- */
ROUTES.dashboard = async () => {
  const d = (await apiGet('dashboard')).data;
  const kpi = (l, v, c) => `<div class="kpi"><div class="bar" style="background:${c}"></div><div class="lab">${l}</div><div class="val">${v}</div></div>`;
  const recent = d.recent.map((a) => `<tr><td>${typeBadge(a.type)}</td><td>${esc(a.subject)}</td><td>${a.first_name ? esc(a.first_name + ' ' + (a.last_name || '')) : '<span class="muted">-</span>'}</td><td class="muted">${esc(dt(a.created_at))}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No activity yet.</td></tr>';
  view().innerHTML = topbar('Dashboard', state.settings.org_name) + `
    <div class="grid cols-4">
      ${kpi('Contacts', d.contacts, 'var(--brand)')}
      ${kpi('Open deals', d.open_deals, 'var(--accent)')}
      ${kpi('Pipeline value', money(d.pipeline_value), 'var(--info)')}
      ${kpi('Tasks due', d.tasks_due, d.tasks_due ? 'var(--bad)' : 'var(--good)')}
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><div class="hd"><h3>Recent activity</h3></div><div class="tablewrap"><table class="tbl"><tbody>${recent}</tbody></table></div></div>
      <div class="card"><div class="hd"><h3>Open pipeline by stage</h3></div><div class="bd">${d.by_stage.map((s) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)"><span>${esc(s.name)} <span class="muted">(${s.n})</span></span><b>${money(s.val)}</b></div>`).join('') || '<div class="muted">No open deals.</div>'}
        <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:800"><span>Won (all time)</span><span>${money(d.won_value)}</span></div></div></div>
    </div>`;
};
function typeBadge(t) {
  const m = { call: ['Call', 'blue'], meeting: ['Meeting', 'brand'], task: ['Task', 'amber'], note: ['Note', ''], email: ['Email', 'green'] };
  const x = m[t] || [t, '']; return `<span class="badge ${x[1]}">${esc(x[0])}</span>`;
}

/* ---------- contacts ---------- */
ROUTES.contacts = async (arg) => {
  if (arg) return contactDetail(+arg);
  const q = contactsQ || '';
  const d = (await apiGet('contacts' + (q ? '&q=' + encodeURIComponent(q) : ''))).data;
  view().innerHTML = topbar('Contacts', d.length + ' total') + `
    <div class="toolbar"><input class="search" id="q" placeholder="Search contacts..." value="${esc(q)}">
      <div class="spacer"></div>
      <a class="btn ghost sm" href="${API}export&type=contacts">Export CSV</a>
      <button class="btn" id="new">+ Contact</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Tags</th></tr></thead><tbody>
    ${d.map((c) => `<tr class="clk" data-id="${c.id}"><td><b>${esc((c.first_name || '') + ' ' + (c.last_name || ''))}</b>${c.title ? `<div class="muted" style="font-size:12px">${esc(c.title)}</div>` : ''}</td>
      <td>${esc(c.company || '')}</td><td>${esc(c.email || '')}</td><td>${esc(c.phone || '')}</td><td>${(c.tags || '').split(',').filter(Boolean).map((t) => `<span class="badge">${esc(t.trim())}</span>`).join(' ')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No contacts yet. Add your first one.</td></tr>'}
    </tbody></table></div></div>`;
  let timer; $('#q').oninput = (e) => { clearTimeout(timer); contactsQ = e.target.value; timer = setTimeout(() => ROUTES.contacts(), 300); };
  $('#new').onclick = () => contactForm(null);
  $$('#view tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = 'contacts/' + tr.dataset.id)));
};
let contactsQ = '';

async function contactForm(rec) {
  const companies = (await apiGet('companies')).data;
  openForm({
    title: rec ? 'Edit contact' : 'New contact',
    fields: [
      { key: 'first_name', label: 'First name', half: 1 },
      { key: 'last_name', label: 'Last name', half: 1 },
      { key: 'email', label: 'Email', type: 'email', half: 1 },
      { key: 'phone', label: 'Phone', half: 1 },
      { key: 'title', label: 'Job title', half: 1 },
      { key: 'company_id', label: 'Company', type: 'select', options: [['', '- none -'], ...companies.map((c) => [c.id, c.name])], half: 1 },
      { key: 'tags', label: 'Tags (comma separated)' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    rec: rec || {},
    onSave: async (x) => { const r = await apiPost('save-contact', x); toast('Saved', 'good'); closeModal(); location.hash = 'contacts/' + r.id; },
  });
}

async function contactDetail(id) {
  const c = (await apiGet('contact&id=' + id)).data;
  const name = esc((c.first_name || '') + ' ' + (c.last_name || ''));
  view().innerHTML = topbar(name.trim() || 'Contact', c.company || '') + `
    <div class="toolbar"><a class="btn ghost sm" href="#contacts">&larr; Contacts</a><div class="spacer"></div>
      ${c.email ? `<button class="btn sm" id="email">✉ Email</button>` : ''}
      <button class="btn ghost sm" id="task">+ Task</button>
      <button class="btn ghost sm" id="edit">Edit</button>
      <button class="btn danger sm" id="del">Delete</button></div>
    <div class="grid cols-2">
      <div class="card"><div class="hd"><h3>Details</h3></div><div class="bd"><dl class="dl">
        <dt>Email</dt><dd>${esc(c.email || '-')}</dd>
        <dt>Phone</dt><dd>${esc(c.phone || '-')}</dd>
        <dt>Title</dt><dd>${esc(c.title || '-')}</dd>
        <dt>Company</dt><dd>${c.company_id ? `<a href="#companies/${c.company_id}">${esc(c.company)}</a>` : '-'}</dd>
        <dt>Tags</dt><dd>${(c.tags || '').split(',').filter(Boolean).map((t) => `<span class="badge">${esc(t.trim())}</span>`).join(' ') || '-'}</dd>
        <dt>Notes</dt><dd style="white-space:pre-wrap">${esc(c.notes || '-')}</dd>
      </dl></div></div>
      <div class="card"><div class="hd"><h3>Deals</h3><div class="spacer"></div><button class="btn ghost sm" id="deal">+ Deal</button></div><div class="tablewrap"><table class="tbl"><tbody>
        ${(c.deals || []).map((d) => `<tr><td><b>${esc(d.title)}</b></td><td>${esc(d.stage || '')}</td><td class="r">${money(d.value)}</td></tr>`).join('') || '<tr><td class="empty">No deals.</td></tr>'}
      </tbody></table></div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="hd"><h3>Timeline</h3></div><div class="bd">
      ${(c.timeline || []).length ? `<ul class="tl">${c.timeline.map((a) => `<li><div class="ty">${esc(a.type)}${a.done == 1 ? ' - done' : (a.due_at ? ' - due ' + esc(dt(a.due_at)) : '')}</div><div class="su">${esc(a.subject)}</div>${a.body ? `<div class="bo">${esc(a.body)}</div>` : ''}<div class="dt">${esc(dt(a.created_at))}${a.owner ? ' - ' + esc(a.owner) : ''}</div></li>`).join('')}</ul>` : '<div class="muted">No activity logged yet.</div>'}
    </div></div>`;
  $('#edit').onclick = () => contactForm(c);
  $('#del').onclick = async () => { if (!confirm('Delete this contact and its activity?')) return; await apiPost('delete', { type: 'contact', id }); toast('Deleted'); location.hash = 'contacts'; };
  const eb = $('#email'); if (eb) eb.onclick = () => composeEmail({ to: c.email, contact_id: id, name: name });
  $('#task').onclick = () => activityForm({ contact_id: id, type: 'task' });
  $('#deal').onclick = () => dealForm({ contact_id: id, company_id: c.company_id });
};

/* ---------- companies ---------- */
ROUTES.companies = async (arg) => {
  if (arg) return companyDetail(+arg);
  const d = (await apiGet('companies')).data;
  view().innerHTML = topbar('Companies', d.length + ' total') + `
    <div class="toolbar"><input class="search" id="q" placeholder="Search companies..."><div class="spacer"></div>
      <a class="btn ghost sm" href="${API}export&type=companies">Export CSV</a>
      <button class="btn" id="new">+ Company</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Name</th><th>Website</th><th>Phone</th><th class="r">Contacts</th></tr></thead><tbody>
    ${d.map((c) => `<tr class="clk" data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.website || '')}</td><td>${esc(c.phone || '')}</td><td class="r">${c.contacts}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No companies yet.</td></tr>'}
    </tbody></table></div></div>`;
  let timer; $('#q').oninput = async (e) => { clearTimeout(timer); const q = e.target.value; timer = setTimeout(async () => {
    const r = (await apiGet('companies' + (q ? '&q=' + encodeURIComponent(q) : ''))).data;
    $('#view .tbl tbody').innerHTML = r.map((c) => `<tr class="clk" data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.website || '')}</td><td>${esc(c.phone || '')}</td><td class="r">${c.contacts}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No matches.</td></tr>';
    $$('#view tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = 'companies/' + tr.dataset.id)));
  }, 300); };
  $('#new').onclick = () => companyForm(null);
  $$('#view tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = 'companies/' + tr.dataset.id)));
};
function companyForm(rec) {
  openForm({
    title: rec ? 'Edit company' : 'New company',
    fields: [
      { key: 'name', label: 'Company name' },
      { key: 'website', label: 'Website', half: 1 }, { key: 'phone', label: 'Phone', half: 1 },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    rec: rec || {},
    onSave: async (x) => { const r = await apiPost('save-company', x); toast('Saved', 'good'); closeModal(); location.hash = 'companies/' + r.id; },
  });
}
async function companyDetail(id) {
  const c = (await apiGet('company&id=' + id)).data;
  view().innerHTML = topbar(c.name, c.website || '') + `
    <div class="toolbar"><a class="btn ghost sm" href="#companies">&larr; Companies</a><div class="spacer"></div>
      <button class="btn ghost sm" id="addc">+ Contact</button><button class="btn ghost sm" id="deal">+ Deal</button>
      <button class="btn ghost sm" id="edit">Edit</button><button class="btn danger sm" id="del">Delete</button></div>
    <div class="grid cols-2">
      <div class="card"><div class="hd"><h3>Details</h3></div><div class="bd"><dl class="dl">
        <dt>Website</dt><dd>${c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website)}</a>` : '-'}</dd>
        <dt>Phone</dt><dd>${esc(c.phone || '-')}</dd>
        <dt>Address</dt><dd style="white-space:pre-wrap">${esc(c.address || '-')}</dd>
        <dt>Notes</dt><dd style="white-space:pre-wrap">${esc(c.notes || '-')}</dd>
      </dl></div></div>
      <div class="card"><div class="hd"><h3>Contacts</h3></div><div class="tablewrap"><table class="tbl"><tbody>
        ${(c.contacts || []).map((p) => `<tr class="clk" data-cid="${p.id}"><td><b>${esc(p.first_name + ' ' + (p.last_name || ''))}</b></td><td>${esc(p.email || '')}</td><td>${esc(p.phone || '')}</td></tr>`).join('') || '<tr><td class="empty">No contacts.</td></tr>'}
      </tbody></table></div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="hd"><h3>Deals</h3></div><div class="tablewrap"><table class="tbl"><tbody>
      ${(c.deals || []).map((d) => `<tr><td><b>${esc(d.title)}</b></td><td>${esc(d.stage || '')}</td><td>${esc(d.status)}</td><td class="r">${money(d.value)}</td></tr>`).join('') || '<tr><td class="empty">No deals.</td></tr>'}
    </tbody></table></div></div>`;
  $('#edit').onclick = () => companyForm(c);
  $('#del').onclick = async () => { if (!confirm('Delete this company? Its contacts are kept but unlinked.')) return; await apiPost('delete', { type: 'company', id }); toast('Deleted'); location.hash = 'companies'; };
  $('#addc').onclick = () => contactForm({ company_id: id });
  $('#deal').onclick = () => dealForm({ company_id: id });
  $$('#view tr[data-cid]').forEach((tr) => (tr.onclick = () => (location.hash = 'contacts/' + tr.dataset.cid)));
};

/* ---------- pipeline (kanban) ---------- */
ROUTES.pipeline = async () => {
  const p = await apiGet('pipeline');
  const total = Object.values(p.deals).flat().reduce((a, d) => a + Number(d.value || 0), 0);
  view().innerHTML = topbar('Pipeline', money(total) + ' open across ' + Object.values(p.deals).flat().length + ' deals') + `
    <div class="toolbar"><div class="spacer"></div><a class="btn ghost sm" href="${API}export&type=deals">Export CSV</a><button class="btn" id="new">+ Deal</button></div>
    <div class="kanban" id="kb">${p.stages.map((st) => {
      const deals = p.deals[st.id] || []; const sum = deals.reduce((a, d) => a + Number(d.value || 0), 0);
      return `<div class="kcol" data-stage="${st.id}"><h4>${esc(st.name)} <span class="cnt">${deals.length} - ${money(sum)}</span></h4>
        <div class="kbody" data-stage="${st.id}">${deals.map(kcard).join('')}</div></div>`;
    }).join('')}</div>`;
  $('#new').onclick = () => dealForm(null);
  wireKanban();
};
function kcard(d) {
  const who = [d.company, (d.first_name ? d.first_name + ' ' + (d.last_name || '') : '')].filter(Boolean).join(' - ');
  return `<div class="kcard" draggable="true" data-id="${d.id}"><div class="t">${esc(d.title)}</div><div class="v">${money(d.value)}</div>${who ? `<div class="m">${esc(who)}</div>` : ''}${d.expected_close ? `<div class="m">close ${esc(d.expected_close)}</div>` : ''}</div>`;
}
function wireKanban() {
  let dragId = null;
  $$('#view .kcard').forEach((el) => {
    el.ondragstart = () => { dragId = el.dataset.id; el.classList.add('drag'); };
    el.ondragend = () => el.classList.remove('drag');
    el.onclick = () => openDeal(+el.dataset.id);
  });
  $$('#view .kcol').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async (e) => {
      e.preventDefault(); col.classList.remove('over');
      if (!dragId) return;
      try { await apiPost('deal-move', { id: +dragId, stage_id: +col.dataset.stage }); ROUTES.pipeline(); }
      catch (err) { toast(err.message, 'bad'); }
    };
  });
}
async function openDeal(id) {
  const p = await apiGet('pipeline');
  const d = Object.values(p.deals).flat().find((x) => x.id === id);
  if (d) dealForm(d);
}
async function dealForm(rec) {
  const [companies, contacts, stages] = [(await apiGet('companies')).data, (await apiGet('contacts')).data, (await apiGet('stages')).data];
  openForm({
    title: rec && rec.id ? 'Edit deal' : 'New deal',
    fields: [
      { key: 'title', label: 'Deal title' },
      { key: 'value', label: 'Value', type: 'number', half: 1 },
      { key: 'stage_id', label: 'Stage', type: 'select', options: stages.map((s) => [s.id, s.name]), half: 1 },
      { key: 'company_id', label: 'Company', type: 'select', options: [['', '- none -'], ...companies.map((c) => [c.id, c.name])], half: 1 },
      { key: 'contact_id', label: 'Contact', type: 'select', options: [['', '- none -'], ...contacts.map((c) => [c.id, (c.first_name || '') + ' ' + (c.last_name || '')])], half: 1 },
      { key: 'expected_close', label: 'Expected close', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    rec: rec || {},
    extra: rec && rec.id ? `<button type="button" class="btn danger sm" id="deldeal">Delete deal</button>` : '',
    onSave: async (x) => { await apiPost('save-deal', x); toast('Saved', 'good'); closeModal(); route(); },
    onRender: () => { const b = $('#deldeal'); if (b) b.onclick = async () => { if (!confirm('Delete this deal?')) return; await apiPost('delete', { type: 'deal', id: rec.id }); toast('Deleted'); closeModal(); route(); }; },
  });
}

/* ---------- activities ---------- */
ROUTES.activities = async () => {
  const d = (await apiGet('activities&view=open')).data;
  view().innerHTML = topbar('Tasks & activity', d.length + ' open') + `
    <div class="toolbar"><div class="spacer"></div><button class="btn" id="new">+ Activity</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th></th><th>Type</th><th>Subject</th><th>Contact</th><th>Due</th></tr></thead><tbody>
    ${d.map((a) => `<tr><td><input type="checkbox" class="done" data-id="${a.id}" ${a.done == 1 ? 'checked' : ''}></td>
      <td>${typeBadge(a.type)}</td><td class="clk" data-edit="${a.id}"><b>${esc(a.subject)}</b>${a.body ? `<div class="muted" style="font-size:12px;white-space:pre-wrap">${esc((a.body || '').slice(0, 120))}</div>` : ''}</td>
      <td>${a.first_name ? `<a href="#contacts/${a.contact_id}">${esc(a.first_name + ' ' + (a.last_name || ''))}</a>` : '<span class="muted">-</span>'}</td>
      <td>${a.due_at ? `<span class="${isOverdue(a.due_at) ? 'badge red' : 'muted'}">${esc(dt(a.due_at))}</span>` : '<span class="muted">-</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing open. Nice work.</td></tr>'}
    </tbody></table></div></div>`;
  $('#new').onclick = () => activityForm(null);
  $$('#view .done').forEach((cb) => (cb.onchange = async () => { await apiPost('activity-toggle', { id: +cb.dataset.id, done: cb.checked ? 1 : 0 }); toast(cb.checked ? 'Marked done' : 'Reopened', 'good'); ROUTES.activities(); }));
  $$('#view [data-edit]').forEach((td) => (td.onclick = async () => { const a = d.find((x) => x.id == td.dataset.edit); activityForm(a); }));
};
function isOverdue(s) { return new Date(String(s).replace(' ', 'T')) < new Date(); }
async function activityForm(rec) {
  const contacts = (await apiGet('contacts')).data;
  openForm({
    title: rec && rec.id ? 'Edit activity' : 'New activity',
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: [['task', 'Task'], ['call', 'Call'], ['meeting', 'Meeting'], ['note', 'Note'], ['email', 'Email (log)']], half: 1 },
      { key: 'due_at', label: 'Due', type: 'datetime-local', half: 1 },
      { key: 'subject', label: 'Subject' },
      { key: 'contact_id', label: 'Contact', type: 'select', options: [['', '- none -'], ...contacts.map((c) => [c.id, (c.first_name || '') + ' ' + (c.last_name || '')])] },
      { key: 'body', label: 'Details', type: 'textarea' },
      { key: 'done', label: 'Completed', type: 'checkbox' },
    ],
    rec: rec || { type: 'task' },
    onSave: async (x) => { await apiPost('save-activity', x); toast('Saved', 'good'); closeModal(); route(); },
  });
}

/* ---------- email compose ---------- */
async function composeEmail(opts) {
  let accounts = [];
  try { accounts = (await apiGet('email-accounts')).data || []; } catch (e) { accounts = []; }
  if (state.user.role !== 'admin') { /* non-admins may still send if accounts exist; list is admin-only, so fetch may 403 */ }
  if (!accounts.length) {
    // non-admins can't list; show a generic send with account chosen server-side is not possible, so require admin setup
    openModal('Email', `<div class="bd"><p>No sending account is available. An administrator needs to add an email account under Settings &rarr; Email accounts first.</p></div>`, '');
    return;
  }
  const activeAccts = accounts.filter((a) => a.active == 1);
  openForm({
    title: 'Email ' + (opts.name || opts.to || ''),
    wide: 1,
    fields: [
      { key: 'account_id', label: 'From account', type: 'select', options: activeAccts.map((a) => [a.id, a.label + ' <' + a.from_email + '>']) },
      { key: 'to', label: 'To' },
      { key: 'subject', label: 'Subject' },
      { key: 'body', label: 'Message', type: 'textarea', big: 1 },
    ],
    rec: { to: opts.to || '', contact_id: opts.contact_id || 0 },
    saveLabel: 'Send email',
    onSave: async (x) => { x.contact_id = opts.contact_id || 0; await apiPost('send-email', x); toast('Email sent', 'good'); closeModal(); if (location.hash.startsWith('#contacts/')) route(); },
  });
}

/* ---------- inbox ---------- */
ROUTES.inbox = async () => {
  view().innerHTML = topbar('Inbox', 'Read replies from your mail accounts');
  let accounts = [];
  try { accounts = (await apiGet('email-accounts')).data || []; } catch (e) {
    view().innerHTML = topbar('Inbox') + `<div class="card"><div class="bd">Only administrators can view the inbox. Ask an admin, or sign in as one.</div></div>`; return;
  }
  const withImap = accounts.filter((a) => a.imap_host && a.active == 1);
  if (!state.imap) {
    view().innerHTML = topbar('Inbox') + `<div class="card"><div class="bd"><p>Reading mail needs the PHP <code>imap</code> extension, which is not installed on this server.</p><p class="muted" style="margin-top:8px">Sending email still works. To enable the inbox, install php-imap and restart PHP.</p></div></div>`; return;
  }
  if (!withImap.length) {
    view().innerHTML = topbar('Inbox') + `<div class="card"><div class="bd">No email account has IMAP configured. Add IMAP details under Settings &rarr; Email accounts, then come back.</div></div>`; return;
  }
  view().innerHTML = topbar('Inbox') + `<div class="toolbar"><select class="search" id="acct" style="max-width:320px">${withImap.map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}</select><button class="btn ghost sm" id="refresh">Refresh</button></div><div id="msgs"><div class="boot">Loading mail...</div></div>`;
  const load = async () => {
    $('#msgs').innerHTML = '<div class="boot">Loading mail...</div>';
    try {
      const r = await apiGet('inbox&account_id=' + $('#acct').value);
      $('#msgs').innerHTML = `<div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>From</th><th>Subject</th><th>Date</th></tr></thead><tbody>
        ${(r.messages || []).map((m) => `<tr><td>${m.seen ? '' : '<b>&bull;</b> '}${esc(m.from)}</td><td>${esc(m.subject)}</td><td class="muted">${esc(m.date)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Inbox is empty.</td></tr>'}
      </tbody></table></div></div>`;
    } catch (e) { $('#msgs').innerHTML = `<div class="card"><div class="bd badge red" style="display:block">${esc(e.message)}</div></div>`; }
  };
  $('#acct').onchange = load; $('#refresh').onclick = load; load();
};

/* ---------- settings ---------- */
ROUTES.settings = async () => {
  const admin = state.user.role === 'admin';
  const tabs = admin ? [['general', 'General'], ['users', 'Users'], ['email', 'Email accounts'], ['account', 'My account']] : [['account', 'My account']];
  view().innerHTML = topbar('Settings') + `<div class="pill-tabs" id="tabs">${tabs.map((t, i) => `<button class="${i === 0 ? 'on' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="panel"></div>`;
  const draw = (t) => { $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); SETTINGS[t](); };
  $$('#tabs button').forEach((b) => (b.onclick = () => draw(b.dataset.t)));
  draw(tabs[0][0]);
};
const SETTINGS = {};
SETTINGS.general = async () => {
  $('#panel').innerHTML = `<div class="card" style="max-width:520px"><div class="hd"><h3>Organisation</h3></div><div class="bd">
    <label class="fld"><span>Organisation name</span><input id="org" value="${esc(state.settings.org_name || '')}"></label>
    <label class="fld"><span>Currency symbol</span><input id="cur" value="${esc(state.settings.currency || '$')}" style="max-width:120px"></label>
    <button class="btn" id="save">Save</button></div></div>`;
  $('#save').onclick = async () => { await apiPost('save-settings', { org_name: $('#org').value, currency: $('#cur').value }); state.settings.org_name = $('#org').value; state.settings.currency = $('#cur').value; state.cur = $('#cur').value || '$'; toast('Saved', 'good'); renderShell(); route(); };
};
SETTINGS.users = async () => {
  const d = (await apiGet('users')).data;
  $('#panel').innerHTML = `<div class="toolbar"><div class="spacer"></div><button class="btn" id="new">+ User</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
    ${d.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td class="mono">${esc(u.username)}</td><td>${esc(u.email || '')}</td><td><span class="badge ${u.role === 'admin' ? 'brand' : ''}">${esc(u.role)}</span></td><td>${u.active == 1 ? '<span class="badge green">active</span>' : '<span class="badge">off</span>'}</td>
      <td><div class="btnrow"><button class="btn ghost sm" data-eu="${u.id}">Edit</button>${u.id != state.user.id ? `<button class="btn danger sm" data-du="${u.id}">✕</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div></div>`;
  $('#new').onclick = () => userForm(null);
  $$('[data-eu]').forEach((b) => (b.onclick = () => userForm(d.find((x) => x.id == b.dataset.eu))));
  $$('[data-du]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this user?')) return; try { await apiPost('delete', { type: 'user', id: +b.dataset.du }); toast('Deleted'); SETTINGS.users(); } catch (e) { toast(e.message, 'bad'); } }));
};
function userForm(rec) {
  openForm({
    title: rec ? 'Edit user' : 'New user',
    fields: [
      { key: 'name', label: 'Name', half: 1 }, { key: 'username', label: 'Username', half: 1 },
      { key: 'email', label: 'Email', type: 'email', half: 1 },
      { key: 'role', label: 'Role', type: 'select', options: [['user', 'User'], ['admin', 'Admin']], half: 1 },
      { key: 'password', label: rec ? 'New password (blank = keep)' : 'Password (min 8)', type: 'password' },
      { key: 'active', label: 'Active', type: 'checkbox', def: 1 },
    ],
    rec: rec || { active: 1, role: 'user' },
    onSave: async (x) => { await apiPost('save-user', x); toast('Saved', 'good'); closeModal(); SETTINGS.users(); },
  });
}
SETTINGS.email = async () => {
  const r = await apiGet('email-accounts'); const d = r.data;
  $('#panel').innerHTML = `<div class="card" style="margin-bottom:14px"><div class="bd muted" style="font-size:13px">Email is sent only through the accounts you add here (your own SMTP server). Fivedock CRM never relays mail for you. ${r.imap_available ? 'IMAP inbox reading is available on this server.' : 'The PHP imap extension is not installed, so inbox reading is off (sending still works).'}</div></div>
    <div class="toolbar"><div class="spacer"></div><button class="btn" id="new">+ Email account</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Label</th><th>From</th><th>SMTP</th><th>IMAP</th><th>Status</th><th></th></tr></thead><tbody>
    ${d.map((a) => `<tr><td><b>${esc(a.label)}</b></td><td>${esc(a.from_email)}</td><td class="mono">${esc(a.smtp_host || '-')}:${a.smtp_port}</td><td class="mono">${esc(a.imap_host || '-')}</td><td>${a.active == 1 ? '<span class="badge green">active</span>' : '<span class="badge">off</span>'}</td>
      <td><div class="btnrow"><button class="btn ghost sm" data-test="${a.id}">Test</button><button class="btn ghost sm" data-ea="${a.id}">Edit</button><button class="btn danger sm" data-da="${a.id}">✕</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No email accounts yet. Add one to send mail.</td></tr>'}
    </tbody></table></div></div>`;
  $('#new').onclick = () => emailAccountForm(null);
  $$('[data-ea]').forEach((b) => (b.onclick = () => emailAccountForm(d.find((x) => x.id == b.dataset.ea))));
  $$('[data-da]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this email account?')) return; await apiPost('delete', { type: 'email_account', id: +b.dataset.da }); toast('Deleted'); SETTINGS.email(); }));
  $$('[data-test]').forEach((b) => (b.onclick = async () => { b.disabled = true; b.textContent = 'Sending...'; try { const r = await apiPost('test-email-account', { id: +b.dataset.test }); toast(r.message || 'Sent', 'good'); } catch (e) { toast(e.message, 'bad'); } b.disabled = false; b.textContent = 'Test'; }));
};
function emailAccountForm(rec) {
  openForm({
    title: rec ? 'Edit email account' : 'New email account',
    wide: 1,
    fields: [
      { key: 'label', label: 'Label', half: 1 }, { key: 'active', label: 'Active', type: 'checkbox', def: 1, half: 1 },
      { key: 'from_name', label: 'From name', half: 1 }, { key: 'from_email', label: 'From email', type: 'email', half: 1 },
      { key: '_h1', label: 'Sending (SMTP)', type: 'heading' },
      { key: 'smtp_host', label: 'SMTP host', half: 1 }, { key: 'smtp_port', label: 'Port', type: 'number', def: 587, half: 1 },
      { key: 'smtp_secure', label: 'Security', type: 'select', options: [['tls', 'STARTTLS (587)'], ['ssl', 'SSL/TLS (465)'], ['none', 'None']], half: 1 },
      { key: 'smtp_user', label: 'Username', half: 1 },
      { key: 'smtp_pass', label: rec ? 'Password (blank = keep)' : 'Password', type: 'password' },
      { key: '_h2', label: 'Receiving (IMAP) - optional', type: 'heading' },
      { key: 'imap_host', label: 'IMAP host', half: 1 }, { key: 'imap_port', label: 'Port', type: 'number', def: 993, half: 1 },
      { key: 'imap_secure', label: 'Security', type: 'select', options: [['ssl', 'SSL/TLS (993)'], ['tls', 'STARTTLS (143)'], ['none', 'None']], half: 1 },
      { key: 'imap_user', label: 'Username', half: 1 },
      { key: 'imap_pass', label: rec ? 'Password (blank = keep)' : 'Password', type: 'password' },
    ],
    rec: rec || { active: 1, smtp_port: 587, smtp_secure: 'tls', imap_port: 993, imap_secure: 'ssl' },
    onSave: async (x) => { await apiPost('save-email-account', x); toast('Saved', 'good'); closeModal(); SETTINGS.email(); },
  });
}
SETTINGS.account = async () => {
  $('#panel').innerHTML = `<div class="card" style="max-width:520px"><div class="hd"><h3>Change password</h3></div><div class="bd">
    <label class="fld"><span>Current password</span><input id="cur" type="password" autocomplete="current-password"></label>
    <label class="fld"><span>New password (min 8)</span><input id="new" type="password" autocomplete="new-password"></label>
    <button class="btn" id="save">Change password</button>
    <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><button class="btn ghost" id="logout">Sign out</button></div>
  </div></div>`;
  $('#save').onclick = async () => { try { await apiPost('change-password', { current: $('#cur').value, password: $('#new').value }); toast('Password changed', 'good'); $('#cur').value = $('#new').value = ''; } catch (e) { toast(e.message, 'bad'); } };
  $('#logout').onclick = async () => { await apiPost('logout', {}); location.reload(); };
};
function openMyAccount() { location.hash = 'settings'; }

/* ---------- modal + generic form ---------- */
function openModal(title, bodyHtml, footHtml) {
  $('#modal-root').innerHTML = `<div class="modal-bg" id="mbg"><div class="modal"><div class="mh"><h3>${esc(title)}</h3><button class="x" id="mx">&times;</button></div>${bodyHtml}${footHtml || ''}</div></div>`;
  $('#mx').onclick = closeModal;
  $('#mbg').onclick = (e) => { if (e.target.id === 'mbg') closeModal(); };
}
function closeModal() { $('#modal-root').innerHTML = ''; }
function field(f, rec) {
  const v = rec[f.key] != null ? rec[f.key] : (f.def != null ? f.def : '');
  if (f.type === 'heading') return `<div style="font-weight:700;margin:6px 0 10px;color:var(--brand-d)">${esc(f.label)}</div>`;
  let inner;
  if (f.type === 'textarea') inner = `<textarea name="${f.key}"${f.big ? ' style="min-height:170px"' : ''}>${esc(v)}</textarea>`;
  else if (f.type === 'select') inner = `<select name="${f.key}">${f.options.map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.type === 'checkbox') inner = `<label style="display:flex;align-items:center;gap:8px;font-weight:500"><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''} style="width:auto"> ${esc(f.label)}</label>`;
  else inner = `<input type="${f.type || 'text'}" name="${f.key}" value="${esc(v)}">`;
  if (f.type === 'checkbox') return `<div class="fld" ${f.half ? 'data-half="1"' : ''}>${inner}</div>`;
  return `<label class="fld" ${f.half ? 'data-half="1"' : ''}><span>${esc(f.label)}</span>${inner}</label>`;
}
function openForm({ title, fields, rec = {}, onSave, saveLabel, extra, onRender, wide }) {
  // group half-width fields into rows
  let html = '<form id="mform"><div class="mb">';
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.half && fields[i + 1] && fields[i + 1].half) { html += `<div class="formgrid">${field(f, rec)}${field(fields[i + 1], rec)}</div>`; i += 2; }
    else { html += field(f, rec); i++; }
  }
  html += `</div><div class="mf">${extra || ''}<button type="button" class="btn ghost" id="mcancel">Cancel</button><button type="submit" class="btn">${esc(saveLabel || 'Save')}</button></div></form>`;
  $('#modal-root').innerHTML = `<div class="modal-bg" id="mbg"><div class="modal" ${wide ? 'style="max-width:640px"' : ''}><div class="mh"><h3>${esc(title)}</h3><button class="x" id="mx">&times;</button></div>${html}</div></div>`;
  $('#mx').onclick = closeModal; $('#mcancel').onclick = closeModal;
  $('#mbg').onclick = (e) => { if (e.target.id === 'mbg') closeModal(); };
  if (onRender) onRender();
  $('#mform').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target); const out = { ...rec };
    for (const f of fields) {
      if (f.type === 'heading') continue;
      if (f.type === 'checkbox') out[f.key] = fd.get(f.key) ? 1 : 0;
      else out[f.key] = fd.get(f.key);
    }
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Saving...';
    try { await onSave(out); } catch (err) { toast(err.message, 'bad'); btn.disabled = false; btn.textContent = saveLabel || 'Save'; }
  };
}

boot();
