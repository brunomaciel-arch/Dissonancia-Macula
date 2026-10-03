/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — ui.js  (v2)
   ══════════════════════════════════════════════════════ */

import { sendStatus, sendTest } from './webhook.js';
import { rollWeapon, rollInitiative } from './dice.js';
import {
  loadAllAgents, createAgent, deleteAgent,
  openAgent, getActiveAgent, setField,
  setAttr, stepAttr, setBmCur, setVidaCur,
  setFonteCur, toggleActionSource, toggleSalvaguarda,
  calcBmMax, calcSkillMod, calcInitiativeMod,
  exportAgent, exportAgentTxt, importAgentFromFile,
  addEquipment, updateEquipmentField, removeEquipment,
  addVehicle, updateVehicleField, removeVehicle, toggleVehicleCriticalInjury,
  addConsumable, updateConsumableField, stepConsumableQty, removeConsumable,
  addAbility, updateAbilityField, removeAbility,
  addNote, updateNoteField, removeNote,
  stepDev, setPhotoOffset,
  clearRollHistory,
  getTheme, setTheme,
} from './state.js';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

/* ── TOAST ── */
export function showToast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ` toast--${type}` : ''}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── VIEWS ── */
export function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
}

/* ════════════════════════════════════
   ROSTER
════════════════════════════════════ */
export function renderRoster() {
  const grid  = $('#roster-grid');
  const empty = $('#roster-empty');
  $$('.agent-card', grid).forEach(c => c.remove());
  const agents = loadAllAgents();
  if (!agents.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  agents.forEach(a => grid.appendChild(buildAgentCard(a)));
}

function buildAgentCard(agent) {
  const bmMax   = calcBmMax(agent);
  const vidaPct = agent.vidaMax > 0 && agent.vidaCur > 0 ? Math.min(100, (agent.vidaCur / agent.vidaMax) * 100) : 0;
  const bmPct   = bmMax > 0        ? Math.min(100, (agent.bmCur  / bmMax)           * 100) : 0;
  const card    = document.createElement('div');
  card.className = 'agent-card';
  card.dataset.id = agent.id;

  const photoHtml = agent.photo
    ? `<img class="agent-card__photo" src="${agent.photo}"
            style="object-position:${agent.photoOffsetX??50}% ${agent.photoOffsetY??50}%"
            alt="${esc(agent.name)}" />`
    : `<div class="agent-card__photo-placeholder">◈</div>`;

  card.innerHTML = `
    ${photoHtml}
    <div class="agent-card__body">
      <p class="agent-card__name">${esc(agent.name)}</p>
      <p class="agent-card__title">${esc(agent.title || '—')}</p>
      <div class="agent-card__bars">
        <div class="agent-card__bar-row">
          <span class="agent-card__bar-label">VID</span>
          <div class="agent-card__bar-track"><div class="agent-card__bar-fill agent-card__bar-fill--green" style="width:${vidaPct}%"></div></div>
          <span class="agent-card__bar-vals">${agent.vidaCur}/${agent.vidaMax}</span>
        </div>
        <div class="agent-card__bar-row">
          <span class="agent-card__bar-label">BM</span>
          <div class="agent-card__bar-track"><div class="agent-card__bar-fill agent-card__bar-fill--cyan" style="width:${bmPct}%"></div></div>
          <span class="agent-card__bar-vals">${agent.bmCur}/${bmMax}</span>
        </div>
        <div class="agent-card__bar-row">
          <span class="agent-card__bar-label">FON</span>
          <div class="agent-card__bar-track"><div class="agent-card__bar-fill agent-card__bar-fill--magenta" style="width:${(agent.fonteCur/10)*100}%"></div></div>
          <span class="agent-card__bar-vals">${agent.fonteCur}/10</span>
        </div>
      </div>
    </div>
    <button class="agent-card__delete" data-delete-id="${agent.id}">✕</button>`;

  card.addEventListener('click', e => {
    if (e.target.closest('.agent-card__delete')) return;
    openSheet(agent.id);
  });
  card.querySelector('.agent-card__delete').addEventListener('click', e => {
    e.stopPropagation();
    showDeleteModal(agent.id, agent.name);
  });
  return card;
}

/* ════════════════════════════════════
   SHEET
════════════════════════════════════ */
export function openSheet(id) {
  const agent = openAgent(id);
  if (!agent) { showToast('Personagem não encontrado.', 'error'); return; }
  $('#sheet-agent-name').textContent  = agent.name  || '—';
  $('#sheet-agent-title').textContent = agent.title || '—';
  populateTab0(agent);
  populateTab1(agent);
  populateTab2(agent);
  populateTab3(agent);
  populateTab4(agent);
  populateTab5(agent);
  populateRollHistory(agent);
  renderWeapons(agent);
  activateTab(0);
  showView('sheet');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function closeSheet() { showView('roster'); renderRoster(); }
export function activateTab(i) {
  $$('.tab').forEach(t   => t.classList.toggle('active',   Number(t.dataset.tab)   === i));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', Number(p.dataset.panel) === i));
}

/* ════════════════════════════════════
   ABA 0
════════════════════════════════════ */
function populateTab0(agent) {
  const photo       = $('#agent-photo');
  const wrapper     = $('#photo-wrapper');
  const placeholder = $('#photo-placeholder');

  if (agent.photo) {
    photo.src = agent.photo;
    photo.style.objectPosition  = `${agent.photoOffsetX ?? 50}% ${agent.photoOffsetY ?? 50}%`;
    photo.style.transform       = `scale(${agent.photoScale ?? 1})`;
    photo.style.transformOrigin = `${agent.photoOffsetX ?? 50}% ${agent.photoOffsetY ?? 50}%`;
    photo.style.display         = 'block';
    wrapper.classList.add('has-photo');
    if (placeholder) placeholder.style.display = 'none';
    // sync zoom slider
    const zoomInput = $('#photo-zoom-input');
    const zoomLabel = $('#photo-zoom-label');
    if (zoomInput) zoomInput.value = agent.photoScale ?? 1;
    if (zoomLabel) zoomLabel.textContent = `zoom ${(agent.photoScale ?? 1).toFixed(1)}×`;
  } else {
    photo.src = '';
    photo.style.display = 'none';
    wrapper.classList.remove('has-photo');
    wrapper.classList.remove('move-active');
    if (placeholder) placeholder.style.display = '';
  }

  ['name','title','formaPrimaria','formaSecundaria','age','birthdate','history'].forEach(f => {
    const el = $(`[data-field="${f}"]`);
    if (el) el.value = agent[f] ?? '';
  });
  updateSummary(agent);
}

export function updateSummary(agent) {
  const bmMax   = calcBmMax(agent);
  const vidaPct = agent.vidaMax > 0 && agent.vidaCur > 0
    ? Math.min(100,(agent.vidaCur/agent.vidaMax)*100) : 0;
  const bmPct   = bmMax > 0        ? Math.min(100,(agent.bmCur/bmMax)*100)            : 0;

  $('#summary-vida-fill').style.width = `${vidaPct}%`;
  $('#summary-bm-fill').style.width   = `${bmPct}%`;
  $('#summary-vida-cur').textContent  = agent.vidaCur;
  $('#summary-vida-max').textContent  = agent.vidaMax;
  $('#summary-bm-cur').textContent    = agent.bmCur;
  $('#summary-bm-max').textContent    = bmMax;

  const pipsEl = $('#summary-fonte-pips');
  pipsEl.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('span');
    p.className = `pip${i < agent.fonteCur ? ' active' : ''}`;
    pipsEl.appendChild(p);
  }
  ['raz','ins','pre','prs','fis'].forEach(a => {
    const el = $(`#sum-${a}`);
    if (el) el.textContent = agent.attrs[a] ?? 0;
  });
}

/* ════════════════════════════════════
   ABA 1
════════════════════════════════════ */
function populateTab1(agent) {
  ['raz','ins','pre','prs','fis'].forEach(a => {
    const v = $(`#attr-${a}`); const b = $(`#attr-bar-${a}`);
    if (v) v.textContent = agent.attrs[a];
    if (b) b.style.width = `${(agent.attrs[a] / 12) * 100}%`;
  });

  $('#vida-cur').value = agent.vidaCur;
  $('#vida-max').value = agent.vidaMax;
  updateVidaBar(agent);

  const bmMax = calcBmMax(agent);
  $('#bm-cur').value                  = agent.bmCur;
  $('#bm-max-display').textContent    = bmMax;
  $('#bm-formula-result').textContent = bmMax;
  updateBmBar(agent);

  $('#fonte-type').value = agent.fonteType || 'poder';
  renderFontePips(agent);

  $$('#hex-group .hex-pip').forEach((h, i) => h.classList.toggle('active', agent.actionSources[i] === true));

  // Tipo do personagem
  $$('.char-type-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === agent.charType);
  });

  // Salvaguarda
  $$('#salvaguarda-vida-group .hex-pip').forEach((h, i) => h.classList.toggle('active', agent.salvaguardaVida[i] === true));
  $$('#salvaguarda-morte-group .hex-pip').forEach((h, i) => h.classList.toggle('active', agent.salvaguardaMorte[i] === true));

  // Condições Ativas
  const condEl = $('#active-conditions');
  if (condEl) condEl.value = agent.activeConditions ?? '';

  // Desenvolvimento
  const devMap = { devAprendizado: ['dev-aprendizado','dev-bar-aprendizado',5], devDesenvolvimento: ['dev-desenvolvimento','dev-bar-desenvolvimento',30], devPotencial: ['dev-potencial','dev-bar-potencial',10] };
  Object.entries(devMap).forEach(([field, [valId, barId, max]]) => {
    const v = agent[field] ?? 0;
    const el = $(`#${valId}`); const b = $(`#${barId}`);
    if (el) el.textContent = v;
    if (b)  b.style.width  = `${(v / max) * 100}%`;
  });
}

function updateVidaBar(agent) {
  const max    = agent.vidaMax || 0;
  const cur    = agent.vidaCur;
  // Total span of the bar = max + 10 (normal zone + critical zone)
  const total  = max + 10;

  // ── Critical zone: occupies 10/(max+10) of the bar width ──
  const critZone  = document.getElementById('vida-critical-zone');
  const critFill  = document.getElementById('vida-critical-fill');
  const normalZone = document.getElementById('vida-normal-zone');

  if (critZone && normalZone) {
    const critPct   = total > 0 ? (10 / total) * 100 : 10;
    const normalPct = total > 0 ? (max / total) * 100 : 90;
    critZone.style.width   = `${critPct}%`;
    normalZone.style.width = `${normalPct}%`;
  }

  // ── Critical fill: how deep into -10..0 we are (right-to-left) ──
  if (critFill) {
    if (cur < 0) {
      const critDepth = Math.min(Math.abs(cur), 10); // 0..10
      critFill.style.width = `${(critDepth / 10) * 100}%`;
    } else {
      critFill.style.width = '0%';
    }
  }

  // ── Normal fill: 0..max (only shows when cur >= 0) ──
  const normalFill = document.getElementById('bar-vida');
  if (normalFill) {
    const normalPct = max > 0 && cur > 0 ? Math.min(100, (cur / max) * 100) : 0;
    normalFill.style.width = `${normalPct}%`;
  }
}

function updateBmBar(agent) {
  const max = calcBmMax(agent);
  const pct = max > 0 ? Math.min(100,(agent.bmCur/max)*100) : 0;
  $('#bar-bm').style.width              = `${pct}%`;
  $('#bm-max-display').textContent      = max;
  $('#bm-formula-result').textContent   = max;
}

function renderFontePips(agent) {
  const c = $('#fonte-pips-big');
  c.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const btn = document.createElement('button');
    btn.className = `fonte-pip-btn${i < agent.fonteCur ? ' active' : ''}`;
    btn.dataset.index = i;
    btn.textContent   = i + 1;
    btn.addEventListener('click', () => {
      const prevFonte = agent.fonteCur;
      const nv = i < agent.fonteCur ? i : i + 1;
      setFonteCur(nv);
      const updatedFonte = getActiveAgent();
      renderFontePips(updatedFonte);
      updateSummary(updatedFonte);
      sendStatus('fonte', updatedFonte.fonteCur - prevFonte);
    });
    c.appendChild(btn);
  }
}

/* ════════════════════════════════════
   ABA 2
════════════════════════════════════ */
function populateTab2(agent) {
  ['raz','ins','pre','prs','fis'].forEach(a => {
    const el = $(`#skill-header-${a}`);
    if (el) el.textContent = agent.attrs[a];
  });
  $$('.skill-row[data-formula]').forEach(row => {
    const el = $(`#skill-val-${row.dataset.skill}`);
    if (el) el.textContent = calcSkillMod(agent, row.dataset.formula);
  });

  // Iniciativa
  populateInitiativeWeaponSelect(agent);
  const initVal = $('#initiative-val');
  if (initVal) initVal.textContent = calcInitiativeMod(agent);
}

/** Popula o seletor de arma usado no cálculo de Iniciativa com as armas do Arsenal. */
export function populateInitiativeWeaponSelect(agent) {
  const sel = $('#initiative-weapon-select');
  if (!sel || !agent) return;
  const currentVal = agent.initiativeWeaponId || '';

  sel.innerHTML = '<option value="">Sem arma (+0)</option>';
  (agent.equipment || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.name || 'Sem nome'} (${item.weaponWeight || '+0'})`;
    if (item.id === currentVal) opt.selected = true;
    sel.appendChild(opt);
  });

  // Se a arma selecionada não existe mais, reseta
  if (currentVal && !agent.equipment.find(e => e.id === currentVal)) {
    setField('initiativeWeaponId', '');
    sel.value = '';
  }

  const initVal = $('#initiative-val');
  if (initVal) initVal.textContent = calcInitiativeMod(getActiveAgent());
}

export function populateRollHistory(agent) {
  const list  = $('#roll-history-list');
  const empty = $('#roll-history-empty');
  const hist  = agent.rollHistory || [];

  // Clear existing items (keep the empty placeholder)
  $$('.roll-history__item', list).forEach(i => i.remove());

  if (!hist.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  hist.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'roll-history__item';
    const scoreClass = entry.total >= 19 ? 'score--high' : entry.total >= 12 ? 'score--good' : entry.total <= 6 ? 'score--low' : '';
    li.innerHTML = `<span class="roll-history__name">${esc(entry.skill)}</span>
                    <span class="roll-history__score${scoreClass ? ` ${scoreClass}` : ''}">${entry.total}</span>`;
    list.appendChild(li);
  });
}

/* ════════════════════════════════════
   ARSENAL NA ABA DE PERÍCIAS
════════════════════════════════════ */

/** Detecta se uma string contém uma expressão de dado válida */
function hasDiceExpr(str) {
  return /\d+d\d+/i.test(str || '');
}

export function renderWeapons(agent) {
  const list  = document.getElementById('weapons-list');
  const empty = document.getElementById('weapons-empty');
  if (!list) return;

  // Remove linhas antigas
  list.querySelectorAll('.weapon-row').forEach(r => r.remove());

  const weapons = (agent.equipment || []).filter(e => hasDiceExpr(e.damage));

  if (!weapons.length) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  weapons.forEach(item => {
    const row = document.createElement('div');
    row.className = 'weapon-row';
    row.dataset.equipId = item.id;

    const attrOpts = ['fis','ins','raz','pre','prs']
      .map(a => `<option value="${a}" ${(item.weaponAttr||'fis')===a?'selected':''}>${a.toUpperCase()}</option>`)
      .join('');

    row.innerHTML = `
      <span class="weapon-name">${esc(item.name || '—')}</span>
      <span class="weapon-damage">${esc(item.damage)}</span>
      <select class="weapon-attr-select" title="Atributo base">${attrOpts}</select>
      <input class="weapon-bonus-input" type="number" value="${item.weaponBonus ?? 0}"
             title="Bônus extra" placeholder="+0" />
      <button class="weapon-roll-btn" title="Rolar dano">🎲</button>
    `;

    const attrSel   = row.querySelector('.weapon-attr-select');
    const bonusInp  = row.querySelector('.weapon-bonus-input');
    const rollBtn   = row.querySelector('.weapon-roll-btn');

    // Salvar attr escolhido
    attrSel.addEventListener('change', () => {
      updateEquipmentField(item.id, 'weaponAttr', attrSel.value);
    });

    // Salvar bônus extra
    bonusInp.addEventListener('change', () => {
      updateEquipmentField(item.id, 'weaponBonus', parseInt(bonusInp.value, 10) || 0);
    });

    // Rolar dano
    rollBtn.addEventListener('click', () => {
      const agent     = getActiveAgent();
      const attrKey   = attrSel.value;
      const attrValue = agent?.attrs[attrKey] ?? 0;
      const bonus     = parseInt(bonusInp.value, 10) || 0;
      rollWeapon(item.name || 'Dano', item.damage, attrValue, attrKey.toUpperCase(), bonus);
    });

    list.appendChild(row);
  });
}
function populateTab3(agent) {
  $('#rd-val').value      = agent.rd ?? 0;
  $('#credits-val').value = agent.credits ?? 0;

  // RD tier presets
  $$('.rd-preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tier === (agent.rdTier || 'comum'));
  });

  renderEquipmentTable(agent);
  renderVehicleTable(agent);
  renderConsumableTable(agent);
}

export function renderEquipmentTable(agent) {
  const tbody = $('#equipment-body');
  const empty = $('#equipment-empty');
  tbody.innerHTML = '';
  if (!agent.equipment?.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  agent.equipment.forEach(item => tbody.appendChild(buildEquipmentRow(item)));
}

function buildEquipmentRow(item) {
  const tr = document.createElement('tr');
  tr.dataset.equipId = item.id;
  [
    { key:'name',        cls:'',     ph:'Nome...' },
    { key:'description', cls:'',     ph:'Descrição...' },
    { key:'market',      cls:'--sm', ph:'—' },
    { key:'damage',      cls:'--sm', ph:'—' },
    { key:'range',       cls:'--sm', ph:'—' },
    { key:'price',       cls:'--sm', ph:'—' },
    { key:'qty',         cls:'--xs', ph:'1', type:'number' },
    { key:'weaponWeight',cls:'--xs', ph:'+0' },
  ].forEach(f => {
    const td = document.createElement('td');
    const inp = document.createElement('input');
    inp.className   = `eq-input eq-input${f.cls}`;
    inp.type        = f.type || 'text';
    inp.value       = item[f.key] ?? '';
    inp.placeholder = f.ph;
    inp.addEventListener('change', () => {
      let val = inp.value;
      // Sanitiza Peso da Arma: apenas números com sinal +/-
      if (f.key === 'weaponWeight') {
        const n = parseInt(val.replace(/[^\d-]/g, ''), 10);
        val = isNaN(n) ? '+0' : (n >= 0 ? `+${n}` : `${n}`);
        inp.value = val;
        populateInitiativeWeaponSelect(getActiveAgent());
      }
      updateEquipmentField(item.id, f.key, val);
      // Se o campo dano mudou, reatualizar lista de armas
      if (f.key === 'damage') renderWeapons(getActiveAgent());
      if (f.key === 'name') populateInitiativeWeaponSelect(getActiveAgent());
    });
    td.appendChild(inp);
    tr.appendChild(td);
  });
  const tdBtn = document.createElement('td');
  const btn   = document.createElement('button');
  btn.className = 'btn-remove-row'; btn.textContent = '✕';
  btn.addEventListener('click', () => {
    removeEquipment(item.id); tr.remove();
    if (!getActiveAgent().equipment.length) $('#equipment-empty').style.display = '';
    renderWeapons(getActiveAgent());
    populateInitiativeWeaponSelect(getActiveAgent());
  });
  tdBtn.appendChild(btn);
  tr.appendChild(tdBtn);
  return tr;
}

/* ── Veículos ── */
export function renderVehicleTable(agent) {
  const list  = $('#vehicle-list');
  const empty = $('#vehicle-empty');
  if (!list) return;
  $$('.vehicle-card', list).forEach(c => c.remove());
  if (!agent.vehicles?.length) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  agent.vehicles.forEach(item => list.appendChild(buildVehicleCard(item)));
}

function buildVehicleCard(item) {
  const card = document.createElement('div');
  card.className = 'vehicle-card';
  card.dataset.vehicleId = item.id;

  const categories = [
    { val: 'leve',   label: 'Leve' },
    { val: 'medio',  label: 'Médio' },
    { val: 'pesado', label: 'Pesado' },
    { val: 'aereo',  label: 'Aéreo' },
  ];
  const catButtons = categories.map(c =>
    `<button class="vehicle-cat-btn${item.category === c.val ? ' active' : ''}" data-cat="${c.val}">${c.label}</button>`
  ).join('');

  const critHexes = [0, 1, 2].map(i =>
    `<button class="hex-pip hex-pip--sm hex-pip--red${item.criticalInjuries[i] ? ' active' : ''}" data-crit-index="${i}"></button>`
  ).join('');

  card.innerHTML = `
    <div class="vehicle-card__top">
      <input class="vehicle-name-input" type="text" placeholder="Nome / Modelo / Mercado..." value="${esc(item.name || '')}" />
      <button class="vehicle-remove" title="Remover veículo">✕</button>
    </div>
    <div class="vehicle-cat-row">${catButtons}</div>
    <div class="vehicle-fields-row">
      <div class="vehicle-field">
        <label class="vehicle-field__label">Casco</label>
        <div class="vehicle-field__pair">
          <input class="vehicle-input vehicle-input--xs" type="text" data-field="cascoCur" placeholder="0" value="${esc(item.cascoCur||'')}" />
          <span class="vehicle-field__sep">/</span>
          <input class="vehicle-input vehicle-input--xs" type="text" data-field="cascoMax" placeholder="0" value="${esc(item.cascoMax||'')}" />
        </div>
      </div>
      <div class="vehicle-field">
        <label class="vehicle-field__label">Blindagem (RD)</label>
        <input class="vehicle-input vehicle-input--xs" type="text" data-field="rd" placeholder="0" value="${esc(item.rd||'')}" />
      </div>
      <div class="vehicle-field">
        <label class="vehicle-field__label">Manobra</label>
        <input class="vehicle-input vehicle-input--xs" type="text" data-field="maneuver" placeholder="0" value="${esc(item.maneuver||'')}" />
      </div>
      <div class="vehicle-field vehicle-field--crit">
        <label class="vehicle-field__label">Lesões Críticas</label>
        <div class="hex-group hex-group--sm">${critHexes}</div>
      </div>
    </div>
    <div class="vehicle-field vehicle-field--full">
      <label class="vehicle-field__label">Propriedades</label>
      <textarea class="vehicle-textarea" data-field="properties" placeholder="Propriedades especiais...">${esc(item.properties||'')}</textarea>
    </div>
  `;

  card.querySelector('.vehicle-name-input').addEventListener('input', e => updateVehicleField(item.id, 'name', e.target.value));
  card.querySelector('.vehicle-remove').addEventListener('click', () => {
    removeVehicle(item.id); card.remove();
    if (!getActiveAgent().vehicles.length) $('#vehicle-empty').style.display = '';
  });
  card.querySelectorAll('.vehicle-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      updateVehicleField(item.id, 'category', btn.dataset.cat);
      card.querySelectorAll('.vehicle-cat-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  card.querySelectorAll('[data-field]').forEach(el => {
    const ev = el.tagName === 'TEXTAREA' ? 'input' : 'change';
    el.addEventListener(ev, () => updateVehicleField(item.id, el.dataset.field, el.value));
  });
  card.querySelectorAll('[data-crit-index]').forEach(hex => {
    hex.addEventListener('click', () => {
      const idx = Number(hex.dataset.critIndex);
      toggleVehicleCriticalInjury(item.id, idx);
      const updated = getActiveAgent().vehicles.find(v => v.id === item.id);
      hex.classList.toggle('active', updated.criticalInjuries[idx]);
    });
  });

  return card;
}

/* ── Consumíveis ── */
export function renderConsumableTable(agent) {
  const tbody = $('#consumable-body');
  const empty = $('#consumable-empty');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!agent.consumables?.length) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  agent.consumables.forEach(item => tbody.appendChild(buildConsumableRow(item)));
}

function buildConsumableRow(item) {
  const tr = document.createElement('tr');
  tr.dataset.consumableId = item.id;

  const tdName = document.createElement('td');
  const nameInp = document.createElement('input');
  nameInp.className = 'eq-input';
  nameInp.type = 'text';
  nameInp.placeholder = 'Nome...';
  nameInp.value = item.name ?? '';
  nameInp.addEventListener('change', () => updateConsumableField(item.id, 'name', nameInp.value));
  tdName.appendChild(nameInp);

  const tdFunc = document.createElement('td');
  const funcSel = document.createElement('select');
  funcSel.className = 'weapon-attr-select';
  [
    ['sobrevivencia', 'Sobrevivência'],
    ['ofensiva', 'Ofensiva'],
    ['utilidade', 'Utilidade'],
  ].forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    if ((item.function || 'sobrevivencia') === val) opt.selected = true;
    funcSel.appendChild(opt);
  });
  funcSel.addEventListener('change', () => updateConsumableField(item.id, 'function', funcSel.value));
  tdFunc.appendChild(funcSel);

  const tdDesc = document.createElement('td');
  const descInp = document.createElement('input');
  descInp.className = 'eq-input';
  descInp.type = 'text';
  descInp.placeholder = 'Descrição...';
  descInp.value = item.description ?? '';
  descInp.addEventListener('change', () => updateConsumableField(item.id, 'description', descInp.value));
  tdDesc.appendChild(descInp);

  const tdQty = document.createElement('td');
  const qtyWrap = document.createElement('div');
  qtyWrap.className = 'consumable-qty-ctrl';
  const decBtn = document.createElement('button');
  decBtn.className = 'consumable-qty-btn'; decBtn.textContent = '−';
  const qtyVal = document.createElement('span');
  qtyVal.className = 'consumable-qty-val'; qtyVal.textContent = item.qty ?? 0;
  const incBtn = document.createElement('button');
  incBtn.className = 'consumable-qty-btn'; incBtn.textContent = '+';
  decBtn.addEventListener('click', () => {
    stepConsumableQty(item.id, 'dec');
    qtyVal.textContent = getActiveAgent().consumables.find(c => c.id === item.id).qty;
  });
  incBtn.addEventListener('click', () => {
    stepConsumableQty(item.id, 'inc');
    qtyVal.textContent = getActiveAgent().consumables.find(c => c.id === item.id).qty;
  });
  qtyWrap.append(decBtn, qtyVal, incBtn);
  tdQty.appendChild(qtyWrap);

  const tdBtn = document.createElement('td');
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-row'; removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    removeConsumable(item.id); tr.remove();
    if (!getActiveAgent().consumables.length) $('#consumable-empty').style.display = '';
  });
  tdBtn.appendChild(removeBtn);

  tr.append(tdName, tdFunc, tdDesc, tdQty, tdBtn);
  return tr;
}

/* ════════════════════════════════════
   ABA 4 — Habilidades com modo edição
════════════════════════════════════ */
function populateTab4(agent) {
  const grid  = $('#abilities-grid');
  const empty = $('#abilities-empty');
  $$('.ability-card', grid).forEach(c => c.remove());
  if (!agent.abilities?.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  agent.abilities.forEach(a => grid.insertBefore(buildAbilityCard(a), empty));
}

function buildAbilityCard(ability) {
  const card = document.createElement('div');
  card.className = 'ability-card';
  card.dataset.abilityId = ability.id;
  card.dataset.type      = ability.type || 'ordem';

  const typeLabel = { ordem: 'Ordem', ruina: 'Ruína', adrenalina: 'Adrenalina' }[ability.type] || ability.type;

  card.innerHTML = `
    <div class="ability-card__top-bar">
      <span class="ability-name-view view-only">${esc(ability.name || 'Sem nome')}</span>
      <input class="ability-name-input edit-only" type="text"
             placeholder="Nome da habilidade..." value="${esc(ability.name || '')}" />
      <button class="ability-remove" title="Remover habilidade">✕ Remover</button>
    </div>

    <p class="ability-label">Descrição da Técnica</p>
    <div class="ability-field-view view-only${!ability.description ? ' empty' : ''}">${esc(ability.description || 'Sem descrição.')}</div>
    <textarea class="ability-textarea edit-only" rows="3" placeholder="Descreva o efeito...">${esc(ability.description || '')}</textarea>

    <p class="ability-label">Refinamento</p>
    <div class="ability-field-view view-only${!ability.refinement ? ' empty' : ''}">${esc(ability.refinement || 'Sem refinamento.')}</div>
    <textarea class="ability-textarea edit-only" rows="2" placeholder="Melhoria ou variação...">${esc(ability.refinement || '')}</textarea>

    <!-- Barra inferior: badge/select à esquerda, Editar à direita -->
    <div class="ability-card__bottom-bar">
      <span class="ability-type-badge ability-type-badge--${ability.type} view-only">${typeLabel}</span>
      <select class="ability-type-select edit-only">
        <option value="ordem"      ${ability.type==='ordem'      ?'selected':''}>Ordem</option>
        <option value="ruina"      ${ability.type==='ruina'      ?'selected':''}>Ruína</option>
        <option value="adrenalina" ${ability.type==='adrenalina' ?'selected':''}>Adrenalina</option>
      </select>
      <button class="ability-edit-btn" title="Editar">✎ Editar</button>
    </div>
  `;

  const nameInput  = card.querySelector('.ability-name-input');
  const nameView   = card.querySelector('.ability-name-view');
  const typeSelect = card.querySelector('.ability-type-select');
  const typeBadge  = card.querySelector('.ability-type-badge');
  const [descView, refView]   = card.querySelectorAll('.ability-field-view');
  const [descArea, refArea]   = card.querySelectorAll('.ability-textarea');
  const editBtn    = card.querySelector('.ability-edit-btn');
  const removeBtn  = card.querySelector('.ability-remove');

  function saveOnBlur() {
    const name = nameInput.value;
    const type = typeSelect.value;
    const desc = descArea.value;
    const ref  = refArea.value;

    updateAbilityField(ability.id, 'name',        name);
    updateAbilityField(ability.id, 'type',        type);
    updateAbilityField(ability.id, 'description', desc);
    updateAbilityField(ability.id, 'refinement',  ref);

    // Update view-mode display
    nameView.textContent   = name || 'Sem nome';
    typeSelect.value       = type;
    typeBadge.textContent  = { ordem:'Ordem', ruina:'Ruína', adrenalina:'Adrenalina' }[type] || type;
    typeBadge.className    = `ability-type-badge ability-type-badge--${type} view-only`;
    card.dataset.type      = type;

    descView.textContent   = desc || 'Sem descrição.';
    descView.classList.toggle('empty', !desc);
    refView.textContent    = ref  || 'Sem refinamento.';
    refView.classList.toggle('empty', !ref);
  }

  // Blur-to-save on each editable field
  [nameInput, typeSelect, descArea, refArea].forEach(el => {
    el.addEventListener('blur', () => {
      // Small delay so clicking editBtn doesn't double-fire
      setTimeout(saveOnBlur, 100);
    });
  });

  editBtn.addEventListener('click', () => {
    const isEditing = card.classList.toggle('editing');
    editBtn.textContent = isEditing ? '✓ Pronto' : '✎ Editar';
    editBtn.classList.toggle('editing', isEditing);
    if (isEditing) nameInput.focus();
    else saveOnBlur();
  });

  removeBtn.addEventListener('click', () => {
    removeAbility(ability.id);
    card.remove();
    if (!getActiveAgent().abilities.length) $('#abilities-empty').style.display = '';
  });

  return card;
}

/* ════════════════════════════════════
   ABA 5 — LOGBOOK
════════════════════════════════════ */

let _activeNoteId = null;

function populateTab5(agent) {
  _activeNoteId = null;
  renderLogbookList(agent);
  showLogbookEmpty();
}

function renderLogbookList(agent) {
  const list  = $('#logbook-list');
  const empty = $('#logbook-list-empty');
  if (!list) return;

  $$('.logbook-item', list).forEach(i => i.remove());

  const notes = agent.notes || [];
  if (!notes.length) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  notes.forEach((note, idx) => {
    const li = document.createElement('li');
    li.className = 'logbook-item';
    li.dataset.noteId = note.id;
    if (note.id === _activeNoteId) li.classList.add('active');

    li.innerHTML = `
      <span class="logbook-item__slash">/</span>
      <span class="logbook-item__title">${esc(note.title || `NOTA #${String(idx+1).padStart(2,'0')}`)}</span>
    `;

    li.addEventListener('click', () => openLogbookNote(note.id));
    list.appendChild(li);
  });
}

function openLogbookNote(noteId) {
  const agent = getActiveAgent();
  const note  = agent.notes.find(n => n.id === noteId);
  if (!note) return;

  _activeNoteId = noteId;

  // Highlight active in sidebar
  $$('.logbook-item').forEach(li => {
    li.classList.toggle('active', li.dataset.noteId === noteId);
  });

  // Fill panel
  const idx     = agent.notes.indexOf(note) + 1;
  const dateStr = note.createdAt
    ? new Date(note.createdAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase()
    : '—';

  $('#logbook-entry-index').textContent = `NOTA #${String(idx).padStart(2,'0')}`;
  $('#logbook-entry-date').textContent  = dateStr;
  $('#logbook-entry-title').value   = note.title   || '';
  $('#logbook-entry-content').value = note.content || '';

  // Show entry, hide empty state
  $('#logbook-empty-state').style.display = 'none';
  $('#logbook-entry').hidden = false;

  // Focus content if title is set, otherwise title
  if (note.title) {
    $('#logbook-entry-content').focus();
  } else {
    $('#logbook-entry-title').focus();
  }
}

function showLogbookEmpty() {
  $('#logbook-empty-state').style.display = '';
  $('#logbook-entry').hidden = true;
  _activeNoteId = null;
  $$('.logbook-item').forEach(li => li.classList.remove('active'));
}

function bindLogbook() {
  // Add note
  $('#btn-add-note').addEventListener('click', () => {
    const note  = addNote();
    const agent = getActiveAgent();
    renderLogbookList(agent);
    openLogbookNote(note.id);
  });

  // Close note
  $('#logbook-btn-close').addEventListener('click', showLogbookEmpty);

  // Delete note
  $('#logbook-btn-delete').addEventListener('click', () => {
    if (!_activeNoteId) return;
    removeNote(_activeNoteId);
    showLogbookEmpty();
    renderLogbookList(getActiveAgent());
    showToast('Nota removida.', 'success');
  });

  // Title input
  $('#logbook-entry-title').addEventListener('input', e => {
    if (!_activeNoteId) return;
    updateNoteField(_activeNoteId, 'title', e.target.value);
    // Update sidebar title live
    const li = $(`.logbook-item[data-note-id="${_activeNoteId}"]`);
    if (li) {
      const agent = getActiveAgent();
      const idx   = agent.notes.findIndex(n => n.id === _activeNoteId) + 1;
      const titleEl = li.querySelector('.logbook-item__title');
      if (titleEl) titleEl.textContent = e.target.value || `NOTA #${String(idx).padStart(2,'0')}`;
    }
  });

  // Content textarea
  $('#logbook-entry-content').addEventListener('input', e => {
    if (!_activeNoteId) return;
    updateNoteField(_activeNoteId, 'content', e.target.value);
  });
}

/* ════════════════════════════════════
   MODAIS
════════════════════════════════════ */
export function showNewAgentModal()  { $('#new-agent-name').value=''; $('#new-agent-title').value=''; $('#modal-new-agent').hidden=false; $('#new-agent-name').focus(); }
export function hideNewAgentModal()  { $('#modal-new-agent').hidden=true; }

let _pendingDeleteId = null;
export function showDeleteModal(id, name) { _pendingDeleteId=id; $('#delete-agent-name-display').textContent=name||'personagem'; $('#modal-confirm-delete').hidden=false; }
export function hideDeleteModal()         { _pendingDeleteId=null; $('#modal-confirm-delete').hidden=true; }
export function confirmDelete() {
  if (!_pendingDeleteId) return;
  const onSheet = getActiveAgent()?.id === _pendingDeleteId;
  deleteAgent(_pendingDeleteId);
  hideDeleteModal();
  showToast('Personagem deletado.','success');
  if (onSheet) closeSheet(); else renderRoster();
  _pendingDeleteId = null;
}

/* ── Modal: Exportar ── */
export function showExportModal() {
  $('#modal-export').hidden = false;
}
export function hideExportModal() {
  $('#modal-export').hidden = true;
}
function bindExportModal() {
  $('#modal-close-export').addEventListener('click', hideExportModal);
  $('#modal-export').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideExportModal();
  });
  $('#export-btn-json').addEventListener('click', () => {
    exportAgent();
    hideExportModal();
    showToast('Exportado como .json!', 'success');
  });
  $('#export-btn-txt').addEventListener('click', () => {
    exportAgentTxt();
    hideExportModal();
    showToast('Exportado como .txt!', 'success');
  });
}

/* ════════════════════════════════════
   BINDINGS — FICHA
════════════════════════════════════ */
export function bindSheetEvents() {

  // Tabs
  $$('.tab').forEach(t => t.addEventListener('click', () => activateTab(Number(t.dataset.tab))));

  // Exportar modal
  bindExportModal();

  // Header
  $('#btn-back').addEventListener('click', closeSheet);
  $('#btn-config').addEventListener('click', showConfigModal);
  bindConfigModal();
  $('#btn-export').addEventListener('click', showExportModal);
  $('#btn-delete-agent').addEventListener('click', () => { const a=getActiveAgent(); if(a) showDeleteModal(a.id,a.name); });

  // ── Foto: novo sistema ──
  // Placeholder clicável (estado vazio)
  $('#photo-placeholder').addEventListener('click', () => $('#photo-input').click());
  // Botão Trocar
  $('#photo-btn-change').addEventListener('click', e => { e.stopPropagation(); $('#photo-input').click(); });
  // Botão Mover — toggle modo
  $('#photo-btn-move').addEventListener('click', e => { e.stopPropagation(); toggleMoveMode(); });
  $('#photo-input').addEventListener('change', handlePhotoUpload);
  bindPhotoDrag();

  // ── Campos data-field ──
  $$('[data-field]', document.getElementById('view-sheet')).forEach(el => {
    const ev = el.tagName==='TEXTAREA' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      const field = el.dataset.field;
      if (!field) return;
      const numFields = ['vidaCur','vidaMax','bmCur','rd','credits','age','birthdate'];
      const val = numFields.includes(field) ? Number(el.value) : el.value;
      setField(field, val);
      const agent = getActiveAgent();
      if (field==='vidaCur'||field==='vidaMax') { updateVidaBar(agent); updateSummary(agent); }
      if (field==='bmCur')  { setBmCur(val); updateBmBar(agent); updateSummary(agent); }
      if (field==='name')   { $('#sheet-agent-name').textContent = val||'—'; }
      if (field==='title')  { $('#sheet-agent-title').textContent= val||'—'; }
    });
  });

  // ── Steppers de atributo ──
  $$('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (!target) return;
      stepAttr(target, btn.dataset.action);
      const agent = getActiveAgent();
      $(`#attr-${target}`).textContent     = agent.attrs[target];
      $(`#attr-bar-${target}`).style.width = `${(agent.attrs[target]/12)*100}%`;
      if (target==='raz'||target==='ins') {
        updateBmBar(agent);
        const newMax = calcBmMax(agent);
        if (agent.bmCur > newMax) { setBmCur(newMax); $('#bm-cur').value=newMax; updateBmBar(getActiveAgent()); }
      }
      updateSummary(agent);
      populateTab2(agent);
    });
  });

  // ── Botões rápidos Vida / BM ──
  $$('.sqb[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target; // 'vida' | 'bm'
      const action = btn.dataset.action; // 'max' | 'delta'
      const agent  = getActiveAgent();
      if (!agent) return;

      if (target === 'vida') {
        let cur = agent.vidaCur, max = agent.vidaMax;
        if (action==='max')   cur = max;
        if (action==='delta') {
          const raw = $('#vida-delta-input').value.trim();
          const n   = parseInt(raw, 10);
          if (!isNaN(n)) cur = Math.max(-10, Math.min(max, cur+n));
          $('#vida-delta-input').value = '';
        }
        const prevVida = agent.vidaCur;
        setVidaCur(cur);
        const updatedVida = getActiveAgent();
        $('#vida-cur').value = updatedVida.vidaCur;
        updateVidaBar(updatedVida);
        updateSummary(updatedVida);
        sendStatus('vida', updatedVida.vidaCur - prevVida);
      }

      if (target === 'bm') {
        const max = calcBmMax(agent);
        let cur = agent.bmCur;
        if (action==='max')   cur = max;
        if (action==='delta') {
          const raw = $('#bm-delta-input').value.trim();
          const n   = parseInt(raw, 10);
          if (!isNaN(n)) cur = Math.max(0, Math.min(max, cur+n));
          $('#bm-delta-input').value = '';
        }
        const prevBm = agent.bmCur;
        setBmCur(cur);
        const updatedBm = getActiveAgent();
        $('#bm-cur').value = updatedBm.bmCur;
        updateBmBar(updatedBm);
        updateSummary(updatedBm);
        sendStatus('bm', updatedBm.bmCur - prevBm);
      }
    });
  });

  // Enter nos inputs delta
  ['#vida-delta-input','#bm-delta-input'].forEach(sel => {
    const inp = $(sel);
    if (!inp) return;
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const target = sel.includes('vida') ? 'vida' : 'bm';
        $$(`.sqb[data-target="${target}"][data-action="delta"]`).forEach(b => b.click());
      }
    });
  });

  // ── Steppers Desenvolvimento ──
  $$('[data-dev-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.devField;
      const dir   = btn.dataset.devAction;
      stepDev(field, dir);
      const agent = getActiveAgent();
      const limits = { devAprendizado:5, devDesenvolvimento:30, devPotencial:10 };
      const idMap  = { devAprendizado:'dev-aprendizado', devDesenvolvimento:'dev-desenvolvimento', devPotencial:'dev-potencial' };
      const barMap = { devAprendizado:'dev-bar-aprendizado', devDesenvolvimento:'dev-bar-desenvolvimento', devPotencial:'dev-bar-potencial' };
      const v = agent[field] ?? 0;
      $(`#${idMap[field]}`).textContent   = v;
      $(`#${barMap[field]}`).style.width  = `${(v/limits[field])*100}%`;
    });
  });

  // ── Contadores Arsenal ──
  $$('.counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target  = btn.dataset.target;
      const field   = target==='rd' ? 'rd' : 'credits';
      const inputEl = target==='rd' ? $('#rd-val') : $('#credits-val');
      const next    = btn.dataset.action==='inc' ? (Number(inputEl.value)||0)+1 : Math.max(0,(Number(inputEl.value)||0)-1);
      inputEl.value = next;
      setField(field, next);
    });
  });

  // ── RD Presets ──
  $$('.rd-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const rd   = Number(btn.dataset.rd);
      const tier = btn.dataset.tier;
      setField('rd', rd);
      setField('rdTier', tier);
      $('#rd-val').value = rd;
      $$('.rd-preset').forEach(b => b.classList.toggle('active', b.dataset.tier===tier));
    });
  });

  // ── Hexágonos Fontes de Ação ──
  $$('#hex-group .hex-pip').forEach(h => {
    h.addEventListener('click', () => {
      toggleActionSource(Number(h.dataset.index));
      h.classList.toggle('active', getActiveAgent().actionSources[Number(h.dataset.index)]);
    });
  });

  // ── Tipo de Fonte ──
  $('#fonte-type').addEventListener('change', e => setField('fonteType', e.target.value));

  // ── Tipo do Personagem (Ordem / Adrenalina / Ruína) ──
  $$('.char-type-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setField('charType', btn.dataset.type);
      $$('.char-type-option').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // ── Salvaguarda (testes contra a morte) ──
  $$('#salvaguarda-vida-group .hex-pip').forEach((h, i) => {
    h.addEventListener('click', () => {
      toggleSalvaguarda('vida', i);
      h.classList.toggle('active', getActiveAgent().salvaguardaVida[i]);
    });
  });
  $$('#salvaguarda-morte-group .hex-pip').forEach((h, i) => {
    h.addEventListener('click', () => {
      toggleSalvaguarda('morte', i);
      h.classList.toggle('active', getActiveAgent().salvaguardaMorte[i]);
    });
  });

  // ── Condições Ativas ──
  $('#active-conditions')?.addEventListener('input', e => setField('activeConditions', e.target.value));

  // ── Arsenal: adicionar item ──
  $('#btn-add-equipment').addEventListener('click', () => {
    const item = addEquipment();
    const tbody = $('#equipment-body');
    $('#equipment-empty').style.display = 'none';
    tbody.appendChild(buildEquipmentRow(item));
    renderWeapons(getActiveAgent());
    populateInitiativeWeaponSelect(getActiveAgent());
  });

  // ── Arsenal: adicionar veículo ──
  $('#btn-add-vehicle')?.addEventListener('click', () => {
    addVehicle();
    renderVehicleTable(getActiveAgent());
  });

  // ── Arsenal: adicionar consumível ──
  $('#btn-add-consumable')?.addEventListener('click', () => {
    addConsumable();
    renderConsumableTable(getActiveAgent());
  });

  // ── Perícias: seletor de arma para Iniciativa ──
  $('#initiative-weapon-select')?.addEventListener('change', e => {
    setField('initiativeWeaponId', e.target.value);
    const initVal = $('#initiative-val');
    if (initVal) initVal.textContent = calcInitiativeMod(getActiveAgent());
  });

  // ── Perícias: rolar Iniciativa ──
  $('#btn-roll-initiative')?.addEventListener('click', () => {
    rollInitiative();
  });

  // ── Habilidades: adicionar ──
  $('#btn-add-ability').addEventListener('click', () => {
    const a    = addAbility();
    const grid = $('#abilities-grid');
    $('#abilities-empty').style.display = 'none';
    grid.insertBefore(buildAbilityCard(a), $('#abilities-empty'));
  });

  // ── Logbook (Aba 5) ──
  bindLogbook();

  // ── Limpar histórico de rolagens ──
  $('#btn-clear-history').addEventListener('click', () => {
    clearRollHistory();
    populateRollHistory(getActiveAgent());
    // Limpar display atual
    $('#roll-result-skill').textContent = '—';
    $('#roll-d1').textContent           = '—';
    $('#roll-d2').textContent           = '—';
    $('#roll-mod').textContent          = '0';
    $('#roll-total').textContent        = '—';
    $('#roll-total').style.color        = '';
  });
}

/* ════════════════════════════════════
   BINDINGS — ROSTER
════════════════════════════════════ */
export function bindRosterEvents() {
  $('#btn-new-agent').addEventListener('click', showNewAgentModal);
  $('#modal-close-new').addEventListener('click', hideNewAgentModal);
  $('#modal-cancel-new').addEventListener('click', hideNewAgentModal);
  $('#modal-new-agent').addEventListener('click', e => { if(e.target===e.currentTarget) hideNewAgentModal(); });

  $('#modal-confirm-new').addEventListener('click', () => {
    const name  = $('#new-agent-name').value.trim();
    const title = $('#new-agent-title').value.trim();
    if (!name) { $('#new-agent-name').focus(); showToast('Informe um nome.','error'); return; }
    const agent = createAgent(name, title);
    hideNewAgentModal();
    openSheet(agent.id);
  });
  $('#new-agent-name').addEventListener('keydown', e => { if(e.key==='Enter') $('#modal-confirm-new').click(); });

  $('#modal-close-delete').addEventListener('click', hideDeleteModal);
  $('#modal-cancel-delete').addEventListener('click', hideDeleteModal);
  $('#modal-confirm-delete').addEventListener('click', e => { if(e.target===e.currentTarget) hideDeleteModal(); });
  $('#modal-confirm-delete-btn').addEventListener('click', confirmDelete);

  $('#btn-import').addEventListener('click', () => $('#import-file-input').click());
  $('#import-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await importAgentFromFile(file, { onConflict: name => confirm(`"${name}" já existe. Substituir?`) });
    e.target.value = '';
    if (!result.success) { showToast('Arquivo inválido.','error'); return; }
    showToast(`"${result.agent.name}" importado!`,'success');
    renderRoster();
  });
}

/* ════════════════════════════════════
   FOTO: UPLOAD + DRAG TO REPOSITION
════════════════════════════════════ */
/* ════════════════════════════════════
   MODAL DE CONFIGURAÇÕES
════════════════════════════════════ */
export function showConfigModal() {
  const agent = getActiveAgent();
  if (!agent) return;
  $('#config-webhook-rolagens').value = agent.webhookRolagens || '';
  $('#config-webhook-status').value   = agent.webhookStatus   || '';
  $('#config-feedback-rolagens').textContent = '';
  $('#config-feedback-status').textContent   = '';
  $('#config-feedback-rolagens').className   = 'config-feedback';
  $('#config-feedback-status').className     = 'config-feedback';
  markActiveTheme();
  $('#modal-config').hidden = false;
}

export function hideConfigModal() {
  $('#modal-config').hidden = true;
}

function markActiveTheme() {
  const current = getTheme();
  $$('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === current);
  });
}

function bindConfigModal() {
  $('#modal-close-config').addEventListener('click', hideConfigModal);
  $('#modal-cancel-config').addEventListener('click', hideConfigModal);
  $('#modal-config').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideConfigModal();
  });

  // Seletor de tema — aplica imediatamente ao clicar
  $$('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.theme);
      markActiveTheme();
      showToast('Tema aplicado!', 'success');
    });
  });

  $('#modal-save-config').addEventListener('click', () => {
    const rolagens = $('#config-webhook-rolagens').value.trim();
    const status   = $('#config-webhook-status').value.trim();
    setField('webhookRolagens', rolagens);
    setField('webhookStatus',   status);
    hideConfigModal();
    showToast('Configurações salvas!', 'success');
  });

  // Testar rolagens
  $('#config-test-rolagens').addEventListener('click', async () => {
    const url = $('#config-webhook-rolagens').value.trim();
    const fb  = $('#config-feedback-rolagens');
    if (!url) { fb.textContent = 'Cole uma URL antes de testar.'; fb.className = 'config-feedback error'; return; }
    fb.textContent = 'Enviando...'; fb.className = 'config-feedback loading';
    const ok = await sendTest(url, 'rolagens');
    fb.textContent = ok ? '✓ Mensagem enviada com sucesso!' : '✗ Falha — verifique a URL.';
    fb.className   = `config-feedback ${ok ? 'ok' : 'error'}`;
  });

  // Testar status
  $('#config-test-status').addEventListener('click', async () => {
    const url = $('#config-webhook-status').value.trim();
    const fb  = $('#config-feedback-status');
    if (!url) { fb.textContent = 'Cole uma URL antes de testar.'; fb.className = 'config-feedback error'; return; }
    fb.textContent = 'Enviando...'; fb.className = 'config-feedback loading';
    const ok = await sendTest(url, 'status');
    fb.textContent = ok ? '✓ Mensagem enviada com sucesso!' : '✗ Falha — verifique a URL.';
    fb.className   = `config-feedback ${ok ? 'ok' : 'error'}`;
  });
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const b64         = ev.target.result;
    const photo       = $('#agent-photo');
    const wrapper     = $('#photo-wrapper');
    const placeholder = $('#photo-placeholder');

    setField('photo', b64);
    setPhotoOffset(50, 50, 1);

    photo.src                  = b64;
    photo.style.objectPosition = '50% 50%';
    photo.style.transform      = 'scale(1)';
    photo.style.transformOrigin= '50% 50%';
    photo.style.display        = 'block';
    wrapper.classList.add('has-photo');
    wrapper.classList.remove('move-active');
    if (placeholder) placeholder.style.display = 'none';

    const zoomInput = $('#photo-zoom-input');
    const zoomLabel = $('#photo-zoom-label');
    if (zoomInput) zoomInput.value = 1;
    if (zoomLabel) zoomLabel.textContent = 'zoom 1.0×';

    showToast('Foto atualizada!', 'success');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

/* Toggle modo mover (ativa/desativa drag + zoom) */
function toggleMoveMode() {
  const wrapper = $('#photo-wrapper');
  const btn     = $('#photo-btn-move');
  if (!wrapper.classList.contains('has-photo')) return;
  const active = wrapper.classList.toggle('move-active');
  if (btn) btn.classList.toggle('active', active);
}

function bindPhotoDrag() {
  const wrapper = $('#photo-wrapper');
  const photo   = $('#agent-photo');
  let dragging  = false;
  let startX, startY, startOX, startOY;

  function isMoveActive() { return wrapper.classList.contains('move-active'); }

  function applyZoom(scale) {
    const agent = getActiveAgent();
    const ox    = agent?.photoOffsetX ?? 50;
    const oy    = agent?.photoOffsetY ?? 50;
    photo.style.transform       = `scale(${scale})`;
    photo.style.transformOrigin = `${ox}% ${oy}%`;
    const label = $('#photo-zoom-label');
    const input = $('#photo-zoom-input');
    if (label) label.textContent = `zoom ${scale.toFixed(1)}×`;
    if (input) input.value = scale;
  }

  function savePosition() {
    const pos   = photo.style.objectPosition.match(/([\d.]+)%\s+([\d.]+)%/);
    const scale = parseFloat(photo.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
    if (pos) setPhotoOffset(parseFloat(pos[1]), parseFloat(pos[2]), scale);
  }

  // ── Zoom slider ──
  wrapper.addEventListener('input', e => {
    if (e.target.id !== 'photo-zoom-input') return;
    applyZoom(parseFloat(e.target.value));
    savePosition();
  });

  // ── Scroll wheel zoom (só no modo mover) ──
  wrapper.addEventListener('wheel', e => {
    if (!isMoveActive()) return;
    const agent = getActiveAgent();
    if (!agent?.photo) return;
    e.preventDefault();
    const cur  = parseFloat(photo.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
    const next = Math.max(1, Math.min(3, cur + (e.deltaY < 0 ? 0.1 : -0.1)));
    applyZoom(next);
    savePosition();
  }, { passive: false });

  // ── Mouse drag (só no modo mover) ──
  wrapper.addEventListener('mousedown', e => {
    if (!isMoveActive()) return;
    const agent = getActiveAgent();
    if (!agent?.photo || e.button !== 0) return;
    if (e.target.id === 'photo-zoom-input') return;
    if (e.target.closest('.photo-ctrl-btn')) return;
    dragging = true;
    startX   = e.clientX; startY  = e.clientY;
    startOX  = agent.photoOffsetX ?? 50;
    startOY  = agent.photoOffsetY ?? 50;
    photo.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx   = e.clientX - startX;
    const dy   = e.clientY - startY;
    const W    = wrapper.offsetWidth;
    const H    = wrapper.offsetHeight;
    const newX = Math.max(0, Math.min(100, startOX - (dx / W) * 100));
    const newY = Math.max(0, Math.min(100, startOY - (dy / H) * 100));
    photo.style.objectPosition  = `${newX}% ${newY}%`;
    photo.style.transformOrigin = `${newX}% ${newY}%`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    photo.classList.remove('dragging');
    savePosition();
  });

  // ── Touch drag (só no modo mover) ──
  wrapper.addEventListener('touchstart', e => {
    if (!isMoveActive()) return;
    const agent = getActiveAgent();
    if (!agent?.photo || e.touches.length !== 1) return;
    const t  = e.touches[0];
    dragging = true;
    startX   = t.clientX; startY = t.clientY;
    startOX  = agent.photoOffsetX ?? 50;
    startOY  = agent.photoOffsetY ?? 50;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const t    = e.touches[0];
    const dx   = t.clientX - startX;
    const dy   = t.clientY - startY;
    const W    = wrapper.offsetWidth;
    const H    = wrapper.offsetHeight;
    const newX = Math.max(0, Math.min(100, startOX - (dx / W) * 100));
    const newY = Math.max(0, Math.min(100, startOY - (dy / H) * 100));
    photo.style.objectPosition  = `${newX}% ${newY}%`;
    photo.style.transformOrigin = `${newX}% ${newY}%`;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    savePosition();
  });

  // ── Init zoom from saved state ──
  const agent = getActiveAgent();
  if (agent?.photo) applyZoom(agent.photoScale ?? 1);
}

/* ── helper ── */
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
