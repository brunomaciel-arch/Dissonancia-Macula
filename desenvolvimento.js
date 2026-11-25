/* ══════════════════════════════════════════════════════
   DESENVOLVIMENTO — interface e ações
   · Gasto de PD e Aumento do Potencial Latente (livro, pág. 14)
   · Distribuição inicial de atributos (pág. 17)
   · Bônus de Progressão (pág. 46)

   As regras vivem em regras-dev.js (funções puras). Este módulo
   desenha o cartão "Desenvolvimento" da aba Status, o assistente de
   distribuição inicial do cartão "Atributos" e aplica as compras na
   ficha. Segue o padrão de forja.js: o que depende de ui.js (toast,
   atualização das abas) chega por initDesenvolvimento().
══════════════════════════════════════════════════════ */

import { getActiveAgent, saveAgent } from './state.js';
import {
  ATTR_KEYS, ATTR_NAMES, ATTR_MAX,
  DISTRIBUICAO_INICIAL, poolRestante, checarDistribuicao, calcVidaInicial,
  PA_POR_PD, PL_MAX, TRACOS_MAX, FORMAS_MAX,
  custoPotencialLatente, ganhosPotencialLatente,
  contarCompras, plLegado, pdGastos, pdDisponiveis, opcoesDeGasto,
  BONUS_PROGRESSAO, ACOES_MAIORES_MAX, calcProgressao,
} from './regras-dev.js';

const PD_ACUM_MAX = 99;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let ctx = { toast: () => {}, onChange: null };

/* Rascunhos de tela (não vão para a ficha) */
let plRascunho    = null;   // { p1, p2 } enquanto o painel de Potencial Latente está aberto
let distRascunho  = null;   // { raz, ins, pre, prs, fis } do assistente de distribuição
let distAgenteId  = null;   // rascunhos valem só para o personagem aberto
let distAberta    = true;   // <details> do assistente
let armado        = false;  // confirmação em dois cliques para substituir atributos existentes
let armadoTimer   = null;

/* ═════════ INICIALIZAÇÃO ═════════ */
export function initDesenvolvimento(opts = {}) {
  ctx = { ...ctx, ...opts };
  ['#dev-root', '#dist-root'].forEach(sel => {
    const root = $(sel);
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('toggle', e => {
      if (e.target.classList?.contains('dist-details')) distAberta = e.target.open;
    }, true);
  });
}

/* ═════════ RENDER ═════════ */
export function renderDesenvolvimento(agent) {
  if (!agent) return;
  if (distAgenteId !== agent.id) {
    distAgenteId = agent.id;
    distRascunho = null;
    plRascunho   = null;
    armado       = false;
    distAberta   = !agent.distribInicial;
  }
  const dev  = $('#dev-root');
  const dist = $('#dist-root');
  if (dev)  dev.innerHTML  = htmlDev(agent);
  if (dist) dist.innerHTML = htmlDist(agent);
}

/* ── Cartão "Desenvolvimento" ── */
function htmlDev(a) {
  const pa     = a.devAprendizado || 0;
  const total  = a.devDesenvolvimento || 0;
  const gastos = pdGastos(a);
  const disp   = pdDisponiveis(a);
  const pl     = a.devPotencial || 0;

  return `
    <div class="dev-counters dev-counters--4">
      <div class="dev-counter">
        <p class="dev-counter__label">Aprendizado (PA)</p>
        <p class="dev-counter__range">${PA_POR_PD} PA = 1 PD</p>
        <div class="dev-stepper">
          <button class="stepper-btn" data-act="pa" data-dir="dec" ${pa <= 0 ? 'disabled' : ''}>−</button>
          <span class="stepper-val">${pa}</span>
          <button class="stepper-btn" data-act="pa" data-dir="inc">+</button>
        </div>
        <div class="dev-bar-track"><div class="dev-bar-fill dev-bar-fill--cyan" style="width:${Math.min(100, (pa / PA_POR_PD) * 100)}%"></div></div>
      </div>

      <div class="dev-counter">
        <p class="dev-counter__label">PD acumulados</p>
        <p class="dev-counter__range">${gastos} gastos + ${disp} disponíveis</p>
        <div class="dev-stepper">
          <button class="stepper-btn" data-act="pd" data-dir="dec" ${total <= gastos ? 'disabled' : ''} title="${total <= gastos ? 'Não dá para ficar abaixo dos PD já gastos' : ''}">−</button>
          <span class="stepper-val">${total}</span>
          <button class="stepper-btn" data-act="pd" data-dir="inc" ${total >= PD_ACUM_MAX ? 'disabled' : ''}>+</button>
        </div>
        <div class="dev-bar-track"><div class="dev-bar-fill dev-bar-fill--gold" style="width:${total > 0 ? (gastos / total) * 100 : 0}%"></div></div>
      </div>

      <div class="dev-counter dev-counter--destaque">
        <p class="dev-counter__label">PD disponíveis</p>
        <p class="dev-counter__range">para gastar</p>
        <span class="dev-big">${disp}</span>
      </div>

      <div class="dev-counter">
        <p class="dev-counter__label">Potencial Latente</p>
        <p class="dev-counter__range">0 – ${PL_MAX} aumentos</p>
        <span class="dev-big dev-big--magenta">${pl}</span>
        <div class="dev-bar-track"><div class="dev-bar-fill dev-bar-fill--magenta" style="width:${(pl / PL_MAX) * 100}%"></div></div>
      </div>
    </div>

    ${htmlGastos(a)}
    ${htmlHistorico(a)}
    ${htmlProgressao(a)}
  `;
}

/* ── Gastar PD (pág. 14) ── */
function htmlGastos(a) {
  const op     = opcoesDeGasto(a);
  const c      = contarCompras(a.devLog);
  const tracos = 1 + c.traco;
  const pl     = a.devPotencial || 0;
  const g      = ganhosPotencialLatente(pl + 1);

  const linha = (tipo, nome, uso, o) => `
    <div class="dev-row${o.ok ? '' : ' dev-row--off'}">
      <span class="dev-row__cost">${o.custo} PD</span>
      <span class="dev-row__name">${nome}</span>
      <span class="dev-row__use">${uso}${!o.ok && o.motivo ? ` <small>· ${esc(o.motivo)}</small>` : ''}</span>
      <button class="dev-buy" data-act="buy" data-tipo="${tipo}" ${o.ok ? '' : 'disabled'} title="${esc(o.motivo)}">Comprar</button>
    </div>`;

  const ganho = g.paridade === 'impar' ? '+2 Vida · +1 Atributo' : '+2 Vida · +3 Atributos (+2 e +1)';

  return `
    <div class="dev-sub">
      <h3 class="dev-sub__title">Gastar Pontos de Desenvolvimento</h3>
      <div class="dev-table">
        ${linha('traco',    'Novo Traço',                             `${tracos} / ${TRACOS_MAX} Traços (o Traço Inicial é grátis)`, op.traco)}
        ${linha('refTraco', 'Refinamento de Traço',                   `${c.refTraco} / ${tracos} (1 por Traço)`,                      op.refTraco)}
        ${linha('refForma', 'Refinamento ou Proficiência de Forma',   `${c.refForma} / ${FORMAS_MAX} Formas`,                         op.refForma)}
        ${linha('pl',       pl >= PL_MAX ? 'Potencial Latente' : `Potencial Latente — ${pl + 1}º aumento`,
                            pl >= PL_MAX ? `${pl} / ${PL_MAX} aumentos` : `${pl} / ${PL_MAX} · ${ganho}`, op.pl)}
      </div>
      ${plRascunho ? htmlPL(a) : ''}
    </div>`;
}

/* ── Painel de escolha do Potencial Latente ── */
function htmlPL(a) {
  const n      = (a.devPotencial || 0) + 1;
  const g      = ganhosPotencialLatente(n);
  const custo  = custoPotencialLatente(n);
  const r      = plRascunho;
  const par    = g.paridade === 'par';
  const valido = par ? (r.p1 && r.p2 && r.p1 !== r.p2) : !!r.p1;

  const chips = (slot, pts) => ATTR_KEYS.map(k => {
    const sel   = r[slot] === k;
    const cheio = (a.attrs[k] || 0) + pts > ATTR_MAX;
    const outro = par && (slot === 'p1' ? r.p2 : r.p1) === k;
    return `<button class="dev-chip${sel ? ' active' : ''}" data-act="pl-attr" data-slot="${slot}" data-attr="${k}"
              ${(cheio || outro) && !sel ? 'disabled' : ''}
              title="${ATTR_NAMES[k]}: ${a.attrs[k] || 0}${cheio ? ` (passaria de ${ATTR_MAX})` : ''}">
              ${k.toUpperCase()}<small>${a.attrs[k] || 0}</small></button>`;
  }).join('');

  return `
    <div class="dev-pl">
      <p class="dev-pl__title">Potencial Latente — ${n}º aumento <em>(${par ? 'par' : 'ímpar'})</em> · custo ${custo} PD</p>
      <p class="dev-pl__ganho">+${g.vida} Vida (Vida máxima ${a.vidaMax || 0} → ${(a.vidaMax || 0) + g.vida}) ·
        ${par ? '+3 pontos de Atributo divididos entre dois Atributos (+2 e +1)' : '+1 ponto de Atributo'}</p>
      ${par ? `<div class="dev-pl__slot"><span>+2 em</span><div class="dev-chips">${chips('p2', 2)}</div></div>` : ''}
      <div class="dev-pl__slot"><span>+1 em</span><div class="dev-chips">${chips('p1', 1)}</div></div>
      <div class="dev-pl__acoes">
        <button class="dev-buy" data-act="pl-ok" ${valido ? '' : 'disabled'}>Confirmar aumento</button>
        <button class="dev-ghost" data-act="pl-cancel">Cancelar</button>
      </div>
    </div>`;
}

/* ── Histórico de compras (permite desfazer) ── */
function htmlHistorico(a) {
  const log    = a.devLog || [];
  const legado = plLegado(a);
  if (!log.length && !legado) return '';

  const c       = contarCompras(log);
  const tracos  = 1 + c.traco;
  const ultimoPL = [...log].reverse().find(e => e.tipo === 'pl');

  const rotulo = e => {
    if (e.tipo === 'traco')    return 'Novo Traço';
    if (e.tipo === 'refTraco') return 'Refinamento de Traço';
    if (e.tipo === 'refForma') return 'Refinamento/Proficiência de Forma';
    const attrs = Object.entries(e.attrs || {}).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ');
    return `Potencial Latente — ${e.n}º <small>(+${e.vida || 0} Vida${attrs ? `, ${attrs}` : ''})</small>`;
  };
  const podeDesfazer = e => {
    if (e.tipo === 'traco') return tracos - 1 >= c.refTraco ? '' : 'Remova antes um Refinamento de Traço';
    if (e.tipo === 'pl')    return e.id === ultimoPL?.id ? '' : 'Só o último aumento de Potencial Latente pode ser desfeito';
    return '';
  };

  const itens = [...log].reverse().map(e => {
    const motivo = podeDesfazer(e);
    return `<li><span class="dev-hist__cost">${e.custo} PD</span><span class="dev-hist__name">${rotulo(e)}</span>
      <button class="dev-undo" data-act="undo" data-id="${esc(e.id)}" ${motivo ? 'disabled' : ''} title="${esc(motivo || 'Desfazer e devolver os PD')}">✕</button></li>`;
  }).join('');

  let custoLegado = 0;
  for (let n = 1; n <= legado; n++) custoLegado += custoPotencialLatente(n);
  const itemLegado = legado
    ? `<li class="dev-hist__legado"><span class="dev-hist__cost">${custoLegado} PD</span>
        <span class="dev-hist__name">Potencial Latente × ${legado} <small>(registrado antes da automação; atributos e Vida já ajustados à mão)</small></span></li>`
    : '';

  return `
    <div class="dev-sub">
      <h3 class="dev-sub__title">Histórico de compras</h3>
      <ul class="dev-hist">${itens}${itemLegado}</ul>
    </div>`;
}

/* ── Bônus de Progressão (pág. 46) ── */
function htmlProgressao(a) {
  const pr    = calcProgressao(a);
  const usos  = a.progUsos || {};

  const linhaBonus = b => {
    const on = pr.pd >= b.pd;
    let pips = '';
    if (b.usos) {
      const usados = Math.min(b.usos, usos[b.id] || 0);
      pips = Array.from({ length: b.usos }, (_, i) =>
        `<button class="prog-pip${i < usados ? ' used' : ''}" data-act="uso" data-id="${b.id}" data-i="${i}" ${on ? '' : 'disabled'}
           title="${i < usados ? 'Uso gasto — clique para devolver' : 'Uso disponível — clique para gastar'}"></button>`).join('')
        + `<small>por ${b.por}</small>`;
    }
    return `
      <div class="prog-row ${on ? 'on' : 'off'}">
        <span class="prog-row__pd">${b.pd} PD</span>
        <span class="prog-row__text">${esc(b.texto)}${b.fa ? ' <em class="prog-tag">+1 FA</em>' : ''}</span>
        <span class="prog-row__uses">${pips}</span>
        <span class="prog-row__state" title="${on ? 'Desbloqueado' : `Desbloqueia com ${b.pd} PD`}">${on ? '✓' : '🔒'}</span>
      </div>`;
  };

  const marcoDado = pr.dadosDanoExtra > 0;
  const marcoAcao = pr.pd >= 15;
  const prox = pr.proximo
    ? `Próximo marco: <b>${pr.proximo.pd} PD</b> (faltam ${pr.proximo.falta}) — ${esc(pr.proximo.texto)}`
    : 'Todos os marcos alcançados.';

  return `
    <div class="dev-sub">
      <h3 class="dev-sub__title">Bônus de Progressão <small>conta os PD acumulados (${pr.pd})</small></h3>
      <div class="prog-sum">
        <div class="prog-sum__item"><b>+${pr.dadosDanoExtra}</b><span>dado(s) de dano base</span></div>
        <div class="prog-sum__item"><b>${pr.faNormais}</b><span>FA por turno (+1 com Fluidez)</span></div>
        <div class="prog-sum__item"><b>${pr.acoesMaiores} / ${ACOES_MAIORES_MAX}</b><span>Ações Maiores por turno</span></div>
        <div class="prog-sum__item prog-sum__item--forma ${pr.formaExtra ? 'on' : ''}"><b>${pr.formaExtra ? '✓' : '—'}</b><span>Forma extra</span></div>
      </div>
      <div class="prog-table">
        ${BONUS_PROGRESSAO.filter(b => b.pd > 0).map(linhaBonus).join('')}
        <div class="prog-row prog-row--cada ${marcoDado ? 'on' : 'off'}">
          <span class="prog-row__pd">Cada 10 PD</span>
          <span class="prog-row__text">Ganha +1 Dado de Dano base</span>
          <span class="prog-row__uses"><small>+${pr.dadosDanoExtra} agora</small></span>
          <span class="prog-row__state">${marcoDado ? '✓' : '🔒'}</span>
        </div>
        <div class="prog-row prog-row--cada ${marcoAcao ? 'on' : 'off'}">
          <span class="prog-row__pd">Cada 15 PD</span>
          <span class="prog-row__text">Exerce +1 Ação Maior por turno — máximo de ${ACOES_MAIORES_MAX} Ações Maiores</span>
          <span class="prog-row__uses"><small>${pr.acoesMaiores} / ${ACOES_MAIORES_MAX} agora</small></span>
          <span class="prog-row__state">${marcoAcao ? '✓' : '🔒'}</span>
        </div>
      </div>
      <div class="prog-foot">
        <span class="prog-foot__next">${prox}</span>
        <span class="prog-foot__btns">
          <button class="dev-ghost" data-act="reset-uso" data-por="cena" title="Devolve os usos que se renovam por cena">Nova cena</button>
          <button class="dev-ghost" data-act="reset-uso" data-por="sessão" title="Devolve todos os usos de Bônus de Progressão">Nova sessão</button>
        </span>
      </div>
    </div>`;
}

/* ── Assistente de distribuição inicial (pág. 17) ── */
function htmlDist(a) {
  if (!distRascunho) distRascunho = checarDistribuicao(a.attrs).ok ? { ...a.attrs } : {};

  const bloqueado = (a.devPotencial || 0) > 0;
  const chk       = checarDistribuicao(distRascunho);
  const valores   = ATTR_KEYS.map(k => distRascunho[k] ?? null);
  const restantes = poolRestante(valores);

  const selects = ATTR_KEYS.map(k => {
    const proprio = distRascunho[k] ?? null;
    const opcoes  = [...new Set([...restantes, ...(proprio != null ? [proprio] : [])])].sort((x, y) => y - x);
    return `
      <label class="dist-field">
        <span class="dist-field__code">${k.toUpperCase()}</span>
        <select class="dist-select" data-act="dist-sel" data-attr="${k}" ${bloqueado ? 'disabled' : ''} aria-label="${ATTR_NAMES[k]}">
          <option value="">—</option>
          ${opcoes.map(v => `<option value="${v}" ${v === proprio ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>`;
  }).join('');

  const pool = restantes.length
    ? restantes.map(v => `<span class="dist-chip">${v}</span>`).join('')
    : '<span class="dist-done">todos os valores distribuídos ✓</span>';

  const fis = distRascunho.fis;
  const resumo = chk.ok
    ? `Vida inicial: 10 + FIS ${fis} = <b>${calcVidaInicial(fis)}</b> · Barreira Mágica: (RAZ + INS) × 5 = <b>${((distRascunho.raz || 0) + (distRascunho.ins || 0)) * 5}</b>`
    : 'Cada valor usado uma vez (o 2 aparece duas vezes). Máximo de 12 por atributo.';

  const temAtributos = ATTR_KEYS.some(k => (a.attrs[k] || 0) > 0);
  const igual        = ATTR_KEYS.every(k => (a.attrs[k] || 0) === (distRascunho[k] ?? -1));
  const rotuloBtn    = armado ? 'Confirmar: substitui os atributos atuais'
                     : a.distribInicial ? 'Refazer distribuição' : 'Aplicar distribuição';

  return `
    <details class="dist-details" ${distAberta ? 'open' : ''}>
      <summary>
        <span>Distribuição Inicial</span>
        <span class="dist-values">${DISTRIBUICAO_INICIAL.join(' · ')}</span>
        ${a.distribInicial ? '<span class="dist-badge">aplicada</span>' : ''}
      </summary>
      <p class="dist-hint">Distribua os valores pelos cinco atributos. Ao aplicar, a Vida inicial (10 + Físico) e a Barreira Mágica são definidas.</p>
      <div class="dist-pool"><span class="dist-pool__label">Restantes</span>${pool}</div>
      <div class="dist-grid">${selects}</div>
      <p class="dist-resumo">${resumo}</p>
      ${bloqueado ? '<p class="dist-aviso">Já há aumentos de Potencial Latente: os atributos atuais incluem esses ganhos, então a distribuição inicial não pode mais ser refeita.</p>' : ''}
      <div class="dist-acoes">
        <button class="dev-buy${armado ? ' dev-buy--alerta' : ''}" data-act="dist-aplicar"
          ${chk.ok && !bloqueado && !(igual && a.distribInicial) ? '' : 'disabled'}>${rotuloBtn}</button>
        <button class="dev-ghost" data-act="dist-limpar" ${bloqueado ? 'disabled' : ''}>Limpar</button>
        ${temAtributos && !a.distribInicial && !bloqueado ? '<span class="dist-nota">Os atributos atuais serão substituídos.</span>' : ''}
      </div>
    </details>`;
}

/* ═════════ EVENTOS ═════════ */
function avisar(msg, tipo = '') { ctx.toast?.(msg, tipo); }

function persistir(a, { recarregar = true } = {}) {
  saveAgent(a);
  if (recarregar && ctx.onChange) ctx.onChange(a);
  else renderDesenvolvimento(a);
}

function onChange(e) {
  const sel = e.target.closest('[data-act="dist-sel"]');
  if (!sel) return;
  const a = getActiveAgent();
  if (!a) return;
  const v = sel.value === '' ? null : Number(sel.value);
  distRascunho = { ...(distRascunho || {}) };
  if (v == null) delete distRascunho[sel.dataset.attr]; else distRascunho[sel.dataset.attr] = v;
  armado = false;
  renderDesenvolvimento(a);
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled || t.tagName === 'SELECT') return;
  const a = getActiveAgent();
  if (!a) return;

  switch (t.dataset.act) {
    case 'pa':        return passoPA(a, t.dataset.dir);
    case 'pd':        return passoPD(a, t.dataset.dir);
    case 'buy':       return comprar(a, t.dataset.tipo);
    case 'pl-attr':   return escolherAtributoPL(a, t.dataset.slot, t.dataset.attr);
    case 'pl-ok':     return confirmarPL(a);
    case 'pl-cancel': plRascunho = null; return renderDesenvolvimento(a);
    case 'undo':      return desfazer(a, t.dataset.id);
    case 'uso':       return alternarUso(a, t.dataset.id, Number(t.dataset.i));
    case 'reset-uso': return renovarUsos(a, t.dataset.por);
    case 'dist-aplicar': return aplicarDistribuicao(a);
    case 'dist-limpar':
      distRascunho = {}; armado = false;
      return renderDesenvolvimento(a);
  }
}

/* ── PA e PD ── */
function passoPA(a, dir) {
  if (dir === 'dec') {
    a.devAprendizado = Math.max(0, (a.devAprendizado || 0) - 1);
    return persistir(a, { recarregar: false });
  }
  a.devAprendizado = (a.devAprendizado || 0) + 1;
  let ganhos = 0;
  while (a.devAprendizado >= PA_POR_PD) { a.devAprendizado -= PA_POR_PD; ganhos++; }
  if (ganhos) {
    a.devDesenvolvimento = Math.min(PD_ACUM_MAX, (a.devDesenvolvimento || 0) + ganhos);
    avisar(`${PA_POR_PD} PA convertidos: +${ganhos} PD.`, 'success');
    return persistir(a);   // PD novos podem desbloquear Bônus de Progressão
  }
  persistir(a, { recarregar: false });
}

function passoPD(a, dir) {
  const atual = a.devDesenvolvimento || 0;
  if (dir === 'inc') a.devDesenvolvimento = Math.min(PD_ACUM_MAX, atual + 1);
  else               a.devDesenvolvimento = Math.max(pdGastos(a), atual - 1);
  persistir(a);
}

/* ── Compras ── */
function comprar(a, tipo) {
  const o = opcoesDeGasto(a)[tipo];
  if (!o) return;
  if (!o.ok) return avisar(o.motivo || 'Compra indisponível.', 'error');

  if (tipo === 'pl') {                       // abre o painel de escolha de atributos
    plRascunho = { p1: null, p2: null };
    return renderDesenvolvimento(a);
  }
  a.devLog.push({ id: novoId(), tipo, custo: o.custo, ts: Date.now() });
  avisar(`${o.custo} PD gastos.`, 'success');
  persistir(a, { recarregar: false });
}

function escolherAtributoPL(a, slot, attr) {
  if (!plRascunho) return;
  plRascunho[slot] = plRascunho[slot] === attr ? null : attr;
  const outro = slot === 'p1' ? 'p2' : 'p1';
  if (plRascunho[outro] === attr) plRascunho[outro] = null;   // dois atributos diferentes (+1 e +2)
  renderDesenvolvimento(a);
}

function confirmarPL(a) {
  if (!plRascunho) return;
  const n = (a.devPotencial || 0) + 1;
  if (n > PL_MAX) return avisar(`Máximo de ${PL_MAX} aumentos de Potencial Latente.`, 'error');

  const custo = custoPotencialLatente(n);
  if (pdDisponiveis(a) < custo) return avisar(`Faltam ${custo - pdDisponiveis(a)} PD.`, 'error');

  const g = ganhosPotencialLatente(n);
  const { p1, p2 } = plRascunho;
  const deltas = {};
  if (g.paridade === 'impar') {
    if (!p1) return;
    deltas[p1] = 1;
  } else {
    if (!p1 || !p2 || p1 === p2) return;
    deltas[p2] = 2;
    deltas[p1] = 1;
  }
  for (const [k, d] of Object.entries(deltas)) {
    if ((a.attrs[k] || 0) + d > ATTR_MAX) return avisar(`${ATTR_NAMES[k]} passaria do máximo de ${ATTR_MAX}.`, 'error');
  }

  for (const [k, d] of Object.entries(deltas)) a.attrs[k] = (a.attrs[k] || 0) + d;
  const vidaAntes = a.vidaCur || 0;
  a.vidaMax = (a.vidaMax || 0) + g.vida;
  a.vidaCur = Math.min(a.vidaMax, vidaAntes + g.vida);
  a.devPotencial = n;
  a.devLog.push({ id: novoId(), tipo: 'pl', n, custo, vida: g.vida, vidaAtual: a.vidaCur - vidaAntes, attrs: deltas, ts: Date.now() });

  plRascunho = null;
  const resumo = Object.entries(deltas).map(([k, d]) => `+${d} ${k.toUpperCase()}`).join(', ');
  avisar(`Potencial Latente ${n}º: +${g.vida} Vida, ${resumo}.`, 'success');
  persistir(a);
}

function desfazer(a, id) {
  const i = (a.devLog || []).findIndex(e => e.id === id);
  if (i === -1) return;
  const e = a.devLog[i];

  if (e.tipo === 'traco') {
    const c = contarCompras(a.devLog);
    if (1 + c.traco - 1 < c.refTraco) return avisar('Remova antes um Refinamento de Traço.', 'error');
  }
  if (e.tipo === 'pl') {
    const ultimo = [...a.devLog].reverse().find(x => x.tipo === 'pl');
    if (ultimo?.id !== e.id) return avisar('Só o último aumento de Potencial Latente pode ser desfeito.', 'error');
    for (const [k, d] of Object.entries(e.attrs || {})) a.attrs[k] = Math.max(0, (a.attrs[k] || 0) - d);
    a.vidaMax = Math.max(0, (a.vidaMax || 0) - (e.vida || 0));
    a.vidaCur = Math.min(a.vidaMax, (a.vidaCur || 0) - (e.vidaAtual || 0));
    a.devPotencial = Math.max(0, (a.devPotencial || 0) - 1);
    const bmMax = ((a.attrs.raz || 0) + (a.attrs.ins || 0)) * 5;
    if ((a.bmCur || 0) > bmMax) a.bmCur = bmMax;
  }
  a.devLog.splice(i, 1);
  plRascunho = null;
  avisar('Compra desfeita — PD devolvidos.', 'success');
  persistir(a);
}

/* ── Bônus de Progressão: usos por sessão/cena ── */
function alternarUso(a, id, i) {
  const b = BONUS_PROGRESSAO.find(x => x.id === id);
  if (!b?.usos) return;
  const usados = Math.min(b.usos, a.progUsos?.[id] || 0);
  a.progUsos = { ...(a.progUsos || {}), [id]: i < usados ? i : i + 1 };
  persistir(a, { recarregar: false });
}

function renovarUsos(a, por) {
  const novo = { ...(a.progUsos || {}) };
  for (const b of BONUS_PROGRESSAO) {
    if (!b.usos) continue;
    if (por === 'sessão' || b.por === por) novo[b.id] = 0;
  }
  a.progUsos = novo;
  avisar(por === 'cena' ? 'Usos por cena renovados.' : 'Usos de Bônus de Progressão renovados.', 'success');
  persistir(a, { recarregar: false });
}

/* ── Distribuição inicial ── */
function aplicarDistribuicao(a) {
  const chk = checarDistribuicao(distRascunho || {});
  if (!chk.ok) return avisar('Distribua os cinco valores (4, 3, 2, 2 e 1).', 'error');
  if ((a.devPotencial || 0) > 0) return avisar('Já há aumentos de Potencial Latente: não dá para refazer a distribuição inicial.', 'error');

  const temAtributos = ATTR_KEYS.some(k => (a.attrs[k] || 0) > 0);
  const igual        = ATTR_KEYS.every(k => (a.attrs[k] || 0) === distRascunho[k]);
  if (temAtributos && !igual && !armado) {            // evita sobrescrever sem querer
    armado = true;
    clearTimeout(armadoTimer);
    armadoTimer = setTimeout(() => { armado = false; const ag = getActiveAgent(); if (ag) renderDesenvolvimento(ag); }, 5000);
    return renderDesenvolvimento(a);
  }
  armado = false;
  clearTimeout(armadoTimer);

  for (const k of ATTR_KEYS) a.attrs[k] = distRascunho[k];
  a.vidaMax = calcVidaInicial(a.attrs.fis);
  a.vidaCur = a.vidaMax;
  a.bmCur   = (a.attrs.raz + a.attrs.ins) * 5;
  a.distribInicial = true;
  distAberta = false;
  avisar(`Distribuição aplicada. Vida ${a.vidaMax}, Barreira Mágica ${a.bmCur}.`, 'success');
  persistir(a);
}
