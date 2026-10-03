/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — app.js
   Entry Point: inicializa e conecta todos os módulos.
   ══════════════════════════════════════════════════════ */

import { renderRoster, bindRosterEvents, bindSheetEvents, showView } from './ui.js';
import { bindSkillRolls } from './dice.js';
import { getTheme, applyTheme } from './state.js';

/* ══════════════════════════
   INICIALIZAÇÃO
══════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // 0. Aplicar tema salvo (antes de qualquer render, evita flash)
  applyTheme(getTheme());

  // 1. Mostrar o Roster como tela inicial
  showView('roster');

  // 2. Renderizar os cards de agentes salvos
  renderRoster();

  // 3. Conectar todos os eventos do Roster
  //    (novo agente, import, delete modal)
  bindRosterEvents();

  // 4. Conectar todos os eventos da Ficha
  //    (abas, atributos, status, arsenal, habilidades, notas)
  bindSheetEvents();

  // 5. Conectar rolagem de dados em todas as .skill-row
  bindSkillRolls();

  // 6. Prevenir perda acidental ao fechar a aba com ficha aberta
  window.addEventListener('beforeunload', (e) => {
    const sheet = document.getElementById('view-sheet');
    if (sheet.classList.contains('active')) {
      // Navegadores modernos ignoram a mensagem customizada,
      // mas o diálogo nativo ainda aparece.
      e.preventDefault();
      e.returnValue = '';
    }
  });

  console.log('[Dissonância & Mácula] Aplicação inicializada.');
});
