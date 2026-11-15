/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — account.js
   Conta do jogador (e-mail/senha ou Google) e sincronização
   das fichas na nuvem (Firestore: users/{uid}/agents/{id}).

   Princípios:
   • Local-first: o localStorage continua sendo a fonte de uso.
     A nuvem é backup e ponte entre aparelhos.
   • Nada some sem aviso: em conflito, a versão mais antiga vira
     cópia; apagar numa conta só apaga a nuvem do aparelho que apagou.
   • O SDK do Firebase só é carregado se houver uso de conta.
   ══════════════════════════════════════════════════════ */

import { cloud } from './cloud.js';
import { explainError as explainAuthError } from './campaign.js';
import {
  loadAllAgents, replaceAllAgentsSilently, addChangeListener, newAgentId, getActiveAgent,
} from './state.js';

/* ══════════ Injeção de dependências de UI ══════════ */
const ctx = {
  toast: () => {},
  confirm: msg => window.confirm(msg),
  onRosterChanged: () => {},
};

/* ══════════ Metadados de sincronização (por navegador) ══════════ */
// uid: conta que sincronizou por último neste navegador
// synced: { [agentId]: updatedAt da versão que a nuvem tem }
const META_KEY = 'limiar_cloud_sync';

function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m && typeof m === 'object') {
      return { uid: typeof m.uid === 'string' ? m.uid : '', synced: m.synced && typeof m.synced === 'object' ? m.synced : {} };
    }
  } catch { /* ignora */ }
  return { uid: '', synced: {} };
}
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ignora */ } }

/* ══════════ Status (exibido no modal) ══════════ */
const _status = { state: 'idle', message: '', at: 0 };
const _statusListeners = new Set();
function setStatus(state, message = '') {
  Object.assign(_status, { state, message, at: Date.now() });
  _statusListeners.forEach(fn => fn({ ..._status }));
}
export function getAccountStatus() { return { ..._status }; }
export function onAccountStatus(fn) { _statusListeners.add(fn); return () => _statusListeners.delete(fn); }

/** Avisa quando alguém entra ou sai (usado pela tela de Mestre). */
const _changeSubs = new Set();
export function onAccountChange(fn) { _changeSubs.add(fn); return () => _changeSubs.delete(fn); }
const emitAccountChange = () => _changeSubs.forEach(fn => { try { fn(); } catch { /* ignora */ } });

export const accountReady = () => cloud.isConfigured();
const isAccountUser = u => !!u && !u.isAnonymous;

function explain(e) {
  if ((e?.code || '').includes('permission-denied')) {
    return 'Sem permissão no servidor: as Regras do Firestore ainda não liberam "users/{uid}/agents" (veja o README).';
  }
  return explainAuthError(e);
}

/* ══════════ Foto: versão reduzida para a nuvem ══════════ */
const MAX_DOC_BYTES = 900_000; // limite do Firestore: 1 MiB por documento
const sizeOf = obj => new TextEncoder().encode(JSON.stringify(obj)).length;
const _photoCache = new Map();

function downscalePhoto(dataUrl, maxSide = 800, quality = 0.8) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

async function getCloudPhoto(agent) {
  if (!agent.photo) return '';
  if (agent.photo.length < 250_000) return agent.photo; // já é leve: sobe como está
  const key = `${agent.id}:${agent.photo.length}`;
  if (_photoCache.has(key)) return _photoCache.get(key);
  const out = await downscalePhoto(agent.photo);
  if (_photoCache.size > 10) _photoCache.clear();
  _photoCache.set(key, out);
  return out;
}

/** Monta o documento da nuvem. Retorna { doc: null } se nem sem foto/histórico couber. */
async function buildCloudDoc(agent) {
  const photo = await getCloudPhoto(agent);
  const sheet = { ...agent };
  delete sheet.photo;
  let doc = {
    name: agent.name || '', title: agent.title || '',
    updatedAt: agent.updatedAt || Date.now(),
    photo, photoSrcLen: (agent.photo || '').length, sheet,
  };
  doc = JSON.parse(JSON.stringify(doc)); // Firestore não aceita `undefined`
  const dropped = [];
  if (sizeOf(doc) > MAX_DOC_BYTES && doc.photo) { doc.photo = ''; dropped.push('foto'); }
  if (sizeOf(doc) > MAX_DOC_BYTES) { doc.sheet.rollHistory = []; dropped.push('histórico de rolagens'); }
  if (sizeOf(doc) > MAX_DOC_BYTES) return { doc: null, dropped };
  return { doc, dropped };
}

/** Reconstrói a ficha local a partir do documento da nuvem. */
function restoreAgent(remote, local) {
  const agent = { ...remote.sheet, id: remote.id, updatedAt: remote.updatedAt };
  // Se a foto local é a mesma que originou a reduzida da nuvem, mantém a original (maior).
  if (local && local.photo && local.photo.length === remote.photoSrcLen) agent.photo = local.photo;
  else agent.photo = remote.photo || '';
  return agent;
}

function makeConflictCopy(agent) {
  const when = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return {
    ...agent,
    id: newAgentId(),
    name: `${agent.name || 'Sem nome'} (cópia ${when})`,
    campaignCode: '',          // a cópia nunca se liga sozinha a uma campanha
    appliedGrantIds: [],
    updatedAt: Date.now(),
  };
}

// id da ficha aberta agora (vazio se a tela de ficha não está visível)
const sheetOpenId = () => {
  const v = document.getElementById('view-sheet');
  return v && v.classList.contains('active') ? (getActiveAgent()?.id || '') : '';
};

/* ══════════ Sincronização ══════════ */
let _user = null;            // último usuário conhecido (só para decidir se agenda push)
let _timer = null;
let _running = null;
let _rerun = null;           // null | 'push' | 'full'
let _lastFullAt = 0;
let _authWatching = false;

function scheduleSync(delay = 3000, mode = 'push') {
  clearTimeout(_timer);
  _timer = setTimeout(() => { syncNow({ full: mode === 'full' }); }, delay);
}

/**
 * full = true : baixa a nuvem, mescla e depois sobe o que mudou (login, abrir o site, botão).
 * full = false: só sobe o que mudou aqui (a cada alteração, sem leituras na nuvem).
 */
export function syncNow({ full = true } = {}) {
  if (_running) {
    if (full || _rerun !== 'full') _rerun = full ? 'full' : 'push';
    return _running;
  }
  _running = (async () => {
    try { return await doSync(full); }
    finally {
      _running = null;
      if (_rerun) { const m = _rerun; _rerun = null; scheduleSync(500, m); }
    }
  })();
  return _running;
}

async function doSync(full) {
  if (!cloud.isConfigured()) return { ok: false, error: 'O Firebase ainda não foi configurado neste site.' };

  let user;
  try { user = await cloud.currentUser(); }
  catch (e) { setStatus('error', explain(e)); return { ok: false, error: explain(e) }; }
  _user = user;
  if (!isAccountUser(user)) { setStatus('idle'); return { ok: false, error: 'Sem conta.' }; }

  let meta = loadMeta();
  if (meta.uid && meta.uid !== user.uid && Object.keys(meta.synced).length) {
    const okMerge = ctx.confirm(
      'Este navegador tem fichas sincronizadas com OUTRA conta.\n\n' +
      'Mesclar essas fichas com a conta que acabou de entrar?\n' +
      'OK = mesclar (as fichas passam a ser salvas nesta conta).\n' +
      'Cancelar = sair desta conta agora.');
    if (!okMerge) { try { await cloud.signOut(); } catch { /* ignora */ } setStatus('idle'); emitAccountChange(); return { ok: false, error: 'Cancelado.' }; }
    meta = { uid: user.uid, synced: {} };
  }
  meta.uid = user.uid;

  setStatus('syncing');
  const stats = { pulled: 0, pushed: 0, removed: 0, copies: 0, skipped: [], dropped: [], failed: [] };

  try {
    /* ── Fase A (rede): baixar a nuvem ── */
    const remote = full ? await cloud.listUserAgents(user.uid) : null;

    /* ── Fase B (sem await): decidir e gravar o lado local ── */
    const local = loadAllAgents();             // leitura fresca: não pisa em edições feitas durante o download
    const next = [...local];
    const openId = sheetOpenId();
    const toPush = new Set();
    const toDeleteRemote = [];
    let localChanged = false;

    if (remote) {
      const remoteIds = new Set(remote.map(r => r.id));
      for (const r of remote) {
        const i = next.findIndex(a => a.id === r.id);
        const syncedAt = meta.synced[r.id];
        const rAt = r.updatedAt || 0;

        if (i === -1) {
          if (syncedAt !== undefined) { toDeleteRemote.push(r.id); }           // apagada aqui → apaga na nuvem
          else { next.push(restoreAgent(r, null)); meta.synced[r.id] = rAt; stats.pulled++; localChanged = true; } // veio de outro aparelho
          continue;
        }

        const l = next[i];
        const lAt = l.updatedAt || 0;
        if (rAt === lAt) { meta.synced[r.id] = rAt; continue; }

        const sAt = syncedAt ?? -1;
        const lChanged = lAt > sAt;
        const rChanged = rAt > sAt;

        if (lChanged && rChanged) {                                             // divergiu: a mais nova vence, a outra vira cópia
          if (r.id === openId) { stats.skipped.push(l.name || 'ficha aberta'); continue; }
          const remoteWins = rAt > lAt;
          const restored = restoreAgent(r, l);
          next.push(makeConflictCopy(remoteWins ? l : restored));
          if (remoteWins) { next[i] = restored; meta.synced[r.id] = rAt; }
          else toPush.add(r.id);
          stats.copies++; localChanged = true;
        } else if (rChanged) {                                                  // só a nuvem mudou
          if (r.id === openId) { stats.skipped.push(l.name || 'ficha aberta'); continue; }
          next[i] = restoreAgent(r, l); meta.synced[r.id] = rAt; stats.pulled++; localChanged = true;
        } else if (lChanged) {                                                  // só aqui mudou
          toPush.add(r.id);
        }
      }
      for (const a of next) if (!remoteIds.has(a.id)) toPush.add(a.id);         // fichas que a nuvem ainda não tem
    } else {
      for (const a of next) if ((a.updatedAt || 0) > (meta.synced[a.id] ?? -1)) toPush.add(a.id);
    }
    // apagadas localmente (já sincronizadas antes, hoje ausentes) — compara com `next`,
    // para não confundir fichas recém-baixadas com fichas apagadas
    const nextIds = new Set(next.map(a => a.id));
    for (const id of Object.keys(meta.synced)) {
      if (!nextIds.has(id) && !toDeleteRemote.includes(id)) toDeleteRemote.push(id);
    }

    if (localChanged) { replaceAllAgentsSilently(next); ctx.onRosterChanged(); }

    /* ── Fase C (rede): aplicar na nuvem ── */
    for (const id of toDeleteRemote) {
      try { await cloud.deleteUserAgent(user.uid, id); delete meta.synced[id]; stats.removed++; }
      catch (e) { stats.failed.push('remoção'); if ((e?.code || '').includes('permission-denied')) throw e; }
    }
    for (const id of toPush) {
      const a = next.find(x => x.id === id);
      if (!a) continue;
      const { doc, dropped } = await buildCloudDoc(a);
      if (!doc) { stats.failed.push(a.name || 'ficha'); continue; }
      await cloud.putUserAgent(user.uid, id, doc);
      meta.synced[id] = doc.updatedAt;
      stats.pushed++;
      dropped.forEach(d => { if (!stats.dropped.includes(d)) stats.dropped.push(d); });
    }

    saveMeta(meta);
    if (full) _lastFullAt = Date.now();

    const parts = [];
    if (stats.pulled)  parts.push(`${stats.pulled} baixada(s)`);
    if (stats.pushed)  parts.push(`${stats.pushed} enviada(s)`);
    if (stats.copies)  parts.push(`${stats.copies} cópia(s) de conflito criada(s)`);
    if (stats.removed) parts.push(`${stats.removed} removida(s) da nuvem`);
    let msg = parts.length ? `Sincronizado — ${parts.join(', ')}` : 'Tudo em dia';
    if (stats.dropped.length) msg += ` (na nuvem, sem: ${stats.dropped.join(' e ')} — ficha grande demais)`;
    if (stats.skipped.length) msg += ' · a ficha aberta será atualizada quando você fechá-la';
    if (stats.failed.length)  { setStatus('error', `Não foi possível enviar: ${[...new Set(stats.failed)].join(', ')} (ficha grande demais?)`); }
    else setStatus('ok', msg);
    if (stats.copies) ctx.toast('Conflito entre aparelhos: a versão mais antiga foi guardada como cópia.', 'success');
    return { ok: !stats.failed.length, stats };
  } catch (e) {
    saveMeta(meta);
    setStatus('error', explain(e));
    return { ok: false, error: explain(e) };
  }
}

/* ══════════ Inicialização (chamar uma vez) ══════════ */
function watchAuth() {
  if (_authWatching) return;
  _authWatching = true;
  cloud.onAuthChange(user => {
    _user = user;
    if (isAccountUser(user)) {
      if (Date.now() - _lastFullAt > 5000) scheduleSync(300, 'full');
    } else setStatus('idle');
  });
}

export function initAccount(context = {}) {
  Object.assign(ctx, context);
  // Qualquer gravação local agenda um envio (só se há conta ativa).
  addChangeListener(() => { if (isAccountUser(_user)) scheduleSync(3000, 'push'); });
  // Só carrega o Firebase na abertura se esta pessoa já usou conta neste navegador.
  // (ou se já usava a nuvem por uma ficha ligada a campanha — pode estar logado com Google desde antes).
  if (cloud.isConfigured() && (loadMeta().uid || loadAllAgents().some(a => a.campaignCode))) watchAuth();
  // Ao voltar para a aba, puxa mudanças de outros aparelhos (no máx. 1x por minuto).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isAccountUser(_user) && Date.now() - _lastFullAt > 60_000) scheduleSync(500, 'full');
  });
}

/* ══════════ Ações do modal "Conta" ══════════ */
const hasCampaignSheets = () => loadAllAgents().some(a => a.campaignCode);

/** Depois de entrar: avisa se a identidade anônima (e o vínculo com o mestre) ficou para trás. */
async function afterSignIn(before) {
  watchAuth();
  const user = await cloud.currentUser();
  _user = user;
  const lostLink = before?.isAnonymous && before.uid !== user?.uid && hasCampaignSheets();
  const r = await syncNow({ full: true });
  emitAccountChange();
  return {
    ok: true, email: user?.email || '',
    warning: lostLink
      ? 'Atenção: neste navegador havia fichas ligadas a uma campanha por outro login (anônimo). Para o mestre voltar a vê-las, peça a ele que use "Remover ficha" na tela dele; depois abra a ficha (ou edite qualquer campo) para que ela seja enviada de novo com esta conta.'
      : (r && r.ok === false && r.error && r.error !== 'Cancelado.' ? `Conta ok, mas a sincronização falhou: ${r.error}` : ''),
  };
}

function checkCreds(email, password, needPassword = true) {
  const e = String(email || '').trim();
  if (!e || !e.includes('@')) return { error: 'Informe um e-mail válido.' };
  if (needPassword && String(password || '').length < 6) return { error: 'A senha precisa ter pelo menos 6 caracteres.' };
  return { email: e };
}

export async function accountSignUp(email, password) {
  if (!cloud.isConfigured()) return { ok: false, error: 'O Firebase ainda não foi configurado neste site.' };
  const c = checkCreds(email, password); if (c.error) return { ok: false, error: c.error };
  try {
    const before = await cloud.currentUser();
    await cloud.signUpEmail(c.email, password);
    return await afterSignIn(before);
  } catch (e) { return { ok: false, error: explain(e) }; }
}

export async function accountSignIn(email, password) {
  if (!cloud.isConfigured()) return { ok: false, error: 'O Firebase ainda não foi configurado neste site.' };
  const c = checkCreds(email, password); if (c.error) return { ok: false, error: c.error };
  try {
    const before = await cloud.currentUser();
    if (before?.isAnonymous && hasCampaignSheets() &&
        !ctx.confirm('Este navegador tem fichas ligadas a campanhas por um login anônimo.\n\nEntrar numa conta que já existe troca essa identidade: o mestre deixa de ver essas fichas até remover a cópia antiga (botão "Remover ficha" na tela dele) e você abrir a ficha de novo.\n\nSe a conta ainda não existe, cancele e use "Criar conta": assim o vínculo com o mestre é mantido.\n\nContinuar?')) {
      return { ok: false, error: 'Cancelado.' };
    }
    await cloud.signInEmail(c.email, password);
    return await afterSignIn(before);
  } catch (e) { return { ok: false, error: explain(e) }; }
}

export async function accountGoogle() {
  if (!cloud.isConfigured()) return { ok: false, error: 'O Firebase ainda não foi configurado neste site.' };
  try {
    const before = await cloud.currentUser();
    await cloud.signInGoogle();
    return await afterSignIn(before);
  } catch (e) {
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return { ok: false, error: 'Login cancelado.' };
    return { ok: false, error: explain(e) };
  }
}

export async function accountResetPassword(email) {
  if (!cloud.isConfigured()) return { ok: false, error: 'O Firebase ainda não foi configurado neste site.' };
  const c = checkCreds(email, '', false); if (c.error) return { ok: false, error: c.error };
  try { await cloud.resetPassword(c.email); return { ok: true }; }
  catch (e) { return { ok: false, error: explain(e) }; }
}

export async function accountSignOut() {
  try { await cloud.signOut(); } catch { /* ignora */ }
  _user = null;
  setStatus('idle');
  emitAccountChange();
}

/** Resumo de quem está logado (para o modal). */
export async function getAccountInfo() {
  if (!cloud.isConfigured()) return { ready: false, loggedIn: false, label: '' };
  try {
    const u = await cloud.currentUser();
    if (!isAccountUser(u)) return { ready: true, loggedIn: false, anonymous: !!u, label: '' };
    watchAuth(); // já está logado: garante que as fichas deste navegador entrem na sincronização
    return { ready: true, loggedIn: true, anonymous: false, label: u.email || 'conta Google' };
  } catch { return { ready: true, loggedIn: false, label: '' }; }
}
