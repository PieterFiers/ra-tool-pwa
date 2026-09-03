// RA Tool PWA v2 — app.js (offline, geen AI)

const BUILD = 'v6-2026-09-03';

// ─── State ───────────────────────────────────────────────────────────────────
let projects = JSON.parse(localStorage.getItem('ra_projects') || '[]');
let currentProjectId = null;
let currentGevaarId = null;
let currentStep = 1;
const TOTAL_STEPS = 4;
let currentPhotos = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function saveProjects() {
  try {
    localStorage.setItem('ra_projects', JSON.stringify(projects));
    return true;
  } catch (e) {
    logError(`saveProjects() faalde: ${e.message}`);
    alert('Opslaan mislukt: het opslaggeheugen van dit toestel zit vol. Maak eerst ruimte vrij (verwijder een oud project) of gebruik "Kopieer naar PC" om je huidige data veilig te stellen voor je verdergaat.');
    return false;
  }
}
function currentProject() {
  return projects.find(p => p.id === currentProjectId);
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function riskScore(e, b, w) {
  const v = parseFloat(e) * parseFloat(b) * parseFloat(w);
  return isNaN(v) ? null : Math.round(v * 10) / 10;
}
function riskClass(r) {
  if (!r) return '';
  if (r <= 20) return 'risk-low';
  if (r <= 70) return 'risk-med';
  if (r <= 200) return 'risk-high';
  return 'risk-crit';
}
function riskLabel(r) {
  if (!r) return '';
  if (r <= 20) return 'Laag';
  if (r <= 70) return 'Matig';
  if (r <= 200) return 'Hoog';
  return 'Kritiek';
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function gv(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

// ─── INDEXEDDB (fotoblobs + foutlog) ──────────────────────────────────────────
const IDB_NAME = 'ra-tool-db';
const IDB_VERSION = 1;
const IDB_STORE_PHOTOS = 'photos';
const IDB_STORE_ERRORS = 'errors';
const ERROR_LOG_MAX = 5;

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB niet beschikbaar')); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_PHOTOS)) db.createObjectStore(IDB_STORE_PHOTOS);
      if (!db.objectStoreNames.contains(IDB_STORE_ERRORS)) db.createObjectStore(IDB_STORE_ERRORS, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbCount(storeName) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })).catch(() => 0);
}

function idbPut(storeName, key, value) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGet(storeName, key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function idbDel(storeName, key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  }));
}

function idbKeys(storeName) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })).catch(() => []);
}

// dataURL ("data:image/jpeg;base64,...") omzetten naar een Blob, voor migratie
// van bestaande base64-foto's en voor de export vanuit legacy/terugval-data.
function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// fotoId -> objectURL. Levensduur is de paginasessie; wordt opgeruimd bij
// verwijderen van een foto/gevaar/project of bij opruimenWeesfotos().
const photoUrlCache = new Map();

function trimErrorLog(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE_ERRORS, 'readwrite');
    const store = tx.objectStore(IDB_STORE_ERRORS);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      const overflow = req.result.length - ERROR_LOG_MAX;
      if (overflow > 0) req.result.slice(0, overflow).forEach(k => store.delete(k));
    };
    tx.oncomplete = resolve;
    tx.onerror = () => resolve();
  });
}

async function logError(message) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_ERRORS, 'readwrite');
      tx.objectStore(IDB_STORE_ERRORS).add({ message: String(message).slice(0, 500), time: new Date().toISOString() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await trimErrorLog(db);
  } catch (e) {
    // best effort — een foutlogger mag zelf nooit een fout gooien
  }
}

function getLastErrors() {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_ERRORS, 'readonly');
    const req = tx.objectStore(IDB_STORE_ERRORS).getAll();
    req.onsuccess = () => resolve(req.result.slice(-ERROR_LOG_MAX).reverse());
    req.onerror = () => reject(req.error);
  })).catch(() => []);
}

// ─── GLOBALE FOUTAFVANGING ─────────────────────────────────────────────────────
window.addEventListener('error', (e) => {
  logError(e.error ? (e.error.stack || e.error.message) : e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  logError(r && r.stack ? r.stack : (r && r.message ? r.message : String(r)));
});

// ─── Screen navigation ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active', 'slide-out');
  });
  const target = document.getElementById(id);
  if (id !== 'screen-home') document.getElementById('screen-home').classList.add('slide-out');
  if (id === 'screen-gevaar') document.getElementById('screen-project').classList.add('slide-out');
  setTimeout(() => target.classList.add('active'), 10);
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────
function renderHome() {
  const list = document.getElementById('project-list');
  if (projects.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:2rem 1rem;color:var(--text-hint);font-size:14px">Geen projecten gevonden.<br>Maak een nieuw project aan.</div>`;
    return;
  }
  list.innerHTML = projects.map(p => {
    const initials = p.naam.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const count = (p.gevaren || []).length;
    const high = (p.gevaren || []).filter(g => {
      const r = riskScore(g.E, g.B, g.W);
      return r && r > 70;
    }).length;
    return `<div class="project-card" data-id="${p.id}">
      <div class="project-icon">${initials}</div>
      <div class="project-info">
        <div class="project-name">${esc(p.naam)}</div>
        <div class="project-meta">${esc(p.locatie || '')}${p.locatie && p.datum ? ' · ' : ''}${p.datum || ''} · ${count} gevaar${count !== 1 ? 's' : ''}${high > 0 ? ` · <span style="color:var(--red);font-weight:700">${high} hoog</span>` : ''}</div>
      </div>
      <svg class="project-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`;
  }).join('');
  list.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      currentProjectId = card.dataset.id;
      openProject();
    });
  });
}

function openProject() {
  const proj = currentProject();
  if (!proj) return;
  document.getElementById('nav-project-naam').textContent = proj.naam;
  renderProjectStats();
  renderGevaren();
  showScreen('screen-project');
}

function renderProjectStats() {
  const proj = currentProject();
  const gevaren = proj.gevaren || [];
  const high = gevaren.filter(g => { const r = riskScore(g.E, g.B, g.W); return r && r > 70; }).length;
  const reduced = gevaren.filter(g => g.E2 && g.B2 && g.W2).length;
  document.getElementById('project-stats').innerHTML = `
    <div class="stat-box"><div class="stat-value">${gevaren.length}</div><div class="stat-label">Gevaren</div></div>
    <div class="stat-box"><div class="stat-value" style="color:${high > 0 ? '#ff8a80' : 'white'}">${high}</div><div class="stat-label">Hoog risico</div></div>
    <div class="stat-box"><div class="stat-value">${reduced}</div><div class="stat-label">Gereduceerd</div></div>
  `;
}

function renderGevaren() {
  const proj = currentProject();
  const gevaren = proj.gevaren || [];
  const list = document.getElementById('gevaren-list');
  const empty = document.getElementById('empty-project');
  if (gevaren.length === 0) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  list.classList.remove('hidden');
  empty.classList.add('hidden');
  list.innerHTML = gevaren.map((g, i) => {
    const r1 = riskScore(g.E, g.B, g.W);
    const r2 = riskScore(g.E2, g.B2, g.W2);
    const hasPhoto = g.photos && g.photos.length > 0;
    return `<div class="gevaar-card" data-gid="${g.id}">
      <div class="gevaar-card-top">
        <div class="gevaar-nr">${i + 1}</div>
        <div class="gevaar-info">
          <div class="gevaar-soort">${esc(g.soortGevaar || '–')}</div>
          <div class="gevaar-oorzaak">${esc(g.oorzaak || g.scenario || '(geen oorzaak)')}</div>
          ${g.gebruiksfase ? `<div class="gevaar-scenario" style="color:var(--blue-mid)">${esc(g.gebruiksfase)}</div>` : ''}
        </div>
        ${hasPhoto ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="color:var(--text-hint);flex-shrink:0"><path d="M2 4h2l1-1h6l1 1h2a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8.5" r="1.8" stroke="currentColor" stroke-width="1.2"/></svg>` : ''}
      </div>
      <div class="gevaar-badges">
        ${g.soortGevaar ? `<span class="badge-soort">${esc(g.soortGevaar)}</span>` : ''}
        ${r1 !== null ? `<span class="risk-badge ${riskClass(r1)}">R: ${r1}</span>` : ''}
        ${r2 !== null ? `<span class="risk-badge ${riskClass(r2)}" style="opacity:0.8">R2: ${r2}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.gevaar-card').forEach(card => {
    card.addEventListener('click', () => openGevaar(card.dataset.gid));
  });
}

// ─── GEBRUIKSFASE STRIP ───────────────────────────────────────────────────────
function renderFaseStrip(selected) {
  const strip = document.getElementById('fase-strip');
  if (!strip) return;
  strip.innerHTML = GEBRUIKSFASEN.map(f =>
    `<span class="fase-tag${selected === f ? ' selected' : ''}" data-fase="${esc(f)}">${esc(f)}</span>`
  ).join('');
  strip.querySelectorAll('.fase-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const val = tag.dataset.fase;
      const current = document.getElementById('f1-gebruiksfase').value;
      document.getElementById('f1-gebruiksfase').value = (current === val) ? '' : val;
      renderFaseStrip(document.getElementById('f1-gebruiksfase').value);
    });
  });
}

// ─── GEVAAR FORM ──────────────────────────────────────────────────────────────
// Haalt voor elke foto de blob uit IndexedDB op en maakt er een objectURL van
// (hergebruikt via photoUrlCache). Foto's die al een dataUrl hebben (legacy of
// terugval-opslag) blijven ongewijzigd.
async function loadPhotos(photos) {
  const result = [];
  for (const p of photos) {
    if (p.dataUrl) { result.push(p); continue; }
    if (photoUrlCache.has(p.id)) { result.push({ ...p, url: photoUrlCache.get(p.id) }); continue; }
    try {
      const blob = await idbGet(IDB_STORE_PHOTOS, p.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        photoUrlCache.set(p.id, url);
        result.push({ ...p, url });
      } else {
        result.push({ ...p, url: null }); // blob ontbreekt (weesverwijzing)
      }
    } catch (e) {
      result.push({ ...p, url: null });
    }
  }
  return result;
}

async function openGevaar(gid) {
  const proj = currentProject();
  currentStep = 1;
  currentPhotos = [];

  if (gid) {
    currentGevaarId = gid;
    const g = proj.gevaren.find(x => x.id === gid);
    if (!g) return;
    document.getElementById('nav-gevaar-title').textContent = 'Gevaar bewerken';
    currentPhotos = g.photos ? await loadPhotos(g.photos) : [];
    populateForm(g);
  } else {
    currentGevaarId = null;
    document.getElementById('nav-gevaar-title').textContent = 'Nieuw gevaar';
    clearForm();
  }

  populateSoortDropdown();
  renderFaseStrip(document.getElementById('f1-gebruiksfase').value);
  renderPhotos();
  goToStep(1);
  showScreen('screen-gevaar');
}

function clearForm() {
  ['f1-locatie','f1-scenario','f1-verantw','f1-gebruiksfase','f2-extra'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  setVal('f1-norm', 'EN ISO 12100');
  ['f2-soort','f2-oorzaak','f2-gevolg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['f3-E','f3-B','f3-W','f3-maatregel','f3-E2','f3-B2','f3-W2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  setVal('f4-restrisico', '');
  setVal('f4-plr', 'NA');
  setVal('f4-plrparams', '');
  updateRisk();
}

function populateForm(g) {
  setVal('f1-locatie', g.locatie);
  setVal('f1-scenario', g.scenario);
  setVal('f1-norm', g.norm || 'EN ISO 12100');
  setVal('f1-verantw', g.verantwoordelijke);
  setVal('f1-gebruiksfase', g.gebruiksfase || '');
  setTimeout(() => {
    populateSoortDropdown();
    setVal('f2-soort', g.soortGevaar);
    updateCascading(g.soortGevaar, g.oorzaak, g.gevolg);
    setVal('f2-extra', g.extra);
    renderFaseStrip(g.gebruiksfase || '');
  }, 0);
  setVal('f3-E', g.E);
  setVal('f3-B', g.B);
  setVal('f3-W', g.W);
  setVal('f3-maatregel', g.maatregel);
  setVal('f3-E2', g.E2);
  setVal('f3-B2', g.B2);
  setVal('f3-W2', g.W2);
  setVal('f4-restrisico', g.restrisico);
  setVal('f4-plr', g.plr || 'NA');
  setVal('f4-plrparams', g.plrParams);
  updateRisk();
}

// Voor opslag blijft van elke foto enkel de metadata over (id/name/type als de
// blob in IndexedDB staat, anders de dataUrl-terugval) — nooit de transiente
// objectURL uit currentPhotos, die is enkel geldig binnen deze paginasessie.
function photosForStorage(photos) {
  return photos.map(p => p.id
    ? { id: p.id, name: p.name, type: p.type }
    : { dataUrl: p.dataUrl, name: p.name });
}

function getFormData() {
  return {
    id: currentGevaarId || genId(),
    locatie: gv('f1-locatie'),
    scenario: gv('f1-scenario'),
    gebruiksfase: gv('f1-gebruiksfase'),
    norm: gv('f1-norm') || 'EN ISO 12100',
    verantwoordelijke: gv('f1-verantw'),
    soortGevaar: gv('f2-soort'),
    oorzaak: gv('f2-oorzaak'),
    gevolg: gv('f2-gevolg'),
    extra: gv('f2-extra'),
    E: gv('f3-E'),
    B: gv('f3-B'),
    W: gv('f3-W'),
    maatregel: gv('f3-maatregel'),
    E2: gv('f3-E2'),
    B2: gv('f3-B2'),
    W2: gv('f3-W2'),
    restrisico: gv('f4-restrisico'),
    plr: gv('f4-plr'),
    plrParams: gv('f4-plrparams'),
    photos: photosForStorage(currentPhotos),
    updatedAt: new Date().toISOString()
  };
}

// ─── CASCADING DROPDOWNS ──────────────────────────────────────────────────────
function populateSoortDropdown() {
  const sel = document.getElementById('f2-soort');
  sel.innerHTML = '<option value="">— selecteer categorie —</option>';
  Object.keys(GEVAREN_DATA).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  });
}

function updateCascading(soort, selectedOorzaak, selectedGevolg) {
  const oorzaakSel = document.getElementById('f2-oorzaak');
  const gevolgSel = document.getElementById('f2-gevolg');
  if (!soort || !GEVAREN_DATA[soort]) {
    oorzaakSel.innerHTML = '<option value="">— kies eerst soort gevaar —</option>';
    oorzaakSel.disabled = true;
    gevolgSel.innerHTML = '<option value="">— kies eerst soort gevaar —</option>';
    gevolgSel.disabled = true;
    return;
  }
  const data = GEVAREN_DATA[soort];
  oorzaakSel.disabled = false;
  oorzaakSel.innerHTML = '<option value="">— selecteer oorzaak —</option>';
  data.oorzaken.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    if (o === selectedOorzaak) opt.selected = true;
    oorzaakSel.appendChild(opt);
  });
  gevolgSel.disabled = false;
  gevolgSel.innerHTML = '<option value="">— selecteer gevolg —</option>';
  data.gevolgen.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    if (g === selectedGevolg) opt.selected = true;
    gevolgSel.appendChild(opt);
  });
}

// ─── RISK CALCULATION ─────────────────────────────────────────────────────────
function updateRisk() {
  const r1 = riskScore(gv('f3-E'), gv('f3-B'), gv('f3-W'));
  const r2 = riskScore(gv('f3-E2'), gv('f3-B2'), gv('f3-W2'));
  const colors = { 'risk-low': '#16a34a', 'risk-med': '#d97706', 'risk-high': '#ea580c', 'risk-crit': '#dc2626' };

  const r1el = document.getElementById('r1-val');
  const r1tag = document.getElementById('r1-tag');
  if (r1el) {
    r1el.textContent = r1 !== null ? r1 : '–';
    const rc = riskClass(r1);
    r1el.style.color = rc ? (colors[rc] || '#1a1a1a') : '';
  }
  if (r1tag) {
    r1tag.textContent = r1 !== null ? riskLabel(r1) : '';
    r1tag.className = `risk-result-tag ${r1 !== null ? riskClass(r1) : ''}`;
  }
  const r2el = document.getElementById('r2-val');
  const r2tag = document.getElementById('r2-tag');
  if (r2el) {
    r2el.textContent = r2 !== null ? r2 : '–';
    const rc2 = riskClass(r2);
    r2el.style.color = rc2 ? (colors[rc2] || '#1a1a1a') : '';
  }
  if (r2tag) {
    r2tag.textContent = r2 !== null ? riskLabel(r2) : '';
    r2tag.className = `risk-result-tag ${r2 !== null ? riskClass(r2) : ''}`;
  }
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
function updateSummary() {
  const g = getFormData();
  const r1 = riskScore(g.E, g.B, g.W);
  const r2 = riskScore(g.E2, g.B2, g.W2);
  const rows = [
    ['Locatie', g.locatie],
    ['Gebruiksfase', g.gebruiksfase],
    ['Soort gevaar', g.soortGevaar],
    ['Oorzaak', g.oorzaak],
    ['Gevolg', g.gevolg],
    ['Risico voor', r1 !== null ? `${r1} – ${riskLabel(r1)}` : '–'],
    ['Risico na', r2 !== null ? `${r2} – ${riskLabel(r2)}` : '–'],
    ['Restrisico', g.restrisico || '–'],
    ["Foto's", currentPhotos.length > 0 ? `${currentPhotos.length} foto(s)` : 'Geen'],
    ['PLr', g.plr || 'NA'],
  ].filter(r => r[1]);
  const el = document.getElementById('summary-content');
  if (el) {
    el.innerHTML = rows.map(([k, v]) =>
      `<div class="summary-row"><span class="summary-key">${k}</span><span class="summary-val">${esc(String(v))}</span></div>`
    ).join('');
  }
}

// ─── WIZARD STEPS ─────────────────────────────────────────────────────────────
function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.wizard-step').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === step);
  });
  document.getElementById('step-indicator').textContent = `${step}/${TOTAL_STEPS}`;
  document.getElementById('wizard-bar').style.width = `${(step / TOTAL_STEPS) * 100}%`;
  document.getElementById('wizard-prev').disabled = step === 1;
  const nextBtn = document.getElementById('wizard-next');
  if (step === TOTAL_STEPS) {
    nextBtn.textContent = 'Opslaan';
    nextBtn.classList.add('finish');
  } else {
    nextBtn.innerHTML = `Volgende <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    nextBtn.classList.remove('finish');
  }
  if (step === 4) updateSummary();
}

function saveGevaar() {
  const proj = currentProject();
  if (!proj) return;
  try {
    const g = getFormData();
    if (!proj.gevaren) proj.gevaren = [];
    if (currentGevaarId) {
      const idx = proj.gevaren.findIndex(x => x.id === currentGevaarId);
      if (idx >= 0) proj.gevaren[idx] = g;
      else proj.gevaren.push(g);
    } else {
      proj.gevaren.push(g);
    }
    saveProjects();
  } catch (e) {
    logError(`saveGevaar() faalde: ${e.message}`);
    alert('Er ging iets mis bij het opslaan van dit gevaar. Gebruik "Kopieer naar PC" om je huidige data veilig te stellen en probeer het opnieuw.');
  } finally {
    // Ongeacht wat hierboven misging: altijd navigeren, nooit stil blijven hangen.
    renderProjectStats();
    renderGevaren();
    showScreen('screen-project');
    document.getElementById('screen-gevaar').classList.remove('slide-out');
  }
}

// ─── PHOTOS ───────────────────────────────────────────────────────────────────
function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  const placeholder = document.getElementById('camera-placeholder');
  if (!grid) return;
  if (currentPhotos.length === 0) {
    grid.innerHTML = '';
    if (placeholder) placeholder.style.display = '';
    return;
  }
  if (placeholder) placeholder.style.display = 'none';
  grid.innerHTML = currentPhotos.map((p, i) =>
    `<div class="photo-thumb-wrap">
      <img src="${p.url || p.dataUrl || ''}" alt="foto ${i+1}">
      <button class="photo-thumb-del" data-idx="${i}">×</button>
    </div>`
  ).join('');
  grid.querySelectorAll('.photo-thumb-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const [removed] = currentPhotos.splice(idx, 1);
      if (removed && removed.id) {
        idbDel(IDB_STORE_PHOTOS, removed.id).catch(() => {});
        if (photoUrlCache.has(removed.id)) {
          URL.revokeObjectURL(photoUrlCache.get(removed.id));
          photoUrlCache.delete(removed.id);
        }
      }
      renderPhotos();
    });
  });
}

function handlePhotoInput(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const id = genId();
          try {
            await idbPut(IDB_STORE_PHOTOS, id, blob);
            const url = URL.createObjectURL(blob);
            photoUrlCache.set(id, url);
            currentPhotos.push({ id, name: file.name, type: blob.type, url });
          } catch (err) {
            // IndexedDB niet beschikbaar: terugval op base64 in localStorage
            logError(`handlePhotoInput() IDB-schrijf faalde, terugval op base64: ${err.message}`);
            currentPhotos.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), name: file.name });
          }
          renderPhotos();
        }, 'image/jpeg', 0.82);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── EXPORT ────────────────────────────────────────────────────────────────────
function buildWorkbook(proj) {
  const wb = XLSX.utils.book_new();

  const wsVB = XLSX.utils.aoa_to_sheet([
    ['CE Risico analyse'],
    ['Datum:', proj.datum || today()],
    ['Auteur', 'Pieter Fiers'],
    ['Project:', proj.naam],
    [proj.locatie || ''],
    [proj.klant || '']
  ]);
  XLSX.utils.book_append_sheet(wb, wsVB, 'VB');

  const wsRev = XLSX.utils.aoa_to_sheet([
    ['Documenthistorie'],
    ['Revisienummer', '', 'Revisiedatum', '', 'Omschrijving'],
    [1, 0, proj.datum || today(), '', 'Basisversie']
  ]);
  XLSX.utils.book_append_sheet(wb, wsRev, 'Revisiebeheer');

  const headers = [
    null, 'Nr', 'Norm', 'Datum laatste aanpassing', 'Locatie',
    'Scenario (volgens Annex B)',
    'Soort gevaar (Annex B)', 'Oorzaak', 'Gevolg',
    'Gebruiksfase', 'Consequenties',
    'E', 'B', 'W', 'R',
    'Beschrijving risico-reducerende maatregel',
    'E2', 'B2', 'W2', 'R2',
    'Verantwoordelijke',
    'Restrisico\naanwezig na aanbevolen reductie weg te nemen met instructie',
    'PLr\nvolgens\nEN13849-1',
    'Parameters PLr\nvolgens\nEN13849-1',
    "Foto's"
  ];
  const rows = [headers];
  (proj.gevaren || []).forEach((g, i) => {
    const r1 = riskScore(g.E, g.B, g.W);
    const r2 = riskScore(g.E2, g.B2, g.W2);
    const fotoTekst = (g.photos && g.photos.length > 0)
      ? g.photos.map((_, fi) => `foto_${i+1}_${fi+1}.jpg`).join(', ')
      : '';
    rows.push([
      null, i + 1,
      g.norm || 'EN ISO 12100',
      proj.datum || today(),
      g.locatie || '',
      g.scenario || '',
      g.soortGevaar || '',
      g.oorzaak || '',
      g.gevolg || '',
      g.gebruiksfase || '',
      g.consequenties || '',
      g.E ? parseFloat(g.E) : null,
      g.B ? parseFloat(g.B) : null,
      g.W ? parseFloat(g.W) : null,
      r1 !== null ? r1 : null,
      g.maatregel || '',
      g.E2 ? parseFloat(g.E2) : null,
      g.B2 ? parseFloat(g.B2) : null,
      g.W2 ? parseFloat(g.W2) : null,
      r2 !== null ? r2 : null,
      g.verantwoordelijke || '',
      g.restrisico || '',
      g.plr || 'NA',
      g.plrParams || '',
      fotoTekst
    ]);
  });
  const wsRA = XLSX.utils.aoa_to_sheet(rows);
  wsRA['!cols'] = [
    {wch:3},{wch:5},{wch:20},{wch:14},{wch:30},
    {wch:55},
    {wch:28},{wch:35},{wch:28},
    {wch:28},{wch:30},
    {wch:5},{wch:5},{wch:5},{wch:7},
    {wch:60},
    {wch:5},{wch:5},{wch:5},{wch:7},
    {wch:18},{wch:28},{wch:12},{wch:18},{wch:30}
  ];
  XLSX.utils.book_append_sheet(wb, wsRA, `RA ${proj.naam}`.slice(0, 31));
  return wb;
}

async function ensureJSZip() {
  if (window.JSZip) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Bouwt de fotozip in het geheugen op, zonder te downloaden. Haalt foto's één
// voor één uit IndexedDB (terugval op dataUrl voor legacy/niet-gemigreerde data).
async function buildFotosZipBlob(proj) {
  await ensureJSZip();
  const zip = new JSZip();
  const folder = zip.folder('fotos');

  const gevarenMetFotos = proj.gevaren || [];
  for (let i = 0; i < gevarenMetFotos.length; i++) {
    const g = gevarenMetFotos[i];
    if (!g.photos || g.photos.length === 0) continue;
    for (let fi = 0; fi < g.photos.length; fi++) {
      const p = g.photos[fi];
      let blob = null;
      if (p.id) {
        try { blob = await idbGet(IDB_STORE_PHOTOS, p.id); } catch (e) { blob = null; }
        if (!blob) continue; // weesverwijzing, foto ontbreekt
      } else if (p.dataUrl) {
        blob = dataUrlToBlob(p.dataUrl);
      } else {
        continue;
      }
      const ext = (p.type || blob.type || '').includes('png') ? 'png' : 'jpg';
      const nr = String(i + 1).padStart(2, '0');
      const fnr = String(fi + 1).padStart(2, '0');
      const locatie = (g.locatie || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
      folder.file(`gevaar_${nr}_foto_${fnr}_${locatie}.${ext}`, blob);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

function exportProject() {
  const proj = currentProject();
  if (!proj) return;
  if (!window.XLSX) { alert('XLSX library niet geladen'); return; }

  const wb = buildWorkbook(proj);
  const fname = `RA_${proj.naam}_${proj.datum || today()}.xlsx`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  XLSX.writeFile(wb, fname);

  // Als er foto's zijn: ook een zip downloaden
  const heeftFotos = (proj.gevaren || []).some(g => g.photos && g.photos.length > 0);
  if (heeftFotos) {
    setTimeout(() => exportFotos(proj), 500);
  }
}

// Download alle foto's als zip
async function exportFotos(proj) {
  const blob = await buildFotosZipBlob(proj);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Fotos_${proj.naam}_${proj.datum || today()}.zip`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─── NEW PROJECT ──────────────────────────────────────────────────────────────
function initNewProjectModal() {
  document.getElementById('new-proj-datum').value = today();
  document.getElementById('modal-new-project').classList.remove('hidden');
}

// ─── SYNC: KOPIEER / IMPORTEER ────────────────────────────────────────────────
function openSyncExport() {
  const data = JSON.stringify(projects);
  document.getElementById('sync-export-text').value = data;
  document.getElementById('sync-export-content').classList.remove('hidden');
  document.getElementById('sync-import-content').classList.add('hidden');
  document.getElementById('sync-modal-title').textContent = 'Kopieer naar PC';
  document.getElementById('modal-sync').classList.remove('hidden');
  // Selecteer automatisch de tekst
  setTimeout(() => {
    const ta = document.getElementById('sync-export-text');
    ta.focus();
    ta.select();
  }, 100);
}

function openSyncImport() {
  document.getElementById('sync-import-text').value = '';
  document.getElementById('sync-export-content').classList.add('hidden');
  document.getElementById('sync-import-content').classList.remove('hidden');
  document.getElementById('sync-modal-title').textContent = 'Importeer van iPhone';
  document.getElementById('modal-sync').classList.remove('hidden');
}

function doImport() {
  const raw = document.getElementById('sync-import-text').value.trim();
  if (!raw) return;
  let imported;
  try {
    imported = JSON.parse(raw);
  } catch {
    alert('Ongeldige data — controleer of je de volledige tekst hebt geplakt.');
    return;
  }
  if (!Array.isArray(imported)) {
    alert('Onverwacht formaat.');
    return;
  }
  // Voeg toe, sla bestaande IDs over
  const existingIds = new Set(projects.map(p => p.id));
  let nieuw = 0;
  imported.forEach(p => {
    if (!existingIds.has(p.id)) {
      projects.push(p);
      nieuw++;
    }
  });
  saveProjects();
  renderHome();
  document.getElementById('modal-sync').classList.add('hidden');
  alert(`${nieuw} nieuw project${nieuw !== 1 ? 'en' : ''} geïmporteerd${imported.length - nieuw > 0 ? ` (${imported.length - nieuw} al aanwezig overgeslagen)` : ''}.`);
}

// ─── DIAGNOSESCHERM ───────────────────────────────────────────────────────────
function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

function localStorageUsageBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const val = localStorage.getItem(key) || '';
    total += (key.length + val.length) * 2; // UTF-16, benadering
  }
  return total;
}

async function renderDiag() {
  const el = document.getElementById('diag-stats');
  el.innerHTML = `<div class="summary-card"><div class="summary-title">Bezig met laden…</div></div>`;

  let cacheNaam = 'caches API niet beschikbaar';
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      cacheNaam = keys.length ? keys.join(', ') : '(geen cache actief)';
    } catch (e) { cacheNaam = 'fout bij ophalen'; }
  }

  const lsBytes = localStorageUsageBytes();
  const lsKB = fmtKB(lsBytes);
  const lsPct = ((lsBytes / (5 * 1024 * 1024)) * 100).toFixed(1);

  let estimateHtml = 'niet beschikbaar op dit toestel';
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      estimateHtml = `${fmtKB(est.usage || 0)} kB gebruikt van ${fmtKB(est.quota || 0)} kB quotum`;
    } catch (e) { estimateHtml = 'fout bij opvragen'; }
  }

  let persistHtml = 'niet beschikbaar op dit toestel';
  if (navigator.storage && navigator.storage.persist) {
    try {
      const wasPersisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
      const persistResult = await navigator.storage.persist();
      persistHtml = `persist(): ${persistResult ? 'toegekend' : 'geweigerd'}` +
        (wasPersisted !== null ? ` · persisted(): ${wasPersisted ? 'ja' : 'nee'}` : '');
    } catch (e) { persistHtml = 'fout bij opvragen'; }
  }

  const aantalProjecten = projects.length;
  const aantalGevaren = projects.reduce((sum, p) => sum + (p.gevaren || []).length, 0);
  const aantalFotoblobs = await idbCount(IDB_STORE_PHOTOS);
  const laatsteFouten = await getLastErrors();
  const foutenHtml = laatsteFouten.length
    ? laatsteFouten.map(f => `<div class="summary-row"><span class="summary-key">${esc(new Date(f.time).toLocaleString('nl-BE'))}</span><span class="summary-val">${esc(f.message)}</span></div>`).join('')
    : `<div class="summary-row"><span class="summary-val">Geen fouten geregistreerd</span></div>`;

  el.innerHTML = `
    <div class="summary-card" style="margin-bottom:12px;">
      <div class="summary-title">Versie</div>
      <div class="summary-row"><span class="summary-key">Build</span><span class="summary-val">${esc(BUILD)}</span></div>
      <div class="summary-row"><span class="summary-key">Actieve cache</span><span class="summary-val">${esc(cacheNaam)}</span></div>
    </div>
    <div class="summary-card" style="margin-bottom:12px;">
      <div class="summary-title">Opslag</div>
      <div class="summary-row"><span class="summary-key">localStorage</span><span class="summary-val">${lsKB} kB (${lsPct}% van 5 MB)</span></div>
      <div class="summary-row"><span class="summary-key">storage.estimate()</span><span class="summary-val">${estimateHtml}</span></div>
      <div class="summary-row"><span class="summary-key">Persistente opslag</span><span class="summary-val">${persistHtml}</span></div>
    </div>
    <div class="summary-card" style="margin-bottom:12px;">
      <div class="summary-title">Data</div>
      <div class="summary-row"><span class="summary-key">Projecten</span><span class="summary-val">${aantalProjecten}</span></div>
      <div class="summary-row"><span class="summary-key">Gevaren</span><span class="summary-val">${aantalGevaren}</span></div>
      <div class="summary-row"><span class="summary-key">Fotoblobs (IndexedDB)</span><span class="summary-val">${aantalFotoblobs}</span></div>
    </div>
    <div class="summary-card">
      <div class="summary-title">Laatste 5 fouten</div>
      ${foutenHtml}
    </div>
  `;
}

// ─── ZELFTEST (STRESSTEST OPSLAG) ─────────────────────────────────────────────
// Gebruikt bewust een eigen safe-save in plaats van saveProjects(): die laatste
// toont bij falen een alert(), wat de test bij 30 iteraties zou laten
// vasthangen op een popup. De test schrijft foto's via dezelfde IndexedDB-pad
// als handlePhotoInput(), zodat hij ook na de opslagfix nog echt aantoont of
// localStorage klein blijft — niet enkel of de test zelf niet crasht.
const ZELFTEST_NAAM = '__ZELFTEST__';
const ZELFTEST_AANTAL_GEVAREN = 30;
const ZELFTEST_FOTOS_PER_GEVAAR = 2;

function genereerRuisFoto() {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    imgData.data[i] = Math.random() * 256;
    imgData.data[i + 1] = Math.random() * 256;
    imgData.data[i + 2] = Math.random() * 256;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  let quality = 0.5;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  let tries = 0;
  while (dataUrl.length > 460 * 1024 && quality > 0.15 && tries < 6) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    tries++;
  }
  return dataUrl;
}

function safeSaveProjectsForTest() {
  try {
    localStorage.setItem('ra_projects', JSON.stringify(projects));
    return true;
  } catch (e) {
    return false;
  }
}

function leesProjectTerug(id) {
  try {
    const raw = JSON.parse(localStorage.getItem('ra_projects') || '[]');
    return raw.find(p => p.id === id) || null;
  } catch (e) {
    return null;
  }
}

function stresstestStapLog(container, ok, label, detail) {
  const row = document.createElement('div');
  row.className = 'summary-row';
  row.innerHTML = `<span class="summary-key">${ok ? '✓' : '✗'} ${esc(label)}</span><span class="summary-val" style="color:${ok ? 'var(--green)' : 'var(--red)'}">${esc(detail || '')}</span>`;
  container.appendChild(row);
  return ok;
}

async function runStresstest() {
  const out = document.getElementById('stresstest-output');
  const btn = document.getElementById('btn-stresstest');
  out.innerHTML = '';
  btn.disabled = true;
  btn.textContent = 'Bezig…';

  let allOk = true;
  const log = (ok, label, detail) => { if (!stresstestStapLog(out, ok, label, detail)) allOk = false; };

  // Eventueel restant van een vorige afgebroken test opruimen
  projects = projects.filter(p => p.naam !== ZELFTEST_NAAM);
  safeSaveProjectsForTest();

  // Stap 1: testproject aanmaken
  const testProj = {
    id: genId(),
    naam: ZELFTEST_NAAM,
    locatie: 'Zelftest',
    klant: '',
    datum: today(),
    gevaren: [],
    createdAt: new Date().toISOString()
  };
  projects.push(testProj);
  const stap1Ok = safeSaveProjectsForTest();
  log(stap1Ok, 'Testproject aanmaken', stap1Ok ? `id ${testProj.id}` : 'localStorage.setItem() faalde');

  // Stap 2: 30 gevaren met elk 2 foto's toevoegen, telkens schrijven én terug inlezen
  let aantalGeverifieerd = 0;
  if (stap1Ok) {
    for (let i = 0; i < ZELFTEST_AANTAL_GEVAREN; i++) {
      const photos = [];
      for (let f = 0; f < ZELFTEST_FOTOS_PER_GEVAAR; f++) {
        const dataUrl = genereerRuisFoto();
        const naam = `zelftest_${i + 1}_${f + 1}.jpg`;
        try {
          const blob = dataUrlToBlob(dataUrl);
          const id = genId();
          await idbPut(IDB_STORE_PHOTOS, id, blob);
          photos.push({ id, name: naam, type: blob.type });
        } catch (e) {
          photos.push({ dataUrl, name: naam }); // terugval als IndexedDB faalt
        }
      }
      testProj.gevaren.push({
        id: genId(),
        locatie: `Zelftestlocatie ${i + 1}`,
        scenario: 'Synthetisch gegenereerd door de stresstest',
        soortGevaar: 'Zelftest',
        oorzaak: 'Synthetisch',
        gevolg: 'Synthetisch',
        E: 7, B: 3, W: 0.2, E2: 1, B2: 1, W2: 0.033,
        photos,
        updatedAt: new Date().toISOString()
      });
      const geschreven = safeSaveProjectsForTest();
      const teruggelezen = geschreven ? leesProjectTerug(testProj.id) : null;
      const geverifieerd = !!teruggelezen && teruggelezen.gevaren.length === testProj.gevaren.length;
      if (geverifieerd) {
        aantalGeverifieerd++;
      } else {
        log(false, `Gevaar ${i + 1}/${ZELFTEST_AANTAL_GEVAREN} opslaan en terug inlezen`,
          `stopt bij gevaar ${i + 1}${geschreven ? ' (schrijven lukte, terug inlezen kwam niet overeen)' : ' (setItem faalde)'}`);
        break;
      }
    }
    if (aantalGeverifieerd === ZELFTEST_AANTAL_GEVAREN) {
      log(true, `${ZELFTEST_AANTAL_GEVAREN} gevaren opslaan en terug inlezen`, `alle ${ZELFTEST_AANTAL_GEVAREN} met foto's kloppen na herinlezen`);
    }
  }

  // Stap 3: opslaggebruik meten
  const lsKB = fmtKB(localStorageUsageBytes());
  const idbFotoCount = await idbCount(IDB_STORE_PHOTOS);
  log(true, 'Opslaggebruik gemeten', `localStorage ${lsKB} kB · IndexedDB fotoblobs: ${idbFotoCount}`);

  // Stap 4: volledige export in het geheugen genereren, zonder te downloaden
  try {
    if (!window.XLSX) throw new Error('XLSX niet geladen');
    const wb = buildWorkbook(testProj);
    const xlsxArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    let zipKB = '0.0';
    if (testProj.gevaren.some(g => g.photos && g.photos.length > 0)) {
      const zipBlob = await buildFotosZipBlob(testProj);
      zipKB = fmtKB(zipBlob.size);
    }
    log(true, 'Volledige export genereren (xlsx + zip, geen download)', `xlsx ${fmtKB(xlsxArray.byteLength)} kB, zip ${zipKB} kB`);
  } catch (e) {
    log(false, 'Volledige export genereren (xlsx + zip, geen download)', `fout: ${e.message}`);
  }

  // Stap 5: testproject en fotoblobs opruimen, opruiming verifiëren
  const fotoIdsInTest = [];
  testProj.gevaren.forEach(g => (g.photos || []).forEach(p => { if (p.id) fotoIdsInTest.push(p.id); }));

  projects = projects.filter(p => p.id !== testProj.id);
  safeSaveProjectsForTest();

  for (const fid of fotoIdsInTest) {
    await idbDel(IDB_STORE_PHOTOS, fid).catch(() => {});
    if (photoUrlCache.has(fid)) {
      URL.revokeObjectURL(photoUrlCache.get(fid));
      photoUrlCache.delete(fid);
    }
  }
  const nogAanwezig = !!leesProjectTerug(testProj.id);
  let restBlobs = 0;
  for (const fid of fotoIdsInTest) {
    const stillThere = await idbGet(IDB_STORE_PHOTOS, fid).catch(() => null);
    if (stillThere) restBlobs++;
  }
  const opgeruimd = !nogAanwezig && restBlobs === 0;
  log(opgeruimd, 'Testproject en fotoblobs opruimen',
    opgeruimd ? `volledig verwijderd (localStorage + ${fotoIdsInTest.length} fotoblobs uit IndexedDB)` : `nog aanwezig: project=${nogAanwezig}, fotoblobs=${restBlobs}/${fotoIdsInTest.length}`);

  renderHome();

  const eindLabel = allOk ? 'ALLE STAPPEN GESLAAGD' : 'ÉÉN OF MEER STAPPEN GEFAALD';
  const eindRow = document.createElement('div');
  eindRow.className = 'summary-row';
  eindRow.style.borderTop = '1px solid var(--border)';
  eindRow.style.marginTop = '4px';
  eindRow.style.paddingTop = '10px';
  eindRow.innerHTML = `<span class="summary-key" style="font-weight:700;color:${allOk ? 'var(--green)' : 'var(--red)'}">${eindLabel}</span>`;
  out.appendChild(eindRow);

  btn.disabled = false;
  btn.textContent = 'Stresstest opslag';
}

// ─── MIGRATIE EN OPRUIMING ─────────────────────────────────────────────────────
// Zet bestaande base64-foto's (van vóór de opslagfix) om naar blobs in
// IndexedDB en vervangt ze in localStorage door lichte metadata. Moet vóór
// opruimenWeesfotos() draaien, anders worden net-gemigreerde blobs die nog
// niet aan een gevaar hangen per ongeluk als wees gezien.
async function migreerFotos() {
  let gewijzigd = false;
  for (const proj of projects) {
    for (const g of (proj.gevaren || [])) {
      if (!g.photos || g.photos.length === 0) continue;
      for (let i = 0; i < g.photos.length; i++) {
        const p = g.photos[i];
        if (p.id || !p.dataUrl) continue; // al gemigreerd, of geen data
        try {
          const blob = dataUrlToBlob(p.dataUrl);
          const id = genId();
          await idbPut(IDB_STORE_PHOTOS, id, blob);
          g.photos[i] = { id, name: p.name, type: blob.type };
          gewijzigd = true;
        } catch (e) {
          logError(`migreerFotos() faalde voor gevaar ${g.id}: ${e.message}`);
        }
      }
    }
  }
  if (gewijzigd) saveProjects();
}

// Verwijdert fotoblobs uit IndexedDB waar geen enkel gevaar meer naar verwijst.
async function opruimenWeesfotos() {
  const referenced = new Set();
  projects.forEach(proj => (proj.gevaren || []).forEach(g => (g.photos || []).forEach(p => {
    if (p.id) referenced.add(p.id);
  })));
  const keys = await idbKeys(IDB_STORE_PHOTOS);
  for (const key of keys) {
    if (!referenced.has(key)) {
      await idbDel(IDB_STORE_PHOTOS, key).catch(() => {});
    }
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await migreerFotos();
  await opruimenWeesfotos();
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  renderHome();
  document.getElementById('btn-open-diag').textContent = BUILD;

  document.getElementById('btn-open-diag').addEventListener('click', () => {
    showScreen('screen-diag');
    renderDiag();
  });
  document.getElementById('btn-back-diag').addEventListener('click', () => {
    showScreen('screen-home');
  });
  document.getElementById('btn-refresh-diag').addEventListener('click', renderDiag);
  document.getElementById('btn-stresstest').addEventListener('click', runStresstest);

  document.getElementById('btn-new-project').addEventListener('click', initNewProjectModal);
  document.getElementById('btn-cancel-project').addEventListener('click', () => {
    document.getElementById('modal-new-project').classList.add('hidden');
  });
  document.getElementById('btn-create-project').addEventListener('click', () => {
    const naam = document.getElementById('new-proj-naam').value.trim();
    if (!naam) { document.getElementById('new-proj-naam').focus(); return; }
    const proj = {
      id: genId(),
      naam,
      locatie: document.getElementById('new-proj-loc').value.trim(),
      klant: document.getElementById('new-proj-klant').value.trim(),
      datum: document.getElementById('new-proj-datum').value || today(),
      gevaren: [],
      createdAt: new Date().toISOString()
    };
    projects.push(proj);
    saveProjects();
    document.getElementById('modal-new-project').classList.add('hidden');
    currentProjectId = proj.id;
    renderHome();
    openProject();
    ['new-proj-naam','new-proj-loc','new-proj-klant'].forEach(id => document.getElementById(id).value = '');
  });

  // Sync knoppen
  document.getElementById('btn-export-all').addEventListener('click', openSyncExport);
  document.getElementById('btn-import-all').addEventListener('click', openSyncImport);
  document.getElementById('btn-close-sync').addEventListener('click', () => {
    document.getElementById('modal-sync').classList.add('hidden');
  });
  document.getElementById('btn-copy-sync').addEventListener('click', () => {
    const ta = document.getElementById('sync-export-text');
    ta.select();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(() => {
        document.getElementById('btn-copy-sync').textContent = '✓ Gekopieerd!';
        setTimeout(() => { document.getElementById('btn-copy-sync').textContent = 'Kopieer naar klembord'; }, 2000);
      });
    } else {
      document.execCommand('copy');
      document.getElementById('btn-copy-sync').textContent = '✓ Gekopieerd!';
      setTimeout(() => { document.getElementById('btn-copy-sync').textContent = 'Kopieer naar klembord'; }, 2000);
    }
  });
  document.getElementById('btn-do-import').addEventListener('click', doImport);

  document.getElementById('btn-back-home').addEventListener('click', () => {
    showScreen('screen-home');
    document.getElementById('screen-project').classList.remove('slide-out');
  });
  document.getElementById('btn-add-gevaar').addEventListener('click', () => openGevaar(null));
  document.getElementById('btn-export-project').addEventListener('click', exportProject);

  document.getElementById('btn-back-project').addEventListener('click', () => {
    showScreen('screen-project');
    document.getElementById('screen-gevaar').classList.remove('slide-out');
  });

  document.getElementById('wizard-prev').addEventListener('click', () => {
    if (currentStep > 1) goToStep(currentStep - 1);
  });
  document.getElementById('wizard-next').addEventListener('click', () => {
    if (currentStep < TOTAL_STEPS) goToStep(currentStep + 1);
    else saveGevaar();
  });

  document.getElementById('f2-soort').addEventListener('change', (e) => {
    updateCascading(e.target.value, '', '');
  });

  ['f3-E','f3-B','f3-W','f3-E2','f3-B2','f3-W2'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateRisk);
  });

  document.getElementById('input-camera').addEventListener('change', (e) => handlePhotoInput(e.target.files));
  document.getElementById('input-gallery').addEventListener('change', (e) => handlePhotoInput(e.target.files));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
