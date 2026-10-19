/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — campaign.js
   Lado do JOGADOR: vincular a ficha a uma campanha, manter a
   cópia compartilhada em dia e receber concessões do mestre.
   Também reúne utilitários usados pela tela de mestre.
   ══════════════════════════════════════════════════════ */

import { cloud } from './cloud.js';
import {
  getActiveAgent, getAgent, setField, setSaveListener, applyGrantToActive,
} from './state.js';

/* ══════════ Injeção de dependências de UI ══════════ */
let _toast = () => {};
let _onGrantApplied = () => {};

export function initCampaign({ toast, onGrantApplied } = {}) {
  if (toast) _toast = toast;
  if (onGrantApplied) _onGrantApplied = onGrantApplied;
  // Toda vez que uma ficha vinculada é salva, agenda uma sincronização.
  setSaveListener(agent => { if (agent.campaignCode) scheduleSync(agent.id); });
}

/* ══════════ Códigos de campanha ══════════ */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1 (evita confusão)
export const CODE_LENGTH = 8;

export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function isValidCode(code) {
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}
export function formatCode(code) {
  return code && code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : (code || '');
}
const defaultRandom = n => crypto.getRandomValues(new Uint8Array(n));
export function generateCode(randomBytes = defaultRandom) {
  // 256 é múltiplo de 32, então o módulo não introduz viés.
  return Array.from(randomBytes(CODE_LENGTH), b => ALPHABET[b % ALPHABET.length]).join('');
}

/* ══════════ O que é compartilhado com o mestre ══════════ */
// Nunca sobem: segredos (webhooks), conteúdo privado (Logbook, histórico) e a foto original.
const PRIVATE_FIELDS = [
  'photo', 'photoOffsetX', 'photoOffsetY', 'photoScale',
  'rollHistory', 'notes',
  'webhookRolagens', 'webhookStatus',
  'campaignCode', 'appliedGrantIds',
];
const MAX_DOC_BYTES = 900_000; // limite do Firestore é 1 MiB por documento
const sizeOf = obj => new TextEncoder().encode(JSON.stringify(obj)).length;

export function buildSharedDoc(agent, playerUid, thumb = '') {
  const sheet = {};
  for (const [k, v] of Object.entries(agent)) {
    if (!PRIVATE_FIELDS.includes(k)) sheet[k] = v;
  }
  const doc = { playerUid, name: agent.name || '', title: agent.title || '', updatedAt: Date.now(), thumb, sheet };
  const trimmed = [];
  if (sizeOf(doc) > MAX_DOC_BYTES) { doc.sheet.history = ''; trimmed.push('história'); }
  if (sizeOf(doc) > MAX_DOC_BYTES && doc.thumb) { doc.thumb = ''; trimmed.push('miniatura'); }
  return { doc, trimmed };
}

/* ══════════ Miniatura da foto (160 px, JPEG) ══════════ */
const _thumbCache = new Map();

function makeThumbnail(dataUrl, ox = 50, oy = 50, size = 160) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(
          img, (img.width - s) * (ox / 100), (img.height - s) * (oy / 100), s, s, 0, 0, size, size);
        resolve(c.toDataURL('image/jpeg', 0.7));
      } catch { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

async function getThumb(agent) {
  if (!agent.photo) return '';
  const key = `${agent.id}:${agent.photo.length}:${agent.photoOffsetX}:${agent.photoOffsetY}`;
  if (_thumbCache.has(key)) return _thumbCache.get(key);
  let t = '';
  try { t = await makeThumbnail(agent.photo, agent.photoOffsetX ?? 50, agent.photoOffsetY ?? 50); }
  catch { t = ''; } // a miniatura é opcional: se falhar, a ficha sincroniza sem ela
  if (_thumbCache.size > 20) _thumbCache.clear();
  _thumbCache.set(key, t);
  return t;
}

/** true quando o firebase-config.js foi preenchido. */
export const cloudReady = () => cloud.isConfigured();

/* ══════════ Status (exibido no modal) ══════════ */
const _status = { state: 'idle', message: '', at: 0 };
const _statusListeners = new Set();

function setStatus(state, message = '') {
  Object.assign(_status, { state, message, at: Date.now() });
  _statusListeners.forEach(fn => fn({ ..._status }));
}
export function getCampaignStatus() { return { ..._status }; }
export function onCampaignStatus(fn) { _statusListeners.add(fn); return () => _statusListeners.delete(fn); }

export function explainError(e) {
  const c = e?.code || '';
  if (c.includes('permission-denied')) {
    return 'Sem permissão: esta ficha já foi vinculada por outro login. Entre com a mesma conta Google, ou desconecte e conecte de novo.';
  }
  if (c === 'auth/operation-not-allowed') return 'Ative o login Anônimo e o Google em Authentication, no console do Firebase.';
  if (c === 'auth/unauthorized-domain') return 'Este endereço não está em "Domínios autorizados" do Firebase Authentication.';
  if (c.includes('unavailable') || c.includes('network')) return 'Sem conexão com o servidor.';
  return e?.message || 'Erro desconhecido.';
}

/* ══════════ Sincronização (com atraso para economizar gravações) ══════════ */
const SYNC = { delayMs: 3000 };
export function _setSyncDelay(ms) { SYNC.delayMs = ms; } // usado nos testes

let _timer = null;
let _pendingId = null;

function scheduleSync(agentId) {
  _pendingId = agentId;
  clearTimeout(_timer);
  _timer = setTimeout(async () => {
    const id = _pendingId; _pendingId = null;
    const agent = id && getAgent(id);
    if (agent && agent.campaignCode) await pushSheet(agent);
  }, SYNC.delayMs);
}

export async function pushSheet(agent) {
  if (!cloud.isConfigured() || !agent?.campaignCode) return false;
  setStatus('syncing');
  try {
    const user  = await cloud.ensureUser();
    const thumb = await getThumb(agent);
    const { doc, trimmed } = buildSharedDoc(agent, user.uid, thumb);
    await cloud.putCharacter(agent.campaignCode, agent.id, doc);
    setStatus('ok', trimmed.length ? `Sincronizado (sem ${trimmed.join(' e ')}: ficha grande demais)` : 'Sincronizado');
    return true;
  } catch (e) {
    setStatus('error', explainError(e));
    return false;
  }
}

/* ══════════ Ficha aberta: escuta concessões e sincroniza ══════════ */
let _attached = null; // { agentId, code, unsub }

export function detachCampaign() {
  if (_attached && _attached.unsub) _attached.unsub();
  _attached = null;
}

export async function attachCampaign(agent) {
  detachCampaign();
  if (!agent?.campaignCode || !cloud.isConfigured()) return;
  const att = { agentId: agent.id, code: agent.campaignCode, unsub: null };
  _attached = att;
  try {
    await cloud.ensureUser();
    if (_attached !== att) return; // o usuário já trocou de ficha
    att.unsub = cloud.watchGrants(att.code, att.agentId,
      list => handleGrants(att, list),
      err => setStatus('error', explainError(err)));
    await pushSheet(getAgent(att.agentId) || agent);
  } catch (e) {
    setStatus('error', explainError(e));
  }
}

async function handleGrants(att, list) {
  if (_attached !== att) return;
  const active = getActiveAgent();
  if (!active || active.id !== att.agentId) return;
  for (const g of list) {
    const res = applyGrantToActive(g.id, g.kind, g.payload);
    if (res && res.ok) {
      _toast(`Recebido do mestre: ${res.label}`, 'success');
      _onGrantApplied(res);
    }
    // Aplicada, duplicada ou inválida: em todos os casos sai da caixa de entrada.
    try { await cloud.deleteGrant(att.code, att.agentId, g.id); } catch { /* tenta de novo na próxima abertura */ }
  }
}

/* ══════════ Ações do modal "Campanha" ══════════ */
export async function connectCampaign(rawCode) {
  const agent = getActiveAgent();
  if (!agent) return { ok: false, error: 'Nenhuma ficha aberta.' };
  if (!cloud.isConfigured()) return { ok: false, error: 'O Firebase ainda não foi configurado neste site.' };
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) return { ok: false, error: `Código inválido. Ele tem ${CODE_LENGTH} letras/números (ex.: K7QM-4TXD).` };
  try {
    await cloud.ensureUser();
    const camp = await cloud.getCampaign(code);
    if (!camp.exists) return { ok: false, error: 'Código não encontrado. Confira com o mestre.' };
    setField('campaignCode', code);
    await attachCampaign(getActiveAgent());
    return { ok: true, campaignName: camp.data?.name || '' };
  } catch (e) {
    return { ok: false, error: explainError(e) };
  }
}

export async function disconnectCampaign() {
  const agent = getActiveAgent();
  if (!agent || !agent.campaignCode) return { ok: true };
  const code = agent.campaignCode;
  detachCampaign();
  setField('campaignCode', '');
  setStatus('idle');
  try {
    if (cloud.isConfigured()) { await cloud.ensureUser(); await cloud.deleteCharacter(code, agent.id); }
  } catch (e) {
    return { ok: true, warning: 'Desconectado, mas não foi possível remover a cópia no servidor agora.' };
  }
  return { ok: true };
}

/** Ao excluir uma ficha vinculada: tenta tirar a cópia da campanha (melhor esforço). */
export async function releaseCampaign(agent) {
  if (!agent?.campaignCode || !cloud.isConfigured()) return;
  try { await cloud.ensureUser(); await cloud.deleteCharacter(agent.campaignCode, agent.id); } catch { /* ignora */ }
}

export async function signInWithGoogle() {
  try {
    const u = await cloud.signInGoogle();
    return { ok: true, email: u.email || '' };
  } catch (e) {
    if (e?.code === 'auth/popup-closed-by-user') return { ok: false, error: 'Login cancelado.' };
    return { ok: false, error: explainError(e) };
  }
}

/** Texto curto sobre quem está logado (para o modal). */
export async function getAccountLabel() {
  if (!cloud.isConfigured()) return '';
  try {
    const u = await cloud.currentUser();
    if (!u) return 'ainda sem login (entra automaticamente ao conectar)';
    return u.isAnonymous ? 'login anônimo' : (u.email || 'conta Google');
  } catch { return ''; }
}
