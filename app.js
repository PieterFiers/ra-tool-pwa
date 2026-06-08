// RA Tool PWA v2 — app.js (offline, geen AI)

// ─── State ───────────────────────────────────────────────────────────────────
let projects = JSON.parse(localStorage.getItem('ra_projects') || '[]');
let currentProjectId = null;
let currentGevaarId = null;
let currentStep = 1;
const TOTAL_STEPS = 4;
let currentPhotos = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function saveProjects() {
  localStorage.setItem('ra_projects', JSON.stringify(projects));
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
function openGevaar(gid) {
  const proj = currentProject();
  currentStep = 1;
  currentPhotos = [];

  if (gid) {
    currentGevaarId = gid;
    const g = proj.gevaren.find(x => x.id === gid);
    if (!g) return;
    document.getElementById('nav-gevaar-title').textContent = 'Gevaar bewerken';
    currentPhotos = g.photos ? [...g.photos] : [];
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
  ['f1-locatie','f1-scenario','f1-gebruikers','f1-verantw','f1-gebruiksfase','f2-consequenties','f2-extra'].forEach(id => {
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
  setVal('f1-gebruikers', g.gebruikers);
  setVal('f1-norm', g.norm || 'EN ISO 12100');
  setVal('f1-verantw', g.verantwoordelijke);
  setVal('f1-gebruiksfase', g.gebruiksfase || '');
  setVal('f2-consequenties', g.consequenties || '');
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

function getFormData() {
  return {
    id: currentGevaarId || genId(),
    locatie: gv('f1-locatie'),
    scenario: gv('f1-scenario'),
    gebruikers: gv('f1-gebruikers'),
    gebruiksfase: gv('f1-gebruiksfase'),
    norm: gv('f1-norm') || 'EN ISO 12100',
    verantwoordelijke: gv('f1-verantw'),
    soortGevaar: gv('f2-soort'),
    oorzaak: gv('f2-oorzaak'),
    gevolg: gv('f2-gevolg'),
    consequenties: gv('f2-consequenties'),
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
    photos: currentPhotos,
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
    ['Consequenties', g.consequenties],
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
  renderProjectStats();
  renderGevaren();
  showScreen('screen-project');
  document.getElementById('screen-gevaar').classList.remove('slide-out');
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
      <img src="${p.dataUrl}" alt="foto ${i+1}">
      <button class="photo-thumb-del" data-idx="${i}">×</button>
    </div>`
  ).join('');
  grid.querySelectorAll('.photo-thumb-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPhotos.splice(parseInt(btn.dataset.idx), 1);
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
        currentPhotos.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), name: file.name });
        renderPhotos();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── EXPORT ────────────────────────────────────────────────────────────────────
function exportProject() {
  const proj = currentProject();
  if (!proj) return;
  if (!window.XLSX) { alert('XLSX library niet geladen'); return; }

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
    'Scenario (volgens Annex B)', 'Gebruiksfase', 'Consequenties',
    'E', 'B', 'W', 'R',
    'Beschrijving risico-reducerende maatregel',
    'E2', 'B2', 'W2', 'R2',
    'Verantwoordelijke',
    'Restrisico\naanwezig na aanbevolen reductie weg te nemen met instructie',
    'PLr\nvolgens\nEN13849-1',
    'Parameters PLr\nvolgens\nEN13849-1'
  ];
  const rows = [headers];
  (proj.gevaren || []).forEach((g, i) => {
    const r1 = riskScore(g.E, g.B, g.W);
    const r2 = riskScore(g.E2, g.B2, g.W2);
    rows.push([
      null, i + 1,
      g.norm || 'EN ISO 12100',
      proj.datum || today(),
      g.locatie || '',
      g.scenario || '',
      g.gebruiksfase || '',
      g.consequenties || g.gevolg || '',
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
      g.plrParams || ''
    ]);
  });
  const wsRA = XLSX.utils.aoa_to_sheet(rows);
  wsRA['!cols'] = [
    {wch:3},{wch:5},{wch:20},{wch:14},{wch:30},
    {wch:55},{wch:28},{wch:30},
    {wch:5},{wch:5},{wch:5},{wch:7},
    {wch:60},
    {wch:5},{wch:5},{wch:5},{wch:7},
    {wch:18},{wch:28},{wch:12},{wch:18}
  ];
  XLSX.utils.book_append_sheet(wb, wsRA, `RA ${proj.naam}`.slice(0, 31));

  const fname = `RA_${proj.naam}_${proj.datum || today()}.xlsx`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  XLSX.writeFile(wb, fname);
}

// ─── NEW PROJECT ──────────────────────────────────────────────────────────────
function initNewProjectModal() {
  document.getElementById('new-proj-datum').value = today();
  document.getElementById('modal-new-project').classList.remove('hidden');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderHome();

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
