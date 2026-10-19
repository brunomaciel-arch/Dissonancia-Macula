/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — master.js
   Tela de MESTRE: login, campanhas, leitura das fichas dos
   jogadores (somente leitura) e concessão de itens/habilidades.
   O mestre nunca escreve na ficha: ele deposita a concessão
   numa caixa de entrada; o app do jogador a incorpora.
   ══════════════════════════════════════════════════════ */

import { cloud } from './cloud.js';
import { generateCode, formatCode, explainError, signInWithGoogle } from './campaign.js';
import { calcBmMax, calcSkillMod, calcInitiativeMod, CHAR_TYPE_LABELS } from './state.js';

const $ = (s, c = document) => c.querySelector(s);

let ctx = { toast: () => {}, showView: () => {}, onExit: () => {} };

const S = {
  user: null, campaigns: [], code: '', chars: [],
  unsubChars: null, detailId: '', unsubGrants: null, pending: 0,
};

/* ══════════ Utilitários ══════════ */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = v => Number(v) || 0;
const pct = (cur, max) => (max > 0 && cur > 0 ? Math.min(100, (cur / max) * 100) : 0);

export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - num(ts)) / 1000));
  if (s < 60) return 'agora há pouco';
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/** Só aceita miniaturas no formato esperado (dado vindo de outro usuário). */
export function safeThumb(s) {
  return typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
}

/** Normaliza uma ficha vinda da nuvem para que os cálculos nunca quebrem. */
export function safeSheet(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  const attrs = { raz: 0, ins: 0, pre: 0, prs: 0, fis: 0 };
  Object.keys(attrs).forEach(k => { attrs[k] = num(s.attrs?.[k]); });
  const arr = v => (Array.isArray(v) ? v : []);
  return {
    ...s, attrs,
    equipment: arr(s.equipment), vehicles: arr(s.vehicles),
    consumables: arr(s.consumables), abilities: arr(s.abilities),
    actionSources: arr(s.actionSources), salvaguardaVida: arr(s.salvaguardaVida), salvaguardaMorte: arr(s.salvaguardaMorte),
  };
}

const SKILLS = [
  ['Atletismo', 'fis'], ['Força', 'fis'], ['Resistência Física', 'fis'],
  ['Sobrevivência', 'ins'], ['Intuição', 'ins'], ['Percepção', 'ins'],
  ['Tecnologia', 'raz'], ['Raciocínio', 'raz'], ['Prestidigitação', 'pre'],
  ['Furtividade', 'prs'], ['Engano', 'prs'], ['Presença', 'prs'],
  ['Redirecionamento', 'pre_fis'], ['Medicina', 'pre_raz'], ['Confecção e Reparo', 'pre_raz'],
  ['Resistência Mental', 'raz_ins'], ['Concentração', 'pre_raz'], ['Agilidade', 'pre_ins'],
  ['Pilotagem', 'pre_ins'], ['Investigação', 'raz_ins'], ['Negociação', 'raz_prs'],
];

const FUNCTION_LABELS = { sobrevivencia: 'Sobrevivência', ofensiva: 'Ofensiva', utilidade: 'Utilidade' };
const ABILITY_LABELS  = { ordem: 'Ordem', ruina: 'Ruína', adrenalina: 'Adrenalina' };
const CATEGORY_LABELS = { leve: 'Leve', medio: 'Médio', pesado: 'Pesado', aereo: 'Aéreo' };

/* ══════════ Entrada / saída da tela ══════════ */
export function openMaster() {
  ctx.showView('master');
  refreshAuth();
}

function closeMaster() {
  stopWatchingChars();
  stopWatchingGrants();
  S.code = ''; S.chars = []; S.detailId = '';
  closeDetail();
  ctx.onExit();
}

function notice(msg) {
  const el = $('#master-notice');
  el.textContent = msg || '';
  el.hidden = !msg;
}

/* ══════════ Autenticação ══════════ */
async function refreshAuth() {
  $('#master-campaigns-panel').hidden = true;
  $('#master-players-panel').hidden = true;

  if (!cloud.isConfigured()) {
    notice('O Firebase ainda não foi configurado neste site. Preencha o arquivo firebase-config.js (veja o README) para usar o modo Mestre.');
    renderAuth();
    return;
  }
  notice('');
  try {
    const u = await cloud.currentUser();
    S.user = (u && !u.isAnonymous) ? u : null;
  } catch (e) { notice(explainError(e)); return; }

  renderAuth();
  if (S.user) await loadCampaigns();
  else notice('Entre com sua conta Google para criar e acompanhar campanhas.');
}

function renderAuth() {
  $('#master-user').textContent = S.user ? (S.user.email || 'Conta Google') : 'sem login';
  $('#master-btn-login').hidden  = !!S.user || !cloud.isConfigured();
  $('#master-btn-logout').hidden = !S.user;
}

/* ══════════ Campanhas ══════════ */
async function loadCampaigns() {
  try { S.campaigns = await cloud.listMyCampaigns(S.user.uid); }
  catch (e) { notice(explainError(e)); return; }
  $('#master-campaigns-panel').hidden = false;
  renderCampaigns();
}

function renderCampaigns() {
  const list = $('#master-campaign-list');
  if (!S.campaigns.length) {
    list.innerHTML = '<p class="table-empty">Nenhuma campanha ainda. Dê um nome e gere um código.</p>';
    return;
  }
  list.innerHTML = S.campaigns.map(c => `
    <button class="master-campaign${c.code === S.code ? ' active' : ''}" data-code="${esc(c.code)}">
      <span class="master-campaign__name">${esc(c.name || 'Campanha')}</span>
      <span class="master-campaign__code">${esc(formatCode(c.code))}</span>
    </button>`).join('');
  list.querySelectorAll('.master-campaign').forEach(b =>
    b.addEventListener('click', () => selectCampaign(b.dataset.code)));
}

async function createCampaign() {
  const input = $('#master-new-name');
  const name = input.value.trim() || 'Nova campanha';
  const btn = $('#master-btn-create');
  btn.disabled = true;
  try {
    for (let i = 0; i < 5; i++) {
      const code = generateCode();
      if ((await cloud.getCampaign(code)).exists) continue;
      await cloud.createCampaign(code, name, S.user.uid);
      input.value = '';
      await loadCampaigns();
      selectCampaign(code);
      ctx.toast(`Campanha criada! Código: ${formatCode(code)}`, 'success');
      return;
    }
    ctx.toast('Não foi possível gerar um código livre. Tente de novo.', 'error');
  } catch (e) { ctx.toast(explainError(e), 'error'); }
  finally { btn.disabled = false; }
}

function stopWatchingChars() { if (S.unsubChars) S.unsubChars(); S.unsubChars = null; }

function selectCampaign(code) {
  stopWatchingChars();
  S.code = code; S.chars = [];
  const camp = S.campaigns.find(c => c.code === code);
  $('#master-camp-title').textContent = camp?.name || 'Campanha';
  $('#master-camp-code').textContent = formatCode(code);
  $('#master-players-panel').hidden = false;
  renderCampaigns();
  renderPlayers();
  S.unsubChars = cloud.watchCharacters(code, list => {
    S.chars = list.sort((a, b) => num(b.updatedAt) - num(a.updatedAt));
    renderPlayers();
    if (S.detailId) renderDetail();
  }, err => notice(explainError(err)));
}

/* ══════════ Cards dos jogadores ══════════ */
function renderPlayers() {
  const grid = $('#master-player-grid');
  if (!S.chars.length) {
    grid.innerHTML = '<p class="table-empty">Nenhuma ficha conectada. Entregue o código aos jogadores: cada um o coloca em Campanha, dentro da própria ficha.</p>';
    return;
  }
  grid.innerHTML = S.chars.map(ch => {
    const a = safeSheet(ch.sheet);
    const bmMax = calcBmMax(a);
    const thumb = safeThumb(ch.thumb);
    const tipo  = CHAR_TYPE_LABELS[a.charType] || '';
    const sub   = [ch.title, tipo, a.formaPrimaria].filter(Boolean).join(' · ');
    return `
    <article class="master-player" data-id="${esc(ch.id)}">
      <div class="master-player__thumb">${thumb ? `<img src="${thumb}" alt="" />` : '◈'}</div>
      <div class="master-player__info">
        <p class="agent-card__name">${esc(ch.name || 'Sem nome')}</p>
        <p class="agent-card__title">${esc(sub || '—')}</p>
        <div class="agent-card__bars">
          ${bar('VID', 'green',   num(a.vidaCur), num(a.vidaMax))}
          ${bar('BM',  'cyan',    num(a.bmCur),   bmMax)}
          ${bar('FON', 'magenta', num(a.fonteCur), 10)}
        </div>
        <p class="master-player__time">atualizado ${esc(timeAgo(ch.updatedAt))}</p>
      </div>
    </article>`;
  }).join('');
  grid.querySelectorAll('.master-player').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.id)));
}

function bar(label, color, cur, max) {
  return `<div class="agent-card__bar-row"><span class="agent-card__bar-label">${label}</span>
    <div class="agent-card__bar-track"><div class="agent-card__bar-fill agent-card__bar-fill--${color}" style="width:${pct(cur, max)}%"></div></div>
    <span class="agent-card__bar-vals">${cur}/${max}</span></div>`;
}

/* ══════════ Detalhe (somente leitura) ══════════ */
function stopWatchingGrants() { if (S.unsubGrants) S.unsubGrants(); S.unsubGrants = null; S.pending = 0; }

function openDetail(charId) {
  S.detailId = charId;
  stopWatchingGrants();
  S.unsubGrants = cloud.watchGrants(S.code, charId, list => {
    S.pending = list.length;
    const el = $('#master-pending');
    if (el) el.textContent = S.pending ? `${S.pending} concessão(ões) aguardando o jogador abrir a ficha` : '';
  }, () => {});
  renderDetail();
  $('#modal-master-detail').hidden = false;
}

function closeDetail() {
  $('#modal-master-detail').hidden = true;
  $('#modal-grant').hidden = true;
  stopWatchingGrants();
  S.detailId = '';
}

function pips(arr, total, cls = '') {
  return Array.from({ length: total }, (_, i) => `<span class="pip${arr[i] ? ' active' : ''} ${cls}"></span>`).join('');
}

function renderDetail() {
  const ch = S.chars.find(c => c.id === S.detailId);
  const body = $('#master-detail-body');
  if (!ch) { body.innerHTML = '<p class="table-empty">Esta ficha saiu da campanha.</p>'; return; }

  const a = safeSheet(ch.sheet);
  const bmMax = calcBmMax(a);
  const chips = [
    CHAR_TYPE_LABELS[a.charType] && `Tipo: ${CHAR_TYPE_LABELS[a.charType]}`,
    a.formaPrimaria && `1ª Forma: ${a.formaPrimaria}`,
    a.formaSecundaria && `2ª Forma: ${a.formaSecundaria}`,
    a.age && `Idade: ${a.age}`,
  ].filter(Boolean).map(t => `<span class="md-chip">${esc(t)}</span>`).join('');

  const attrs = [['RAZ', 'raz'], ['INS', 'ins'], ['PRE', 'pre'], ['PRS', 'prs'], ['FIS', 'fis']]
    .map(([l, k]) => `<div class="attr-mini"><span class="attr-mini__label">${l}</span><span class="attr-mini__val">${a.attrs[k]}</span></div>`).join('');

  const skills = SKILLS.map(([n, f]) =>
    `<div class="md-skill"><span>${esc(n)}</span><strong>${calcSkillMod(a, f)}</strong></div>`).join('');

  const equip = a.equipment.length ? `<table class="equipment-table md-table"><thead><tr><th>Nome</th><th>Dano</th><th>Alcance</th><th>Peso</th><th>Qtd</th></tr></thead><tbody>${
    a.equipment.map(e => `<tr><td>${esc(e.name)}${e.description ? `<br><small>${esc(e.description)}</small>` : ''}</td><td>${esc(e.damage)}</td><td>${esc(e.range)}</td><td>${esc(e.weaponWeight)}</td><td>${esc(e.qty)}</td></tr>`).join('')
  }</tbody></table>` : '<p class="table-empty">Sem equipamentos.</p>';

  const vehicles = a.vehicles.length ? a.vehicles.map(v => `
    <div class="md-row"><strong>${esc(v.name || 'Veículo')}</strong> <span class="md-chip">${esc(CATEGORY_LABELS[v.category] || '')}</span>
    <small>Casco ${esc(v.cascoCur)}/${esc(v.cascoMax)} · RD ${esc(v.rd)} · Manobra ${esc(v.maneuver)} · Lesões ${(Array.isArray(v.criticalInjuries) ? v.criticalInjuries : []).filter(Boolean).length}/3</small>
    ${v.properties ? `<small>${esc(v.properties)}</small>` : ''}</div>`).join('') : '<p class="table-empty">Sem veículos.</p>';

  const cons = a.consumables.length ? a.consumables.map(c =>
    `<div class="md-row"><strong>${esc(c.name)}</strong> <span class="md-chip">${esc(FUNCTION_LABELS[c.function] || '')}</span> × ${esc(c.qty)}${c.description ? `<small>${esc(c.description)}</small>` : ''}</div>`).join('')
    : '<p class="table-empty">Sem consumíveis.</p>';

  const abil = a.abilities.length ? a.abilities.map(b => `
    <div class="md-row"><strong>${esc(b.name || 'Habilidade')}</strong> <span class="md-chip">${esc(ABILITY_LABELS[b.type] || '')}</span>
    ${b.description ? `<small>${esc(b.description)}</small>` : ''}${b.refinement ? `<small><em>Refinamento:</em> ${esc(b.refinement)}</small>` : ''}</div>`).join('')
    : '<p class="table-empty">Sem habilidades.</p>';

  body.innerHTML = `
    <div class="md-head">
      <div><h3 class="md-name">${esc(ch.name || 'Sem nome')}</h3><p class="md-title">${esc(ch.title || '')}</p></div>
      <span class="md-time">atualizado ${esc(timeAgo(ch.updatedAt))}</span>
    </div>
    <div class="md-chips">${chips}</div>

    <h4 class="md-h">Status</h4>
    <div class="md-grid">
      <div class="md-stat"><span>Vida</span><strong>${num(a.vidaCur)} / ${num(a.vidaMax)}</strong></div>
      <div class="md-stat"><span>Barreira Mágica</span><strong>${num(a.bmCur)} / ${bmMax}</strong></div>
      <div class="md-stat"><span>Fonte</span><strong>${num(a.fonteCur)} / 10</strong></div>
      <div class="md-stat"><span>Iniciativa</span><strong>${calcInitiativeMod(a)}</strong></div>
      <div class="md-stat"><span>RD (Traje)</span><strong>${num(a.rd)}</strong></div>
      <div class="md-stat"><span>Créditos</span><strong>${num(a.credits)}</strong></div>
    </div>
    <div class="md-pips"><span>Fontes de Ação</span>${pips(a.actionSources, 5)}</div>
    <div class="md-pips"><span>Salvaguarda · Vida</span>${pips(a.salvaguardaVida, 3, 'pip--green')}<span class="md-gap">Morte</span>${pips(a.salvaguardaMorte, 3, 'pip--red')}</div>
    ${a.activeConditions ? `<p class="md-cond"><strong>Condições ativas:</strong> ${esc(a.activeConditions)}</p>` : ''}

    <h4 class="md-h">Atributos</h4>
    <div class="attr-grid-mini">${attrs}</div>

    <h4 class="md-h">Perícias</h4>
    <div class="md-skills">${skills}</div>

    <h4 class="md-h">Equipamentos</h4><div class="table-wrapper">${equip}</div>
    <h4 class="md-h">Veículos</h4>${vehicles}
    <h4 class="md-h">Consumíveis</h4>${cons}
    <h4 class="md-h">Habilidades</h4>${abil}
    <p class="md-pending" id="master-pending">${S.pending ? `${S.pending} concessão(ões) aguardando o jogador abrir a ficha` : ''}</p>
  `;
}

/* ══════════ Concessões ══════════ */
const GRANT_FORMS = {
  equipment: {
    title: 'Conceder equipamento',
    fields: [
      ['name', 'Nome', 'text', 80], ['description', 'Descrição', 'textarea', 500],
      ['market', 'Mercado', 'text', 40], ['damage', 'Dano (ex: 2d6+3)', 'text', 60],
      ['range', 'Alcance', 'text', 60], ['price', 'Preço', 'text', 40],
      ['qty', 'Quantidade', 'number', 0, '1'], ['weaponWeight', 'Peso da arma (ex: +1, -2)', 'text', 6, '+0'],
    ],
  },
  consumable: {
    title: 'Conceder consumível',
    fields: [
      ['name', 'Nome', 'text', 80],
      ['function', 'Função', 'select', 0, 'sobrevivencia', Object.entries(FUNCTION_LABELS)],
      ['description', 'Descrição', 'textarea', 500], ['qty', 'Quantidade', 'number', 0, '1'],
    ],
  },
  ability: {
    title: 'Conceder habilidade',
    fields: [
      ['name', 'Nome', 'text', 80],
      ['type', 'Tipo', 'select', 0, 'ordem', Object.entries(ABILITY_LABELS)],
      ['description', 'Descrição da técnica', 'textarea', 2000], ['refinement', 'Refinamento', 'textarea', 2000],
    ],
  },
};

let _grantKind = 'equipment';

function openGrant(kind) {
  _grantKind = kind;
  const f = GRANT_FORMS[kind];
  $('#grant-title').textContent = f.title;
  $('#grant-form').innerHTML = f.fields.map(([key, label, type, max, def, opts]) => {
    let input;
    if (type === 'textarea') input = `<textarea class="field-textarea" data-key="${key}" maxlength="${max}" rows="3"></textarea>`;
    else if (type === 'select') input = `<select class="field-input field-select" data-key="${key}">${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
    else input = `<input class="field-input" data-key="${key}" type="${type}" ${max ? `maxlength="${max}"` : 'min="0"'} value="${def ?? ''}" />`;
    return `<div class="field-group"><label class="field-label">${label}</label>${input}</div>`;
  }).join('');
  $('#modal-grant').hidden = false;
}

async function submitGrant() {
  if (!S.code || !S.detailId) return;
  const payload = {};
  document.querySelectorAll('#grant-form [data-key]').forEach(el => { payload[el.dataset.key] = el.value; });
  if (!String(payload.name || '').trim()) { ctx.toast('Dê um nome ao que será concedido.', 'error'); return; }
  const btn = $('#grant-btn-send');
  btn.disabled = true;
  try {
    await cloud.addGrant(S.code, S.detailId, { kind: _grantKind, payload, createdAt: Date.now() });
    $('#modal-grant').hidden = true;
    ctx.toast('Concessão enviada. O jogador a recebe ao abrir a ficha.', 'success');
  } catch (e) { ctx.toast(explainError(e), 'error'); }
  finally { btn.disabled = false; }
}

/* ══════════ Ligação dos eventos (chamar uma vez) ══════════ */
export function initMaster(context) {
  ctx = { ...ctx, ...context };

  $('#master-btn-back').addEventListener('click', closeMaster);
  $('#master-btn-login').addEventListener('click', async () => {
    const r = await signInWithGoogle();
    if (!r.ok) { ctx.toast(r.error, 'error'); return; }
    await refreshAuth();
  });
  $('#master-btn-logout').addEventListener('click', async () => {
    stopWatchingChars(); S.code = ''; S.chars = [];
    try { await cloud.signOut(); } catch { /* ignora */ }
    await refreshAuth();
  });
  $('#master-btn-create').addEventListener('click', createCampaign);
  $('#master-new-name').addEventListener('keydown', e => { if (e.key === 'Enter') createCampaign(); });
  $('#master-btn-copy').addEventListener('click', async () => {
    const txt = $('#master-camp-code').textContent;
    try { await navigator.clipboard.writeText(txt); ctx.toast('Código copiado!', 'success'); }
    catch { ctx.toast(`Código: ${txt}`); }
  });

  $('#master-detail-close').addEventListener('click', closeDetail);
  $('#modal-master-detail').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });
  $('#master-grant-item').addEventListener('click', () => openGrant('equipment'));
  $('#master-grant-consumable').addEventListener('click', () => openGrant('consumable'));
  $('#master-grant-ability').addEventListener('click', () => openGrant('ability'));

  $('#grant-btn-cancel').addEventListener('click', () => { $('#modal-grant').hidden = true; });
  $('#grant-btn-close').addEventListener('click', () => { $('#modal-grant').hidden = true; });
  $('#grant-btn-send').addEventListener('click', submitGrant);
}
