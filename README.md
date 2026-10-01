# Dissonância & Mácula — Ficha de Personagem Online

Sistema completo de gerenciamento de fichas para o RPG de mesa Dissonância & Mácula.
Acesse em: https://brunomaciel-arch.github.io/Dissonancia-Macula/

Central de Personagens
A tela inicial exibe todos os personagens salvos em formato de cards, cada um mostrando foto, nome, título e barras de Vida, Barreira Mágica e Fonte em tempo real.

Novo Personagem — cria uma ficha em branco e a abre automaticamente
Importar — carrega uma ficha a partir de um arquivo .json exportado anteriormente. Se o ID já existir, o site pergunta se deseja substituir ou criar uma cópia
Ficha do Personagem
Cada ficha é dividida em seis abas acessíveis pelo menu superior.

Aba ID
Informações de identidade do personagem:

Foto — clique na área para adicionar uma imagem. Com foto carregada, dois botões aparecem no canto superior direito: Trocar (substitui a foto) e Mover (ativa o modo de reposicionamento e zoom). No modo Mover, arraste a imagem para reposicioná-la e use o slider ou o scroll do mouse para ajustar o zoom. A posição e o zoom são salvos automaticamente.
Campos de identidade — Nome, Título/Codinome, Forma, Idade e Ano de Nascimento
História — campo de texto livre para a narrativa do personagem
Resumo lateral — barras de Vida e BM, pips de Fonte e mini-grid de atributos, sempre atualizados conforme os valores da Aba Status
Aba Status
Controle completo dos valores vitais e atributos:

Atributos (0 a 12 cada):
RAZ — Razão
INS — Instinto
PRE — Precisão
PRS — Presença
FIS — Físico
Status Vitais:

Vida — valor atual pode chegar até −10 (Zona Crítica). Botões de atalho: Máximo (restaura ao total) e campo ±valor para adicionar ou remover uma quantidade específica
Barreira Mágica — limite calculado automaticamente por (RAZ + INS) × 5. Mesmos atalhos da Vida
Fonte — 0 a 10 pips interativos. Tipo selecionável: Poder, Corrupção ou Adrenalina
Fontes de Ação — 5 hexágonos que funcionam como checkboxes de uso
Desenvolvimento:

Aprendizado (0 a 5)
Desenvolvimento (0 a 30)
Potencial Latente (0 a 10)
Aba Perícias
20 perícias organizadas por atributo base. Clique em qualquer perícia para rolar os dados.

Grupos:

Físico: Atletismo, Força, Resistência Física
Instinto: Sobrevivência, Intuição, Percepção
Razão: Tecnologia, Raciocínio
Precisão: Prestidigitação
Presença: Furtividade, Engano, Presença
Híbridos (média de dois atributos): Redirecionamento, Medicina, Confecção e Reparo, Resistência Mental, Concentração, Agilidade, Investigação, Negociação
Painel de Rolagem (ao lado das perícias no desktop, abaixo no mobile):

Bônus — valor fixo somado a cada rolagem enquanto a ficha estiver aberta. Útil para buffs temporários
Resultado — exibe os dois dados, o modificador, o bônus e o total. A qualidade da rolagem é classificada em: ✦ Axioma (dois 10), ✖ Absurdo (dois 1), ~ Fluidez (total par) ou ~ Atrito (total ímpar)
Dado Livre — campo de texto para rolar qualquer expressão de dado, como 4d6+2, 3d8+1 ou 1d100. Pressione Enter ou clique em Rolar
Histórico — registro das últimas 50 rolagens da sessão atual. Salvo no perfil do personagem. Botão de limpar disponível
Aba Arsenal
Recursos e equipamentos do personagem:

RD (Traje) — presets rápidos: Comum (RD 0), Desenvolvido (RD 4) e Avançado (RD 8). Valor também editável manualmente
Créditos Universais — contador numérico livre
Tabela de Equipamentos — adicione itens com Nome, Descrição, Mercado, Dano, Alcance, Preço e Quantidade. Cada linha é editável diretamente. Botão para remover itens individualmente
Aba Habilidades
Cards individuais para cada habilidade do personagem. Cada card contém:

Nome e tipo (Ordem, Ruína ou Adrenalina) — indicado por cor de borda
Descrição da Técnica
Refinamento
Os cards iniciam em modo leitura. Clique em ✎ Editar para modificar os campos — os dados são salvos automaticamente ao sair do campo. Clique em ✕ Remover para excluir a habilidade.

Aba Anotações
Blocos de texto livres organizados em duas colunas (uma coluna no mobile). Cada bloco tem título e área de texto. Adicione quantos blocos quiser e remova individualmente.

Exportar e Importar
O botão Exportar abre um modal com duas opções:

.json — arquivo completo com todos os dados da ficha, incluindo foto em Base64. Usado para reimportar no site e fazer backup
.txt — ficha formatada para leitura humana. Ideal para compartilhar no Discord, WhatsApp ou imprimir. Contém identidade, status vitais, atributos, desenvolvimento, arsenal, habilidades e anotações
Integração com Discord (Webhook)
Cada personagem pode ter dois webhooks do Discord configurados independentemente. Acesse pelo botão ⚙ Configurações na ficha.

Webhook de Rolagens — toda rolagem de perícia ou dado livre é enviada automaticamente para o canal configurado, mostrando os dados individuais, modificador, bônus e total com o label de qualidade (Axioma, Absurdo, Fluidez ou Atrito).
Webhook de Status — alterações de Vida, BM ou Fonte são acumuladas por 5 segundos e enviadas em uma única mensagem mostrando o estado atual dos três campos e o resumo de todas as mudanças do período (ex: Vida ▼ 12 · Barreira ▼ 50).

Ambos os campos têm botão de Testar para confirmar que a URL está correta antes de usar em sessão.

Como criar um webhook no Discord:

Clicar com o botão direito no canal desejado → Editar Canal
Integrações → Webhooks → Criar Webhook
Copiar a URL e colar no campo correspondente nas Configurações da ficha
Persistência de Dados
Todos os dados são salvos automaticamente no localStorage do navegador a cada alteração. Não há servidor — nada é enviado para a internet, exceto pelas mensagens de webhook do Discord quando configurado.

Para garantir que os dados não sejam perdidos, use a função Exportar .json regularmente como backup. Fichas podem ser transferidas entre dispositivos ou navegadores por meio da importação do arquivo exportado.
