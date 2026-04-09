

## Plano de implementação — 5 melhorias

### 1. `/all-predictions` — Ordem alfabética + posição no ranking
- Ordenar `profiles` alfabeticamente por `name` antes de renderizar as linhas.
- Buscar dados de `scores` e calcular ranking (mesma lógica de `RankingPage`) para obter a posição de cada usuário.
- Exibir no nome: `{profile.name} [{posição}]`.
- Remover o pseudo-elemento `after:` (barra vertical separadora) da coluna sticky de nome e dos cabeçalhos.
- Reduzir `gap`/`padding` entre a coluna de nomes e a primeira coluna de jogos.

### 2. `/predictions` — Texto descritivo no "Ver palpites" em vez de coluna de pontuação
No componente `ExpandablePredictions`:
- Remover a coluna `{e.points > 0 ? '+' : ''}{e.points}` (span de pontos numéricos).
- Entre o nome do usuário e o placar, inserir um texto em itálico e cinza baseado nos pontos:
  - `+5` → *"brocandooo"*
  - `+2` → *"tá quaseee"*
  - `0` → *"na torcida ainda"*
  - `-1` → *"KKKKKKK"*
- Mostrar o texto apenas quando `points !== null` (jogo iniciado).

### 3. `/predictions` — Filtro PRÓXIMOS JOGOS não esconder jogos encerrados
Alterar a lógica do filtro `PRÓXIMOS JOGOS`:
- Calcular a janela de 24h (4AM Salvador como corte) igual a hoje.
- Filtrar jogos cujo `match_datetime` está dentro dessa janela, **independente de `is_finished`**.
- Remover o `!m.is_finished` do filtro.
- Se não houver jogos na janela atual (ex: antes da Copa), mostrar os próximos 4 jogos futuros.

### 4. `/predictions` — Realtime para matches, scores e predictions
Já existe um channel realtime que escuta `matches`, `scores` e `predictions`. Verificar se está funcionando corretamente:
- O channel atual escuta `UPDATE` em `matches` e `*` em `scores`/`predictions` — isso já deveria cobrir atualizações do admin.
- Verificar se `matches` e `predictions` estão na publicação `supabase_realtime`. Se não, criar uma migration para adicionar.
- Garantir que o `fetchMatches()` e `fetchAllPredictions()` e `fetchAllScores()` são chamados no callback.

**Migration SQL necessária:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
```
(A tabela `scores` provavelmente já foi adicionada em migration anterior.)

### 5. `/all-predictions` — Realtime
Adicionar subscription realtime no `AllPredictionsPage` para `matches`, `scores` e `predictions`, re-fetching dados quando houver mudanças.

### Arquivos modificados
- **Migration SQL** — habilitar realtime em `matches` e `predictions`
- **`src/pages/AllPredictionsPage.tsx`** — ordenação alfabética, posição no ranking, remoção da barra, realtime
- **`src/pages/PredictionsPage.tsx`** — texto descritivo no expandable, filtro PRÓXIMOS JOGOS sem esconder encerrados
