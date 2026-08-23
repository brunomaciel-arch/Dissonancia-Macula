/* ══════════════════════════════════════════════════════
   LIMIAR DA CORRUPÇÃO — state.js  (v2)
   ══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'limiar_agents';

function createDefaultAgent(name = 'Novo Personagem', title = '') {
  return {
    id:        generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),

    // Aba 0 — Identidade
    name, title,
    forma: '', age: '', birthdate: '', history: '',
    photo: '',
    photoOffsetX: 50,   // % object-position horizontal
    photoOffsetY: 50,   // % object-position vertical
    photoScale:   1,    // zoom 1x–3x

    // Discord webhooks (por personagem)
    webhookRolagens: '',
    webhookStatus:   '',

    // Aba 1 — Atributos (0–12)
    attrs: { raz: 0, ins: 0, pre: 0, prs: 0, fis: 0 },

    // Aba 1 — Status Vitais
    vidaCur: 0, vidaMax: 0,
    bmCur:   0,

    // Fonte
    fonteCur: 0, fonteType: 'poder',

    // Fontes de Ação
    actionSources: [false, false, false, false, false],

    // Aba 1 — Desenvolvimento
    devAprendizado:     0,   // 0–5
    devDesenvolvimento: 0,   // 0–30
    devPotencial:       0,   // 0–10

    // Aba 2 — Histórico de rolagens (persistido)
    rollHistory: [],         // [{ skill, d1, d2, mod, total, ts }]

    // Aba 3 — Arsenal
    rd: 0, credits: 0,
    rdTier: 'comum',         // 'comum' | 'desenvolvido' | 'avancado'
    equipment: [],
    vehicles: [],

    // Aba 4 — Habilidades
    abilities: [],

    // Aba 5 — Anotações
    notes: [],
  };
}

function createEquipmentItem() {
  return { id: generateId(), name: '', description: '', market: '', damage: '', range: '', price: '', qty: 1, weaponAttr: 'fis', weaponBonus: 0 };
}

function createVehicleItem() {
  return { id: generateId(), type: '', market: '', maneuver: '', properties: '', criticalInjuries: '' };
}

function createAbility() {
  return { id: generateId(), name: '', type: 'ordem', description: '', refinement: '' };
}

function createNote() {
  return { id: generateId(), title: '', content: '', createdAt: Date.now() };
}

function generateId() {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function mergeWithDefaults(agent) {
  const defaults = createDefaultAgent();
  const merged   = { ...defaults, ...agent };
  merged.attrs   = { ...defaults.attrs, ...(agent.attrs || {}) };
  merged.actionSources = Array.isArray(agent.actionSources) ? agent.actionSources : defaults.actionSources;
  merged.equipment  = Array.isArray(agent.equipment)
    ? agent.equipment.map(e => ({ weaponAttr: 'fis', weaponBonus: 0, ...e }))
    : [];
  merged.vehicles = Array.isArray(agent.vehicles) ? agent.vehicles : [];
  merged.abilities  = Array.isArray(agent.abilities)  ? agent.abilities  : [];
  merged.notes = Array.isArray(agent.notes)
    ? agent.notes.map(n => ({ createdAt: Date.now(), ...n }))
    : [];
  merged.rollHistory = Array.isArray(agent.rollHistory) ? agent.rollHistory : [];
  // photo offset defaults
  if (merged.photoOffsetX === undefined) merged.photoOffsetX = 50;
  if (merged.photoOffsetY === undefined) merged.photoOffsetY = 50;
  // desenvolvimento defaults
  if (merged.devAprendizado     === undefined) merged.devAprendizado     = 0;
  if (merged.devDesenvolvimento === undefined) merged.devDesenvolvimento = 0;
  if (merged.devPotencial       === undefined) merged.devPotencial       = 0;
  if (merged.rdTier             === undefined) merged.rdTier             = 'comum';
  // migração: campo renomeado de 'focus' para 'forma'
  if (!merged.forma && agent.focus) merged.forma = agent.focus;
  // photo scale default
  if (merged.photoScale === undefined) merged.photoScale = 1;
  // webhook defaults
  if (merged.webhookRolagens === undefined) merged.webhookRolagens = '';
  if (merged.webhookStatus   === undefined) merged.webhookStatus   = '';
  return merged;
}

/* ── CÁLCULOS ── */
export function calcBmMax(agent) {
  return (agent.attrs.raz + agent.attrs.ins) * 5;
}

export function calcSkillMod(agent, formula) {
  const a = agent.attrs;
  const map = {
    fis: a.fis, ins: a.ins, raz: a.raz, pre: a.pre, prs: a.prs,
    pre_fis: Math.floor((a.pre + a.fis) / 2),
    pre_raz: Math.floor((a.pre + a.raz) / 2),
    raz_ins: Math.floor((a.raz + a.ins) / 2),
    pre_ins: Math.floor((a.pre + a.ins) / 2),
    raz_prs: Math.floor((a.raz + a.prs) / 2),
  };
  return map[formula] ?? 0;
}

/* ── LOCALSTORAGE ── */
export function loadAllAgents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(mergeWithDefaults);
    return Object.values(parsed).map(mergeWithDefaults);
  } catch (e) { console.error('[State] load:', e); return []; }
}

function saveAllAgents(agents) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(agents)); return true; }
  catch (e) { console.error('[State] save:', e); return false; }
}

/* ── CRUD ── */
export function createAgent(name, title = '') {
  const agents = loadAllAgents();
  const a = createDefaultAgent(name, title);
  agents.push(a);
  saveAllAgents(agents);
  return a;
}

export function getAgent(id) {
  return loadAllAgents().find(a => a.id === id) ?? null;
}

export function saveAgent(updated) {
  const agents = loadAllAgents();
  const i = agents.findIndex(a => a.id === updated.id);
  if (i === -1) return false;
  agents[i] = { ...updated, updatedAt: Date.now() };
  return saveAllAgents(agents);
}

export function deleteAgent(id) {
  const agents   = loadAllAgents();
  const filtered = agents.filter(a => a.id !== id);
  if (filtered.length === agents.length) return false;
  return saveAllAgents(filtered);
}

/* ── ACTIVE AGENT ── */
let _active = null;

export function openAgent(id)      { _active = getAgent(id); return _active; }
export function getActiveAgent()   { return _active; }

export function setField(field, value) {
  if (!_active) return;
  _active[field] = value;
  saveAgent(_active);
}

export function setAttr(attr, value) {
  if (!_active) return;
  _active.attrs[attr] = Math.max(0, Math.min(12, Number(value)));
  saveAgent(_active);
}

export function stepAttr(attr, dir) {
  if (!_active) return;
  setAttr(attr, (_active.attrs[attr] ?? 0) + (dir === 'inc' ? 1 : -1));
}

export function setBmCur(value) {
  if (!_active) return;
  _active.bmCur = Math.max(0, Math.min(calcBmMax(_active), Number(value)));
  saveAgent(_active);
}

export function setVidaCur(value) {
  if (!_active) return;
  _active.vidaCur = Math.max(-10, Math.min(_active.vidaMax || 9999, Number(value)));
  saveAgent(_active);
}

export function toggleActionSource(index) {
  if (!_active) return;
  _active.actionSources[index] = !_active.actionSources[index];
  saveAgent(_active);
}

export function setFonteCur(value) {
  if (!_active) return;
  _active.fonteCur = Math.max(0, Math.min(10, Number(value)));
  saveAgent(_active);
}

export function setPhotoOffset(x, y, scale) {
  if (!_active) return;
  _active.photoOffsetX = Math.max(0, Math.min(100, x));
  _active.photoOffsetY = Math.max(0, Math.min(100, y));
  if (scale !== undefined) _active.photoScale = Math.max(1, Math.min(3, scale));
  saveAgent(_active);
}

/* ── DESENVOLVIMENTO ── */
const DEV_LIMITS = { devAprendizado: 5, devDesenvolvimento: 30, devPotencial: 10 };
export function stepDev(field, dir) {
  if (!_active) return;
  const max = DEV_LIMITS[field] ?? 99;
  _active[field] = Math.max(0, Math.min(max, (_active[field] ?? 0) + (dir === 'inc' ? 1 : -1)));
  saveAgent(_active);
}

/* ── ROLL HISTORY ── */
export function pushRollHistory(entry) {
  if (!_active) return;
  _active.rollHistory = [entry, ...(_active.rollHistory || [])].slice(0, 50);
  saveAgent(_active);
}

export function clearRollHistory() {
  if (!_active) return;
  _active.rollHistory = [];
  saveAgent(_active);
}

/* ── EQUIPMENT ── */
export function addEquipment() {
  if (!_active) return null;
  const item = createEquipmentItem();
  _active.equipment.push(item);
  saveAgent(_active);
  return item;
}
export function updateEquipmentField(itemId, field, value) {
  if (!_active) return;
  const item = _active.equipment.find(e => e.id === itemId);
  if (item) { item[field] = value; saveAgent(_active); }
}
export function removeEquipment(itemId) {
  if (!_active) return;
  _active.equipment = _active.equipment.filter(e => e.id !== itemId);
  saveAgent(_active);
}

/* ── VEHICLES ── */
export function addVehicle() {
  if (!_active) return null;
  const item = createVehicleItem();
  _active.vehicles.push(item);
  saveAgent(_active);
  return item;
}
export function updateVehicleField(itemId, field, value) {
  if (!_active) return;
  const item = _active.vehicles.find(v => v.id === itemId);
  if (item) { item[field] = value; saveAgent(_active); }
}
export function removeVehicle(itemId) {
  if (!_active) return;
  _active.vehicles = _active.vehicles.filter(v => v.id !== itemId);
  saveAgent(_active);
}

/* ── ABILITIES ── */
export function addAbility() {
  if (!_active) return null;
  const a = createAbility();
  _active.abilities.push(a);
  saveAgent(_active);
  return a;
}
export function updateAbilityField(id, field, value) {
  if (!_active) return;
  const a = _active.abilities.find(x => x.id === id);
  if (a) { a[field] = value; saveAgent(_active); }
}
export function removeAbility(id) {
  if (!_active) return;
  _active.abilities = _active.abilities.filter(x => x.id !== id);
  saveAgent(_active);
}

/* ── NOTES ── */
export function addNote() {
  if (!_active) return null;
  const n = createNote();
  _active.notes.push(n);
  saveAgent(_active);
  return n;
}
export function updateNoteField(id, field, value) {
  if (!_active) return;
  const n = _active.notes.find(x => x.id === id);
  if (n) { n[field] = value; saveAgent(_active); }
}
export function removeNote(id) {
  if (!_active) return;
  _active.notes = _active.notes.filter(x => x.id !== id);
  saveAgent(_active);
}

/* ── IMPORT / EXPORT ── */
export function exportAgent(id) {
  const agent = id ? getAgent(id) : _active;
  if (!agent) return;
  const blob = new Blob([JSON.stringify(agent, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${sanitize(agent.name)}_limiar.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportAgentTxt(id) {
  const agent = id ? getAgent(id) : _active;
  if (!agent) return;

  const line  = (char, len = 54) => char.repeat(len);
  const pad   = (label, value, total = 52) => {
    const dots = total - label.length - String(value).length;
    return `  ${label} ${'.'.repeat(Math.max(1, dots))} ${value}`;
  };
  const bar   = (cur, max, len = 20) => {
    if (max <= 0) return '[' + '░'.repeat(len) + ']';
    const filled = Math.round(Math.max(0, Math.min(cur, max)) / max * len);
    return '[' + '█'.repeat(filled) + '░'.repeat(len - filled) + `] ${cur}/${max}`;
  };

  const bmMax        = (agent.attrs.raz + agent.attrs.ins) * 5;
  const fonteTypes   = { poder: 'Poder', corrupcao: 'Corrupção', adrenalina: 'Adrenalina' };
  const abilityTypes = { ordem: 'Ordem', ruina: 'Ruína', adrenalina: 'Adrenalina' };

  const lines = [];
  const L = (...args) => lines.push(...args);

  L(
    line('═'),
    '  LIMIAR DA CORRUPÇÃO',
    '  FICHA DE PERSONAGEM',
    line('═'),
    '',
    `  NOME ......... ${agent.name || '—'}`,
    `  TÍTULO ....... ${agent.title || '—'}`,
    `  FORMA ........ ${agent.forma || '—'}`,
    `  IDADE ........ ${agent.age || '—'}`,
    `  NASCIMENTO ... ${agent.birthdate || '—'}`,
    '',
    line('─'),
    '  STATUS VITAIS',
    line('─'),
    `  Vida         ${bar(agent.vidaCur, agent.vidaMax)}`,
    `  Barreira Mg  ${bar(agent.bmCur, bmMax)}`,
    `  Fonte        ${bar(agent.fonteCur, 10)}  (${fonteTypes[agent.fonteType] || agent.fonteType})`,
    '',
    line('─'),
    '  ATRIBUTOS',
    line('─'),
    pad('RAZ  Razão',    agent.attrs.raz),
    pad('INS  Instinto', agent.attrs.ins),
    pad('PRE  Precisão', agent.attrs.pre),
    pad('PRS  Presença', agent.attrs.prs),
    pad('FIS  Físico',   agent.attrs.fis),
    '',
    line('─'),
    '  DESENVOLVIMENTO',
    line('─'),
    pad('Aprendizado',     `${agent.devAprendizado  ?? 0} / 5`),
    pad('Desenvolvimento', `${agent.devDesenvolvimento ?? 0} / 30`),
    pad('Potencial Latente', `${agent.devPotencial ?? 0} / 10`),
  );

  // Arsenal
  L('', line('─'), '  ARSENAL', line('─'));
  L(pad('RD (Traje)',          agent.rd ?? 0));
  L(pad('Créditos Universais', agent.credits ?? 0));
  if (agent.equipment?.length) {
    L('', '  Equipamentos:', '');
    const colW = [22, 14, 8, 10, 8, 8, 4];
    const hdr  = ['Nome','Descrição','Mercado','Dano','Alcance','Preço','Qtd'];
    L('  ' + hdr.map((h,i) => h.padEnd(colW[i])).join(' '));
    L('  ' + colW.map(w => '─'.repeat(w)).join(' '));
    agent.equipment.forEach(e => {
      const row = [e.name,e.description,e.market,e.damage,e.range,e.price,e.qty];
      L('  ' + row.map((v,i) => String(v??'').slice(0,colW[i]).padEnd(colW[i])).join(' '));
    });
  }

  // Habilidades
  if (agent.abilities?.length) {
    L('', line('─'), '  HABILIDADES', line('─'));
    agent.abilities.forEach(a => {
      L(`  ► ${a.name || 'Sem nome'}  [${abilityTypes[a.type] || a.type}]`);
      if (a.description) {
        a.description.split('\n').forEach(ln => L(`    ${ln}`));
      }
      if (a.refinement) {
        L(`    Refinamento: ${a.refinement}`);
      }
      L('');
    });
  }

  // Anotações
  if (agent.notes?.length) {
    L(line('─'), '  ANOTAÇÕES', line('─'));
    agent.notes.forEach(n => {
      if (n.title) L(`  [ ${n.title} ]`);
      if (n.content) {
        n.content.split('\n').forEach(ln => L(`  ${ln}`));
      }
      L('');
    });
  }

  // História
  if (agent.history) {
    L(line('─'), '  HISTÓRIA', line('─'));
    agent.history.split('\n').forEach(ln => L(`  ${ln}`));
    L('');
  }

  L(line('═'));
  L(`  Exportado em: ${new Date().toLocaleString('pt-BR')}`);
  L(line('═'));

  const content  = lines.join('\n');
  const blob     = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `${sanitize(agent.name)}_limiar.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function importAgent(rawData, options = {}) {
  if (!rawData || typeof rawData !== 'object') return { success: false, agent: null, conflict: false };
  const agent   = mergeWithDefaults(rawData);
  const agents  = loadAllAgents();
  const idx     = agents.findIndex(a => a.id === agent.id);
  if (idx !== -1) {
    const replace = options.onConflict ? options.onConflict(agents[idx].name) : false;
    if (replace) {
      agents[idx] = { ...agent, updatedAt: Date.now() };
      saveAllAgents(agents);
      return { success: true, agent: agents[idx], conflict: true };
    }
    agent.id = generateId();
  }
  agents.push(agent);
  saveAllAgents(agents);
  return { success: true, agent, conflict: false };
}

export async function importAgentFromFile(file, options = {}) {
  return new Promise(resolve => {
    if (!file || file.type !== 'application/json') { resolve({ success: false, agent: null, conflict: false }); return; }
    const r = new FileReader();
    r.onload  = e => { try { resolve(importAgent(JSON.parse(e.target.result), options)); } catch { resolve({ success: false, agent: null, conflict: false }); } };
    r.onerror = () => resolve({ success: false, agent: null, conflict: false });
    r.readAsText(file);
  });
}

function sanitize(name) {
  return (name || 'personagem').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'_').toLowerCase().slice(0,60);
}

/* ══════════════════════════
   TEMA VISUAL (global, não atrelado ao personagem)
══════════════════════════ */
const THEME_KEY = 'limiar_theme';
const VALID_THEMES = ['default', 'terminal', 'amber'];

/** Retorna o tema salvo, ou 'default' se nunca configurado. */
export function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return VALID_THEMES.includes(saved) ? saved : 'default';
  } catch {
    return 'default';
  }
}

/** Aplica e persiste um tema. 'default' remove o atributo (usa :root puro). */
export function setTheme(theme) {
  const t = VALID_THEMES.includes(theme) ? theme : 'default';
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch (e) {
    console.warn('[State] Falha ao salvar tema:', e);
  }
  applyTheme(t);
}

/** Aplica o tema ao DOM sem persistir (usado no boot). */
export function applyTheme(theme) {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
