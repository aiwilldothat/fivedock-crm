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
  ['GRP', 'Sales'],
  ['quotes', 'Quotes', '🧾'],
  ['invoices', 'Invoices', '💰'],
  ['GRP', 'Inventory'],
  ['items', 'Items', '📦'],
  ['suppliers', 'Suppliers', '🚚'],
  ['purchases', 'Purchase Orders', '📥'],
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
    <div class="grid cols-4" style="margin-top:16px">
      ${kpi('Open invoices', d.erp.open_invoices, 'var(--brand)')}
      ${kpi('Unpaid', money(d.erp.unpaid_total), d.erp.unpaid_total > 0 ? 'var(--accent)' : 'var(--good)')}
      ${kpi('Revenue (paid)', money(d.erp.revenue), 'var(--good)')}
      ${kpi('Low stock', d.erp.low_stock, d.erp.low_stock > 0 ? 'var(--bad)' : 'var(--good)')}
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

/* =================================================================
 * CORE ERP - items/inventory, sales (quotes/invoices), purchasing
 * ================================================================= */

/* ---- Items ---- */
ROUTES.items = async (arg) => {
  if (arg) return itemDetail(+arg);
  const d = (await apiGet('items')).data;
  view().innerHTML = topbar('Items', d.length + ' total') + `
    <div class="toolbar"><input class="search" id="q" placeholder="Search items..."><div class="spacer"></div>
      <a class="btn ghost sm" href="${API}export&type=items">Export CSV</a><button class="btn" id="new">+ Item</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th class="r">Price</th><th class="r">Cost</th><th class="r">On hand</th><th>Status</th></tr></thead><tbody>
    ${d.map(itemRow).join('') || '<tr><td colspan="7" class="empty">No items yet. Add products or services to sell and buy.</td></tr>'}
    </tbody></table></div></div>`;
  let timer; $('#q').oninput = (e) => { clearTimeout(timer); const q = e.target.value; timer = setTimeout(async () => { const r = (await apiGet('items' + (q ? '&q=' + encodeURIComponent(q) : ''))).data; $('#view .tbl tbody').innerHTML = r.map(itemRow).join('') || '<tr><td colspan="7" class="empty">No matches.</td></tr>'; wireRows('items'); }, 300); };
  $('#new').onclick = () => itemForm(null);
  wireRows('items');
};
function itemRow(i) {
  const low = i.type === 'stock' && i.reorder_level > 0 && (+i.qty) <= (+i.reorder_level);
  return `<tr class="clk" data-id="${i.id}"><td class="mono">${esc(i.code)}</td><td><b>${esc(i.name)}</b></td><td>${i.type === 'service' ? 'Service' : 'Stock'}</td><td class="r">${money(i.price)}</td><td class="r">${money(i.cost)}</td><td class="r">${i.type === 'service' ? '<span class="muted">-</span>' : ((+i.qty).toFixed(2) + (low ? ' <span class="badge red">low</span>' : ''))}</td><td>${i.active == 1 ? '<span class="badge green">active</span>' : '<span class="badge">off</span>'}</td></tr>`;
}
function wireRows(hash) { $$('#view tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = hash + '/' + tr.dataset.id))); }
async function itemDetail(id) {
  const i = (await apiGet('item&id=' + id)).data;
  view().innerHTML = topbar(i.name, 'Item ' + i.code) + `
    <div class="toolbar"><a class="btn ghost sm" href="#items">&larr; Items</a><div class="spacer"></div>
      ${i.type === 'stock' ? '<button class="btn ghost sm" id="adj">Adjust stock</button>' : ''}
      <button class="btn ghost sm" id="edit">Edit</button><button class="btn danger sm" id="del">Delete</button></div>
    <div class="grid cols-2">
      <div class="card"><div class="hd"><h3>Details</h3></div><div class="bd"><dl class="dl">
        <dt>Type</dt><dd>${i.type === 'service' ? 'Service' : 'Stock'}</dd>
        <dt>Sell price</dt><dd>${money(i.price)} / ${esc(i.unit)}</dd>
        <dt>Cost</dt><dd>${money(i.cost)}</dd>
        <dt>Tax rate</dt><dd>${(+i.tax_rate).toFixed(2)}%</dd>
        ${i.type === 'stock' ? `<dt>On hand</dt><dd><b>${(+i.qty).toFixed(2)}</b> ${esc(i.unit)}</dd><dt>Reorder level</dt><dd>${(+i.reorder_level).toFixed(2)}</dd>` : ''}
        <dt>Description</dt><dd style="white-space:pre-wrap">${esc(i.description || '-')}</dd>
      </dl></div></div>
      <div class="card"><div class="hd"><h3>Stock movements</h3></div><div class="tablewrap"><table class="tbl"><tbody>
        ${(i.moves || []).map((m) => `<tr><td>${esc(dt(m.created_at))}</td><td>${esc(m.reason)}${m.ref ? ' <span class="muted">' + esc(m.ref) + '</span>' : ''}</td><td class="r" style="color:${m.qty_change >= 0 ? 'var(--good)' : 'var(--bad)'}">${m.qty_change >= 0 ? '+' : ''}${(+m.qty_change).toFixed(2)}</td></tr>`).join('') || '<tr><td class="empty">No movements.</td></tr>'}
      </tbody></table></div></div>
    </div>`;
  $('#edit').onclick = () => itemForm(i);
  $('#del').onclick = async () => { if (!confirm('Delete this item?')) return; try { await apiPost('delete', { type: 'item', id }); toast('Deleted'); location.hash = 'items'; } catch (e) { toast(e.message, 'bad'); } };
  const a = $('#adj'); if (a) a.onclick = () => stockAdjustForm(i);
}
function itemForm(rec) {
  const isNew = !rec;
  openForm({
    title: rec ? 'Edit item' : 'New item',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code (auto if blank)', half: 1 },
      { key: 'type', label: 'Type', type: 'select', options: [['stock', 'Stock (tracked)'], ['service', 'Service']], half: 1 },
      { key: 'price', label: 'Sell price', type: 'number', half: 1 }, { key: 'cost', label: 'Cost', type: 'number', half: 1 },
      { key: 'tax_rate', label: 'Tax rate %', type: 'number', half: 1 }, { key: 'unit', label: 'Unit', half: 1, def: 'ea' },
      { key: 'reorder_level', label: 'Reorder level', type: 'number', half: 1 },
      ...(isNew ? [{ key: 'qty', label: 'Opening qty', type: 'number', half: 1 }] : []),
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'active', label: 'Active', type: 'checkbox', def: 1 },
    ],
    rec: rec || { type: 'stock', unit: 'ea', active: 1, tax_rate: Number(state.settings.tax_rate || 0) },
    onSave: async (x) => { const r = await apiPost('save-item', x); toast('Saved', 'good'); closeModal(); if (rec) itemDetail(rec.id); else location.hash = 'items/' + r.id; },
  });
}
function stockAdjustForm(i) {
  openForm({
    title: 'Adjust stock - ' + i.name,
    fields: [
      { key: 'qty_change', label: 'Quantity change (use minus to reduce)', type: 'number' },
      { key: 'reason', label: 'Reason', def: 'Adjustment' },
    ],
    rec: {},
    onSave: async (x) => { x.item_id = i.id; await apiPost('stock-adjust', x); toast('Stock adjusted', 'good'); closeModal(); itemDetail(i.id); },
  });
}

/* ---- Suppliers ---- */
ROUTES.suppliers = async () => {
  const d = (await apiGet('suppliers')).data;
  view().innerHTML = topbar('Suppliers', d.length + ' total') + `
    <div class="toolbar"><input class="search" id="q" placeholder="Search suppliers..."><div class="spacer"></div><button class="btn" id="new">+ Supplier</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th></th></tr></thead><tbody>
    ${d.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.email || '')}</td><td>${esc(s.phone || '')}</td><td class="r"><div class="btnrow" style="justify-content:flex-end"><button class="btn ghost sm" data-ed="${s.id}">Edit</button><button class="btn danger sm" data-dl="${s.id}">✕</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No suppliers yet.</td></tr>'}
    </tbody></table></div></div>`;
  $('#new').onclick = () => supplierForm(null);
  let timer; $('#q').oninput = (e) => { clearTimeout(timer); const q = e.target.value; timer = setTimeout(async () => { const r = (await apiGet('suppliers' + (q ? '&q=' + encodeURIComponent(q) : ''))).data; $('#view .tbl tbody').innerHTML = r.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.email || '')}</td><td>${esc(s.phone || '')}</td><td class="r"><div class="btnrow" style="justify-content:flex-end"><button class="btn ghost sm" data-ed="${s.id}">Edit</button><button class="btn danger sm" data-dl="${s.id}">✕</button></div></td></tr>`).join(''); wireSup(r); }, 300); };
  wireSup(d);
  function wireSup(list) {
    $$('[data-ed]').forEach((b) => (b.onclick = () => supplierForm(list.find((x) => x.id == b.dataset.ed))));
    $$('[data-dl]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this supplier?')) return; await apiPost('delete', { type: 'supplier', id: +b.dataset.dl }); toast('Deleted'); ROUTES.suppliers(); }));
  }
};
function supplierForm(rec) {
  openForm({
    title: rec ? 'Edit supplier' : 'New supplier',
    fields: [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email', type: 'email', half: 1 }, { key: 'phone', label: 'Phone', half: 1 }, { key: 'address', label: 'Address', type: 'textarea' }, { key: 'notes', label: 'Notes', type: 'textarea' }],
    rec: rec || {},
    onSave: async (x) => { await apiPost('save-supplier', x); toast('Saved', 'good'); closeModal(); ROUTES.suppliers(); },
  });
}

/* ---- Sales (quotes + invoices) ---- */
ROUTES.quotes = () => salesList('quote');
ROUTES.invoices = () => salesList('invoice');
async function salesList(type) {
  const title = type === 'quote' ? 'Quotes' : 'Invoices';
  const d = (await apiGet('sales&type=' + type)).data;
  view().innerHTML = topbar(title, d.length + ' total') + `
    <div class="toolbar"><div class="spacer"></div>
      ${type === 'invoice' ? `<a class="btn ghost sm" href="${API}export&type=invoices">Export CSV</a>` : ''}
      <button class="btn" id="new">+ ${type === 'quote' ? 'Quote' : 'Invoice'}</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Status</th><th class="r">Total</th>${type === 'invoice' ? '<th class="r">Owing</th>' : ''}</tr></thead><tbody>
    ${d.map((x) => `<tr class="clk" data-id="${x.id}"><td class="mono"><b>${esc(x.number)}</b></td><td>${esc(x.company || (x.first_name ? x.first_name + ' ' + (x.last_name || '') : '-'))}</td><td>${esc(x.issue_date || '')}</td><td>${salesBadge(x.status)}</td><td class="r">${money(x.total)}</td>${type === 'invoice' ? `<td class="r">${money((+x.total) - (+x.paid))}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${type === 'invoice' ? 6 : 5}" class="empty">No ${title.toLowerCase()} yet.</td></tr>`}
    </tbody></table></div></div>`;
  $('#new').onclick = () => (location.hash = 'sales/new-' + type);
  wireRows('sales');
}
function salesBadge(s) {
  const m = { draft: ['Draft', 'amber'], sent: ['Sent', 'blue'], paid: ['Paid', 'green'], cancelled: ['Cancelled', 'red'], converted: ['Converted', 'brand'] };
  const x = m[s] || [s, '']; return `<span class="badge ${x[1]}">${esc(x[0])}</span>`;
}
ROUTES.sales = (arg) => {
  if (arg === 'new-quote') return salesEditor(null, 'quote');
  if (arg === 'new-invoice') return salesEditor(null, 'invoice');
  return salesEditor(+arg, null);
};
async function salesEditor(id, type) {
  const [companies, contacts, items] = [(await apiGet('companies')).data, (await apiGet('contacts')).data, (await apiGet('items')).data];
  let doc = { doc_type: type, status: 'draft', issue_date: todayISO(), company_id: '', contact_id: '', notes: '', lines: [] };
  if (id) { doc = (await apiGet('sales-doc&id=' + id)).data; type = doc.doc_type; }
  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  let L = (doc.lines || []).map((l) => ({ item_id: l.item_id || '', description: l.description, qty: +l.qty, price: +l.price, tax_rate: +l.tax_rate }));
  if (!L.length) L.push({ item_id: '', description: '', qty: 1, price: 0, tax_rate: Number(state.settings.tax_rate || 0) });
  const label = type === 'quote' ? 'Quote' : 'Invoice';
  const owing = id ? (+doc.total - +doc.paid) : 0;
  view().innerHTML = topbar((id ? doc.number : 'New ' + label), '') + `
    <div class="toolbar"><a class="btn ghost sm" href="#${type === 'quote' ? 'quotes' : 'invoices'}">&larr; ${type === 'quote' ? 'Quotes' : 'Invoices'}</a><div class="spacer"></div>
      ${id ? `<button class="btn ghost sm" id="print">Print</button>` : ''}
      ${id && type === 'quote' && doc.status !== 'converted' ? `<button class="btn ghost sm" id="convert">Convert to invoice</button>` : ''}
      ${id && type === 'invoice' ? `<button class="btn ghost sm" id="fulfil">${doc.fulfilled == 1 ? 'Unfulfil (restore stock)' : 'Fulfil (reduce stock)'}</button>` : ''}
      ${id && type === 'invoice' && owing > 0.001 ? `<button class="btn good sm" id="pay">Record payment</button>` : ''}
      ${id ? `<button class="btn danger sm" id="del">Delete</button>` : ''}
    </div>
    <div class="card"><div class="bd">
      <div class="formgrid">
        <label class="fld"><span>Customer (company)</span><select id="company_id"><option value="">- none -</option>${companies.map((c) => `<option value="${c.id}" ${c.id == doc.company_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fld"><span>Contact</span><select id="contact_id"><option value="">- none -</option>${contacts.map((c) => `<option value="${c.id}" ${c.id == doc.contact_id ? 'selected' : ''}>${esc((c.first_name || '') + ' ' + (c.last_name || ''))}</option>`).join('')}</select></label>
        <label class="fld"><span>Issue date</span><input id="issue_date" type="date" value="${esc((doc.issue_date || '').slice(0, 10))}"></label>
        <label class="fld"><span>${type === 'quote' ? 'Valid until' : 'Due date'}</span><input id="due_date" type="date" value="${esc((doc.due_date || '').slice(0, 10))}"></label>
      </div>
      <div class="tablewrap"><table class="tbl" id="lt"><thead><tr><th style="min-width:160px">Item</th><th>Description</th><th class="r" style="width:70px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:70px">Tax%</th><th class="r" style="width:100px">Amount</th><th style="width:30px"></th></tr></thead><tbody id="lb"></tbody></table></div>
      <button class="btn ghost sm" id="addline" style="margin-top:8px">+ Line</button>
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><div style="min-width:240px">
        <div style="display:flex;justify-content:space-between;padding:4px 0"><span class="muted">Subtotal</span><b id="t_sub">${money(0)}</b></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0"><span class="muted">Tax</span><b id="t_tax">${money(0)}</b></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--line);font-size:17px"><b>Total</b><b id="t_tot">${money(0)}</b></div>
        ${id && type === 'invoice' ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="muted">Paid</span><b>${money(doc.paid)}</b></div>` : ''}
      </div></div>
      <label class="fld" style="margin-top:12px"><span>Notes</span><textarea id="notes">${esc(doc.notes || '')}</textarea></label>
      <button class="btn" id="save">${id ? 'Save' : 'Create ' + label}</button>
    </div></div>`;
  const lb = $('#lb');
  const renderLines = () => {
    lb.innerHTML = L.map((l, idx) => `<tr data-i="${idx}">
      <td><select data-f="item_id"><option value="">- custom -</option>${items.map((i) => `<option value="${i.id}" ${i.id == l.item_id ? 'selected' : ''}>${esc(i.code)} ${esc(i.name)}</option>`).join('')}</select></td>
      <td><input data-f="description" value="${esc(l.description)}"></td>
      <td><input data-f="qty" type="number" step="any" value="${l.qty}" class="r"></td>
      <td><input data-f="price" type="number" step="any" value="${l.price}" class="r"></td>
      <td><input data-f="tax_rate" type="number" step="any" value="${l.tax_rate}" class="r"></td>
      <td class="r" data-lt>${money(l.qty * l.price)}</td>
      <td><button class="btn ghost sm" data-rm>✕</button></td></tr>`).join('');
    lb.querySelectorAll('tr').forEach((tr) => {
      const i = +tr.dataset.i;
      tr.querySelectorAll('[data-f]').forEach((inp) => (inp.oninput = inp.onchange = () => {
        const f = inp.dataset.f;
        L[i][f] = (f === 'item_id' || f === 'description') ? inp.value : (parseFloat(inp.value) || 0);
        if (f === 'item_id' && inp.value && itemsById[inp.value]) { const it = itemsById[inp.value]; L[i].description = it.name; L[i].price = +it.price; L[i].tax_rate = +it.tax_rate; renderLines(); }
        recompute();
      }));
      tr.querySelector('[data-rm]').onclick = () => { L.splice(i, 1); if (!L.length) L.push({ item_id: '', description: '', qty: 1, price: 0, tax_rate: 0 }); renderLines(); recompute(); };
    });
    recompute();
  };
  const recompute = () => {
    let sub = 0, tax = 0;
    lb.querySelectorAll('tr').forEach((tr) => { const l = L[+tr.dataset.i]; const lt = (l.qty || 0) * (l.price || 0); tr.querySelector('[data-lt]').textContent = money(lt); sub += lt; tax += lt * (l.tax_rate || 0) / 100; });
    $('#t_sub').textContent = money(sub); $('#t_tax').textContent = money(tax); $('#t_tot').textContent = money(sub + tax);
  };
  renderLines();
  $('#addline').onclick = () => { L.push({ item_id: '', description: '', qty: 1, price: 0, tax_rate: Number(state.settings.tax_rate || 0) }); renderLines(); };
  $('#save').onclick = async () => {
    const payload = { id: id || 0, doc_type: type, company_id: $('#company_id').value, contact_id: $('#contact_id').value, issue_date: $('#issue_date').value, due_date: $('#due_date').value, notes: $('#notes').value, status: doc.status || 'draft', lines: L };
    try { const r = await apiPost('save-sales', payload); toast('Saved', 'good'); location.hash = 'sales/' + r.id; if (id) salesEditor(r.id, null); } catch (e) { toast(e.message, 'bad'); }
  };
  const btn = (sel, fn) => { const b = $(sel); if (b) b.onclick = fn; };
  btn('#print', () => salesPrint(id));
  btn('#del', async () => { if (!confirm('Delete this document? Any stock it fulfilled is restored.')) return; await apiPost('delete', { type: 'sales_doc', id }); toast('Deleted'); location.hash = type === 'quote' ? 'quotes' : 'invoices'; });
  btn('#convert', async () => { if (!confirm('Create an invoice from this quote?')) return; const r = await apiPost('sales-convert', { id }); toast('Invoice created', 'good'); location.hash = 'sales/' + r.id; salesEditor(r.id, null); });
  btn('#fulfil', async () => { try { await apiPost('sales-fulfil', { id, on: doc.fulfilled == 1 ? 0 : 1 }); toast('Stock updated', 'good'); salesEditor(id, null); } catch (e) { toast(e.message, 'bad'); } });
  btn('#pay', () => openForm({ title: 'Record payment', fields: [{ key: 'amount', label: 'Amount', type: 'number', def: owing.toFixed(2) }], rec: {}, saveLabel: 'Record', onSave: async (x) => { x.id = id; await apiPost('sales-payment', x); toast('Payment recorded', 'good'); closeModal(); salesEditor(id, null); } }));
}
async function salesPrint(id) {
  const d = (await apiGet('sales-doc&id=' + id)).data;
  const org = esc(state.settings.org_name || 'Company');
  const cust = esc(d.company || ((d.first_name || '') + ' ' + (d.last_name || '')) || '');
  const rows = (d.lines || []).map((l) => `<tr><td>${esc(l.description)}</td><td style="text-align:right">${(+l.qty).toFixed(2)}</td><td style="text-align:right">${money(l.price)}</td><td style="text-align:right">${money(l.line_total)}</td></tr>`).join('');
  const label = d.doc_type === 'quote' ? 'QUOTE' : 'INVOICE';
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.number)}</title>
    <style>body{font-family:Arial,sans-serif;color:#10202a;max-width:720px;margin:30px auto;padding:0 20px}h1{color:#0e7c86;margin:0}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.tot{display:flex;justify-content:flex-end;margin-top:14px}.tot div{min-width:220px}.row{display:flex;justify-content:space-between;padding:4px 0}.hd{display:flex;justify-content:space-between;align-items:flex-start}</style></head><body>
    <div class="hd"><div><h1>${org}</h1><div style="color:#5b6b76">1 Katherine St, Chatswood NSW 2067</div></div><div style="text-align:right"><h2 style="margin:0">${label}</h2><div><b>${esc(d.number)}</b></div><div style="color:#5b6b76">${esc(d.issue_date || '')}</div></div></div>
    <div style="margin-top:20px"><b>To:</b> ${cust}</div>
    <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><div><div class="row"><span>Subtotal</span><span>${money(d.subtotal)}</span></div><div class="row"><span>Tax</span><span>${money(d.tax)}</span></div><div class="row" style="font-weight:bold;border-top:2px solid #0e7c86;padding-top:6px"><span>Total</span><span>${money(d.total)}</span></div></div></div>
    ${d.notes ? `<p style="margin-top:20px;color:#5b6b76;white-space:pre-wrap">${esc(d.notes)}</p>` : ''}
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

/* ---- Purchasing ---- */
ROUTES.purchases = (arg) => {
  if (arg === 'new') return purchaseEditor(null);
  if (arg) return purchaseEditor(+arg);
  return purchaseList();
};
async function purchaseList() {
  const d = (await apiGet('purchases')).data;
  view().innerHTML = topbar('Purchase Orders', d.length + ' total') + `
    <div class="toolbar"><div class="spacer"></div><button class="btn" id="new">+ Purchase Order</button></div>
    <div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Number</th><th>Supplier</th><th>Date</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
    ${d.map((x) => `<tr class="clk" data-id="${x.id}"><td class="mono"><b>${esc(x.number)}</b></td><td>${esc(x.supplier || '-')}</td><td>${esc(x.order_date || '')}</td><td>${poBadge(x.status)}</td><td class="r">${money(x.total)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No purchase orders yet.</td></tr>'}
    </tbody></table></div></div>`;
  $('#new').onclick = () => (location.hash = 'purchases/new');
  wireRows('purchases');
}
function poBadge(s) { const m = { draft: ['Draft', 'amber'], ordered: ['Ordered', 'blue'], received: ['Received', 'green'], cancelled: ['Cancelled', 'red'] }; const x = m[s] || [s, '']; return `<span class="badge ${x[1]}">${esc(x[0])}</span>`; }
async function purchaseEditor(id) {
  const [suppliers, items] = [(await apiGet('suppliers')).data, (await apiGet('items')).data];
  let doc = { supplier_id: '', status: 'draft', order_date: todayISO(), notes: '', lines: [], received: 0 };
  if (id) doc = (await apiGet('purchase&id=' + id)).data;
  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  let L = (doc.lines || []).map((l) => ({ item_id: l.item_id || '', description: l.description, qty: +l.qty, price: +l.price }));
  if (!L.length) L.push({ item_id: '', description: '', qty: 1, price: 0 });
  view().innerHTML = topbar(id ? doc.number : 'New Purchase Order', '') + `
    <div class="toolbar"><a class="btn ghost sm" href="#purchases">&larr; Purchase Orders</a><div class="spacer"></div>
      ${id ? `<button class="btn ghost sm" id="recv">${doc.received == 1 ? 'Un-receive (reduce stock)' : 'Receive (add to stock)'}</button><button class="btn danger sm" id="del">Delete</button>` : ''}</div>
    <div class="card"><div class="bd">
      <div class="formgrid">
        <label class="fld"><span>Supplier</span><select id="supplier_id"><option value="">- none -</option>${suppliers.map((s) => `<option value="${s.id}" ${s.id == doc.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="fld"><span>Order date</span><input id="order_date" type="date" value="${esc((doc.order_date || '').slice(0, 10))}"></label>
      </div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th style="min-width:160px">Item</th><th>Description</th><th class="r" style="width:80px">Qty</th><th class="r" style="width:100px">Price</th><th class="r" style="width:110px">Amount</th><th style="width:30px"></th></tr></thead><tbody id="lb"></tbody></table></div>
      <button class="btn ghost sm" id="addline" style="margin-top:8px">+ Line</button>
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><div style="min-width:220px"><div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--line);font-size:17px"><b>Total</b><b id="t_tot">${money(0)}</b></div></div></div>
      <label class="fld" style="margin-top:12px"><span>Notes</span><textarea id="notes">${esc(doc.notes || '')}</textarea></label>
      <button class="btn" id="save">${id ? 'Save' : 'Create PO'}</button>
    </div></div>`;
  const lb = $('#lb');
  const renderLines = () => {
    lb.innerHTML = L.map((l, idx) => `<tr data-i="${idx}">
      <td><select data-f="item_id"><option value="">- custom -</option>${items.map((i) => `<option value="${i.id}" ${i.id == l.item_id ? 'selected' : ''}>${esc(i.code)} ${esc(i.name)}</option>`).join('')}</select></td>
      <td><input data-f="description" value="${esc(l.description)}"></td>
      <td><input data-f="qty" type="number" step="any" value="${l.qty}" class="r"></td>
      <td><input data-f="price" type="number" step="any" value="${l.price}" class="r"></td>
      <td class="r" data-lt>${money(l.qty * l.price)}</td>
      <td><button class="btn ghost sm" data-rm>✕</button></td></tr>`).join('');
    lb.querySelectorAll('tr').forEach((tr) => {
      const i = +tr.dataset.i;
      tr.querySelectorAll('[data-f]').forEach((inp) => (inp.oninput = inp.onchange = () => {
        const f = inp.dataset.f; L[i][f] = (f === 'item_id' || f === 'description') ? inp.value : (parseFloat(inp.value) || 0);
        if (f === 'item_id' && inp.value && itemsById[inp.value]) { L[i].description = itemsById[inp.value].name; L[i].price = +itemsById[inp.value].cost; renderLines(); }
        recompute();
      }));
      tr.querySelector('[data-rm]').onclick = () => { L.splice(i, 1); if (!L.length) L.push({ item_id: '', description: '', qty: 1, price: 0 }); renderLines(); recompute(); };
    });
    recompute();
  };
  const recompute = () => { let t = 0; lb.querySelectorAll('tr').forEach((tr) => { const l = L[+tr.dataset.i]; const lt = (l.qty || 0) * (l.price || 0); tr.querySelector('[data-lt]').textContent = money(lt); t += lt; }); $('#t_tot').textContent = money(t); };
  renderLines();
  $('#addline').onclick = () => { L.push({ item_id: '', description: '', qty: 1, price: 0 }); renderLines(); };
  $('#save').onclick = async () => { try { const r = await apiPost('save-purchase', { id: id || 0, supplier_id: $('#supplier_id').value, order_date: $('#order_date').value, notes: $('#notes').value, status: doc.status || 'draft', lines: L }); toast('Saved', 'good'); location.hash = 'purchases/' + r.id; purchaseEditor(r.id); } catch (e) { toast(e.message, 'bad'); } };
  const rb = $('#recv'); if (rb) rb.onclick = async () => { try { await apiPost('purchase-receive', { id, on: doc.received == 1 ? 0 : 1 }); toast('Stock updated', 'good'); purchaseEditor(id); } catch (e) { toast(e.message, 'bad'); } };
  const db2 = $('#del'); if (db2) db2.onclick = async () => { if (!confirm('Delete this PO? Any received stock is reversed.')) return; await apiPost('delete', { type: 'purchase_doc', id }); toast('Deleted'); location.hash = 'purchases'; };
}

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
