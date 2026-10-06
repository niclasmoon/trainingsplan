'use strict';
const KEY = 'beastmode_v1';
const app = document.getElementById('app');
let plan = null;
let state = load();
let view = { name: 'home' };
let openEx = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.history) return s;
  } catch (e) {}
  return { history: [], current: null };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
function ago(iso) {
  const d = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
  return d <= 0 ? 'HEUTE' : d === 1 ? 'GESTERN' : `VOR ${d} TAGEN`;
}
const dayById = (id) => plan.days.find(d => d.id === id);

function lastDone(dayId) {
  for (let i = state.history.length - 1; i >= 0; i--) if (state.history[i].day === dayId) return state.history[i];
  return null;
}
// Nächstes Training = der Tag nach dem zuletzt gemachten (Rotation)
function nextDayId() {
  if (!state.history.length) return plan.days[0].id;
  const last = state.history[state.history.length - 1].day;
  const i = plan.days.findIndex(d => d.id === last);
  return plan.days[(i + 1) % plan.days.length].id;
}
// letzter Eintrag mit echten Werten für diese Übung (neue Übung -> null -> Start bei Null)
function lastEntry(exId) {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const e = state.history[i].entries[exId];
    if (e && e.sets.some(s => s.kg !== '' || s.reps !== '')) return { date: state.history[i].date, sets: e.sets };
  }
  return null;
}

/* ---------- HOME ---------- */
function renderHome() {
  const nx = nextDayId();
  const cur = state.current;
  app.innerHTML = '';
  app.append($(`<div class="hero"><h1 class="grad-text">${esc(plan.title)}</h1><p>${esc(plan.tagline)}</p></div>`));
  if (cur && dayById(cur.day)) {
    const r = $(`<button class="resume"><b>▶ ${esc(dayById(cur.day).name)}</b> läuft noch – weitermachen</button>`);
    r.onclick = () => go({ name: 'workout', day: cur.day });
    app.append(r);
  }
  const wrap = $('<div class="days"></div>');
  plan.days.forEach(d => {
    const ld = lastDone(d.id);
    const b = $(`<button class="day ${d.id === nx ? 'next' : ''}">
      <div class="nm">${esc(d.name)}</div>
      <div class="fc">${esc(d.focus || '')}</div>
      <div class="meta"><span class="lastd">${ld ? `ZULETZT: <b>${ago(ld.date)}</b> (${fmtDate(ld.date)})` : 'NOCH NIE GEMACHT'}</span>
      ${d.id === nx ? '<span class="badge">Als Nächstes</span>' : `<span>${d.exercises.length} Übungen</span>`}</div>
    </button>`);
    b.onclick = () => startDay(d.id);
    wrap.append(b);
  });
  app.append(wrap);
  const foot = $('<div class="foot"><button id="exp">Daten sichern</button><button id="imp">Daten laden</button></div>');
  foot.querySelector('#exp').onclick = exportData;
  foot.querySelector('#imp').onclick = importData;
  app.append(foot);
}

function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
  a.download = 'beastmode-backup.json';
  a.click();
}
function importData() {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = 'application/json,.json';
  i.onchange = async () => {
    try {
      const s = JSON.parse(await i.files[0].text());
      if (!s.history) throw 0;
      state = s; save(); renderHome();
    } catch (e) { alert('Datei konnte nicht gelesen werden.'); }
  };
  i.click();
}

/* ---------- WORKOUT ---------- */
function startDay(dayId) {
  if (!state.current || state.current.day !== dayId) {
    if (state.current && !confirm('Ein anderes Training läuft noch. Verwerfen und neues starten?')) return;
    state.current = { day: dayId, started: new Date().toISOString(), done: {}, sets: {} };
    save();
  }
  openEx = null;
  go({ name: 'workout', day: dayId });
}

function renderWorkout() {
  const d = dayById(view.day);
  const cur = state.current;
  app.innerHTML = '';
  const total = d.exercises.length;
  const nDone = d.exercises.filter(e => cur.done[e.id]).length;
  const top = $(`<div class="top"><button class="back">‹</button><h2 class="grad-text">${esc(d.name)}</h2><div class="prog">${nDone}/${total}</div></div>`);
  top.querySelector('.back').onclick = () => go({ name: 'home' });
  app.append(top);
  app.append($(`<div class="bar"><i style="width:${total ? nDone / total * 100 : 0}%"></i></div>`));

  if (openEx === null) {
    const first = d.exercises.find(e => !cur.done[e.id]);
    openEx = first ? first.id : '';
  }
  // offene Übungen zuerst, erledigte rutschen nach unten
  const ordered = [...d.exercises.filter(e => !cur.done[e.id]), ...d.exercises.filter(e => cur.done[e.id])];
  ordered.forEach(ex => app.append(exCard(d, ex, d.exercises.indexOf(ex) + 1)));

  const fin = $('<button class="btn red finish">Training beenden</button>');
  fin.onclick = () => {
    if (nDone < total && !confirm(`Erst ${nDone} von ${total} Übungen erledigt. Trotzdem beenden?`)) return;
    finish(d);
  };
  app.append(fin);
}

function exCard(d, ex, idx) {
  const cur = state.current;
  const isDone = !!cur.done[ex.id];
  const isOpen = openEx === ex.id;
  const n = Math.max(1, +ex.sets || 1);
  const saved = cur.sets[ex.id] || [];
  const last = lastEntry(ex.id);
  const el = $(`<div class="ex ${isDone ? 'done' : ''} ${isOpen ? 'open' : ''}">
    <button class="ex-h"><div class="num">${isDone ? '✓' : idx}</div>
      <div class="t"><b>${esc(ex.name)}</b><span>${n} Sätze × ${esc(ex.reps)} Wdh</span></div><div class="chev">▼</div></button>
    <div class="ex-body"></div></div>`);
  el.querySelector('.ex-h').onclick = () => { openEx = isOpen ? '' : ex.id; renderWorkout(); };
  if (!isOpen) return el;
  const body = el.querySelector('.ex-body');

  const pics = $('<div class="pics"></div>');
  if (ex.images && ex.images.length) {
    ex.images.forEach(im => {
      const src = typeof im === 'string' ? im : im.src;
      const label = typeof im === 'string' ? '' : (im.label || '');
      const p = $(`<div class="pic"><img src="${esc(src)}" alt="${esc(label || ex.name)}" loading="lazy">${label ? `<em>${esc(label)}</em>` : ''}</div>`);
      p.onclick = () => openLightbox(src, label);
      pics.append(p);
    });
  } else pics.append($('<div class="pic ph">BILD FOLGT</div>'));
  body.append(pics);

  body.append($(`<div class="target"><div class="pill"><b>${n}</b><span>Sätze</span></div><div class="pill r"><b>${esc(ex.reps)}</b><span>Wiederholungen</span></div></div>`));
  if (ex.note) body.append($(`<div class="note">${esc(ex.note)}</div>`));

  if (last) {
    const txt = last.sets.map((s, i) => (s.kg !== '' || s.reps !== '') ? `S${i + 1}: ${s.kg !== '' ? s.kg : '–'} kg × ${s.reps !== '' ? s.reps : '–'}` : null).filter(Boolean).join(' &nbsp;|&nbsp; ');
    body.append($(`<div class="last"><div class="lh">LETZTES MAL · ${fmtDate(last.date)}</div>${txt}</div>`));
  } else {
    body.append($('<div class="last new">NEUE ÜBUNG – noch kein Vergleichswert. Mach ihn zum Startwert!</div>'));
  }

  const sets = $('<div class="sets"></div>');
  for (let i = 0; i < n; i++) {
    const v = saved[i] || { kg: '', reps: '' };
    const ph = last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null;
    const row = $(`<div class="set"><div class="sl">SATZ ${i + 1}</div>
      <div class="fld"><input inputmode="decimal" data-k="kg" placeholder="${ph && ph.kg !== '' ? esc(ph.kg) : '0'}" value="${esc(v.kg)}"><u>kg</u></div>
      <div class="fld"><input inputmode="numeric" data-k="reps" placeholder="${ph && ph.reps !== '' ? esc(ph.reps) : '0'}" value="${esc(v.reps)}"><u>Wdh</u></div></div>`);
    row.querySelectorAll('input').forEach(inp => inp.oninput = () => {
      const arr = cur.sets[ex.id] || (cur.sets[ex.id] = []);
      for (let j = 0; j < n; j++) arr[j] = arr[j] || { kg: '', reps: '' };
      arr[i][inp.dataset.k] = inp.value.replace(',', '.');
      save();
    });
    sets.append(row);
  }
  body.append(sets);

  const btn = $(`<button class="btn">${isDone ? 'Wieder öffnen' : 'Übung erledigt ✓'}</button>`);
  btn.onclick = () => {
    if (isDone) { delete cur.done[ex.id]; openEx = ex.id; }
    else {
      cur.done[ex.id] = true;
      const next = d.exercises.find(e => !cur.done[e.id]);
      openEx = next ? next.id : '';
    }
    save(); renderWorkout();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  body.append(btn);
  return el;
}

function finish(d) {
  const cur = state.current;
  const entries = {};
  d.exercises.forEach(ex => {
    const n = Math.max(1, +ex.sets || 1);
    const sets = [];
    for (let i = 0; i < n; i++) {
      const s = (cur.sets[ex.id] || [])[i] || {};
      sets.push({ kg: s.kg ?? '', reps: s.reps ?? '' });
    }
    if (cur.done[ex.id] || sets.some(s => s.kg !== '' || s.reps !== '')) entries[ex.id] = { done: !!cur.done[ex.id], sets };
  });
  const rec = { date: new Date().toISOString(), day: d.id, entries };
  state.history.push(rec);
  state.current = null;
  save();
  go({ name: 'win', rec });
}

function renderWin() {
  const rec = view.rec;
  const d = dayById(rec.day);
  const rows = d.exercises.filter(e => rec.entries[e.id]).map(e => {
    const s = rec.entries[e.id].sets.filter(x => x.kg !== '' || x.reps !== '');
    return `<div>${esc(e.name)}<span>${s.length ? s.length + ' Sätze' : 'erledigt'}</span></div>`;
  }).join('');
  app.innerHTML = '';
  const w = $(`<div class="win"><h1 class="grad-text">${esc(d.name)}<br>GEKNACKT.</h1><p>Training gespeichert · Stark!</p>
    <div class="sum">${rows}</div><button class="btn">Zur Startseite</button></div>`);
  w.querySelector('.btn').onclick = () => go({ name: 'home' });
  app.append(w);
}

/* ---------- LIGHTBOX ---------- */
function openLightbox(src, cap) {
  const lb = document.getElementById('lightbox');
  lb.querySelector('img').src = src;
  document.getElementById('lb-cap').textContent = cap || '';
  lb.hidden = false;
  lb.onclick = () => { lb.hidden = true; };
}

/* ---------- ROUTER ---------- */
function go(v) { view = v; render(); window.scrollTo(0, 0); }
function render() {
  if (view.name === 'workout' && state.current) renderWorkout();
  else if (view.name === 'win') renderWin();
  else renderHome();
}

fetch('plan.json?t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.json())
  .then(p => { plan = p; render(); })
  .catch(() => { app.innerHTML = '<div class="hero"><h1 class="grad-text">OFFLINE</h1><p>Plan konnte nicht geladen werden.</p></div>'; });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
