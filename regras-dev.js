/* ════════════════════════════════════════════════════════
   REGRAS DE DESENVOLVIMENTO — Dissonância & Mácula
   Funções puras (sem DOM, sem estado global), baseadas no livro:
   · pág. 13–14  Pontos de Aprendizado, gasto de PD e Potencial Latente
   · pág. 17     Distribuição inicial de valores nos atributos
   · pág. 20     Vida inicial (10 + Físico)
   · pág. 46     Bônus de Progressão
════════════════════════════════════════════════════════ */

export const ATTR_KEYS  = ['raz', 'ins', 'pre', 'prs', 'fis'];
export const ATTR_NAMES = { raz: 'Razão', ins: 'Instinto', pre: 'Precisão', prs: 'Presença', fis: 'Físico' };
export const ATTR_MAX   = 12;      // pág. 17 (o Guia Mestre pode alterar; a ficha usa o padrão)

/* ───────── pág. 17 — Distribuição inicial ───────── */
export const DISTRIBUICAO_INICIAL = [4, 3, 2, 2, 1];
export const VIDA_INICIAL_BASE    = 10;   // pág. 20: "Inicia com 10 pontos + Físico"

/** Valores da distribuição ainda não usados (o "2" aparece duas vezes). */
export function poolRestante(valores) {
  const pool = [...DISTRIBUICAO_INICIAL];
  for (const v of valores) {
    if (v == null) continue;
    const i = pool.indexOf(v);
    if (i !== -1) pool.splice(i, 1);
  }
  return pool;
}

/**
 * Confere uma distribuição { raz, ins, pre, prs, fis } (valores ou null).
 * ok = todos os 5 atributos preenchidos usando exatamente 4, 3, 2, 2 e 1.
 */
export function checarDistribuicao(mapa) {
  const valores = ATTR_KEYS.map(k => mapa[k] ?? null);
  const pool = [...DISTRIBUICAO_INICIAL];
  let invalido = false;
  for (const v of valores) {
    if (v == null) continue;
    const i = pool.indexOf(v);
    if (i === -1) invalido = true; else pool.splice(i, 1);
  }
  const faltam = valores.filter(v => v == null).length;
  return { ok: !invalido && faltam === 0, invalido, faltam, restantes: pool };
}

/** Vida inicial = 10 + Físico (pág. 20). */
export function calcVidaInicial(fis) { return VIDA_INICIAL_BASE + (fis || 0); }

/* ───────── pág. 13–14 — PA, PD e gastos ───────── */
export const PA_POR_PD   = 5;
export const PL_MAX      = 10;   // "Limitado a 10 aumentos no total"
export const TRACOS_MAX  = 6;    // Traço Inicial (grátis) + Novos Traços
export const FORMAS_MAX  = 2;    // Refinamento/Proficiência de Forma Desbloqueada

export const CUSTO_TRACO     = 2;
export const CUSTO_REF_TRACO = 1;
export const CUSTO_REF_FORMA = 1;

/** Custo do n-ésimo aumento de Potencial Latente: 1 PD (1º ao 6º), 2 PD (7º ao 10º). */
export function custoPotencialLatente(n) { return n <= 6 ? 1 : 2; }

/**
 * Ganhos do n-ésimo aumento de Potencial Latente (pág. 14):
 *  · ímpar (1ª, 3ª…): +2 Vida | +1 ponto de Atributo
 *  · par   (2ª, 4ª…): +2 Vida | +3 pontos em dois Atributos (+1 e +2)
 */
export function ganhosPotencialLatente(n) {
  return n % 2 === 1
    ? { paridade: 'impar', vida: 2, pontos: 1 }
    : { paridade: 'par',   vida: 2, pontos: 3 };
}

export const TIPOS_COMPRA = {
  traco:    { rotulo: 'Novo Traço',                 custo: CUSTO_TRACO },
  refTraco: { rotulo: 'Refinamento de Traço',       custo: CUSTO_REF_TRACO },
  refForma: { rotulo: 'Refinamento/Proficiência de Forma', custo: CUSTO_REF_FORMA },
  pl:       { rotulo: 'Potencial Latente',          custo: null },
};

/** Quantidade de compras por tipo no histórico (devLog). */
export function contarCompras(log) {
  const c = { traco: 0, refTraco: 0, refForma: 0, pl: 0 };
  for (const e of (log || [])) if (e && c[e.tipo] !== undefined) c[e.tipo]++;
  return c;
}

/** Aumentos de PL feitos antes da automação (só o contador manual, sem histórico). */
export function plLegado(agente) {
  const noLog = contarCompras(agente.devLog).pl;
  return Math.max(0, (agente.devPotencial || 0) - noLog);
}

/** Total de PD já gastos: histórico + aumentos de PL legados (custo da posição de cada um). */
export function pdGastos(agente) {
  let total = 0;
  for (const e of (agente.devLog || [])) total += e?.custo || 0;
  // aumentos legados ocupam as primeiras posições (1ª..legado); os do histórico vêm depois
  const legado = plLegado(agente);
  for (let n = 1; n <= legado; n++) total += custoPotencialLatente(n);
  return total;
}

export function pdDisponiveis(agente) {
  return Math.max(0, (agente.devDesenvolvimento || 0) - pdGastos(agente));
}

/**
 * Estado de cada opção de gasto: custo, uso/limite e se pode comprar agora.
 * Retorna { tipo: { custo, usado, limite, ok, motivo } }.
 */
export function opcoesDeGasto(agente) {
  const c      = contarCompras(agente.devLog);
  const disp   = pdDisponiveis(agente);
  const tracos = 1 + c.traco;                       // inicial (grátis) + comprados
  const plFeitos = agente.devPotencial || 0;

  const mk = (custo, usado, limite, motivoLimite) => {
    let ok = true, motivo = '';
    if (usado >= limite)      { ok = false; motivo = motivoLimite; }
    else if (disp < custo)    { ok = false; motivo = `Faltam ${custo - disp} PD`; }
    return { custo, usado, limite, ok, motivo };
  };

  return {
    traco:    mk(CUSTO_TRACO,     tracos,        TRACOS_MAX,  `Máximo de ${TRACOS_MAX} Traços`),
    refTraco: mk(CUSTO_REF_TRACO, c.refTraco,    tracos,      'Um refinamento por Traço'),
    refForma: mk(CUSTO_REF_FORMA, c.refForma,    FORMAS_MAX,  `Máximo de ${FORMAS_MAX} Formas`),
    pl:       mk(custoPotencialLatente(plFeitos + 1), plFeitos, PL_MAX, `Máximo de ${PL_MAX} aumentos`),
  };
}

/* ───────── pág. 46 — Bônus de Progressão ───────── */
/**
 * `usos` > 0 = recurso com usos limitados; `por` = 'sessão' | 'cena'.
 * `fa` = Fontes de Ação extras concedidas pelo marco.
 */
export const BONUS_PROGRESSAO = [
  { id: 'b0',  pd: 0,  texto: 'Nenhum bônus aplicável' },
  { id: 'b3',  pd: 3,  texto: 'Rerrola até 2 dados de dano com valor "1"',                       usos: 2, por: 'sessão' },
  { id: 'b6',  pd: 6,  texto: 'Reduz a movimentação entre Zonas em 1 FA',                        usos: 2, por: 'sessão', fa: 1 },
  { id: 'b10', pd: 10, texto: 'Aprende Forma extra' },
  { id: 'b14', pd: 14, texto: 'Não gera Fonte de Dissonância ao obter Atrito',                   usos: 1, por: 'cena' },
  { id: 'b20', pd: 20, texto: 'Ignora metade da RD da entidade alvo',                            usos: 2, por: 'sessão', fa: 1 },
  { id: 'b30', pd: 30, texto: 'Causa dano máximo automaticamente em ataque bem-sucedido',        usos: 1, por: 'sessão' },
];

export const FA_BASE            = 2;
export const FA_MAX             = 5;   // pág. 44: máximo absoluto por turno (já contando a Fluidez)
export const ACOES_MAIORES_MAX  = 3;

/**
 * Tudo o que os PD acumulados do personagem desbloqueiam (pág. 46).
 * Os marcos contam os PD acumulados (gastos + disponíveis): "Cada 10 PD" e
 * "Cada 15 PD" seguem além de 30, o que só faz sentido com o total acumulado.
 */
export function calcProgressao(agente) {
  const pd = Math.max(0, agente.devDesenvolvimento || 0);
  const desbloqueados = BONUS_PROGRESSAO.filter(b => pd >= b.pd);
  const faExtra       = desbloqueados.reduce((s, b) => s + (b.fa || 0), 0);

  return {
    pd,
    desbloqueados,
    faExtra,
    faNormais:      FA_BASE + faExtra,                           // FA por turno sem Fluidez
    dadosDanoExtra: Math.floor(pd / 10),                         // "Cada 10 PD: +1 Dado de Dano base"
    acoesMaiores:   Math.min(ACOES_MAIORES_MAX, 1 + Math.floor(pd / 15)), // "Cada 15 PD: +1 Ação Maior (máx. 3)"
    formaExtra:     pd >= 10,
    proximo:        proximoMarco(pd),
  };
}

/** Próximo marco de PD (fixo, múltiplo de 10 ou de 15 que ainda concede algo). */
export function proximoMarco(pd) {
  const alvos = [];
  for (const b of BONUS_PROGRESSAO) if (b.pd > pd) alvos.push({ pd: b.pd, texto: b.texto });
  const m10 = (Math.floor(pd / 10) + 1) * 10;
  alvos.push({ pd: m10, texto: '+1 Dado de Dano base' });
  const m15 = (Math.floor(pd / 15) + 1) * 15;
  if (1 + Math.floor(m15 / 15) <= ACOES_MAIORES_MAX) alvos.push({ pd: m15, texto: '+1 Ação Maior por turno' });
  alvos.sort((a, b) => a.pd - b.pd);
  return alvos[0] ? { pd: alvos[0].pd, falta: alvos[0].pd - pd, texto: alvos[0].texto } : null;
}

/**
 * "Ganha +1 Dado de Dano base": soma `n` dados ao primeiro termo de dado da
 * expressão da arma ("1d8" → "2d8", "2d6+1" → "3d6+1"). Sem dado, devolve igual.
 */
export function somarDadosBase(expr, n) {
  if (!n || !expr) return expr;
  let feito = false;
  return String(expr).replace(/(\d+)(\s*d\s*\d+)/i, (m, count, resto) => {
    if (feito) return m;
    feito = true;
    return `${Math.min(100, parseInt(count, 10) + n)}${resto}`;
  });
}
