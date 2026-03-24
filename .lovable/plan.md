

## Correções e melhorias no Admin

### Problema identificado
O código atual tem um bug: na função `updateScore`, o `calculate_match_scores` só é chamado se o campo **oposto** (`otherField`) já tiver valor (linha 82-84). Ou seja, se você atualiza `home_score` mas `away_score` ainda é `null`, a pontuação **não é recalculada**. Isso impede a atualização em tempo real da classificação.

### Mudanças

**1. `AdminPage.tsx` — Corrigir `updateScore`**
- Ao atualizar um score, se o outro campo for `null`, setar ele como `0` no mesmo update.
- Sempre chamar `calculate_match_scores` após qualquer atualização de gol — sem condição.
- Resultado: cada clique em `+`/`-` recalcula pontos imediatamente → ranking atualiza em tempo real.

**2. `AdminPage.tsx` — Adicionar botão de excluir jogo**
- Ícone `Trash2` (lucide) vermelho no canto superior direito de cada card de jogo.
- Ao clicar, exibe confirmação simples (window.confirm).
- Exclui os `scores` associados ao jogo, depois exclui o jogo da tabela `matches`.
- As `predictions` ficam órfãs mas sem impacto (ou podemos deletá-las também).

**3. Migration — Permitir admin deletar matches e scores relacionados**
- Adicionar `ON DELETE CASCADE` nos foreign keys de `scores` e `predictions` referenciando `matches`, OU simplesmente deletar scores/predictions via queries separadas antes de deletar o match (mais simples, sem migration).

### Arquivos modificados
- `src/pages/AdminPage.tsx` — fix do `updateScore`, botão de excluir jogo

