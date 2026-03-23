

## Classificação em tempo real durante os jogos

### Problema
Hoje, os pontos (`scores`) só são calculados quando o admin encerra um jogo (`is_finished = true`). O ranking só reflete resultados finais.

### Solução
Recalcular os pontos **a cada atualização de gol** pelo admin, não apenas ao encerrar. Assim o ranking se atualiza em tempo real conforme os gols acontecem.

### Mudanças necessárias

**1. Migration — Alterar a função `calculate_match_scores`**
- Remover a verificação `is_finished = true` da query. A função deve calcular pontos mesmo para jogos em andamento.
- Tratar `home_score`/`away_score` como `NULL` → pular (sem gols registrados ainda).

**2. Migration — Habilitar Realtime na tabela `scores`**
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;`
- Permite que o RankingPage escute mudanças em tempo real.

**3. AdminPage — Chamar `calculate_match_scores` a cada gol**
- Na função `updateScore` (que atualiza `+`/`-` gols), após o update do placar, chamar `supabase.rpc('calculate_match_scores', { p_match_id: matchId })`.
- Isso recalcula os pontos de todos os palpiteiros a cada gol atualizado.

**4. RankingPage — Escutar mudanças em tempo real**
- Adicionar um `supabase.channel('scores')` que escuta `postgres_changes` na tabela `scores`.
- Ao receber evento, re-fetchar o ranking (ou recalcular localmente).

### Detalhes técnicos

**Função SQL atualizada:**
```sql
CREATE OR REPLACE FUNCTION public.calculate_match_scores(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_home_score INT;
  v_away_score INT;
  v_pred RECORD;
  v_points INT;
BEGIN
  -- Remove the is_finished check
  SELECT home_score, away_score INTO v_home_score, v_away_score
  FROM public.matches WHERE id = p_match_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  DELETE FROM public.scores WHERE match_id = p_match_id;

  FOR v_pred IN SELECT * FROM public.predictions WHERE match_id = p_match_id
  LOOP
    -- same scoring logic (5, 2, 0, -1)
    ...
    INSERT INTO public.scores (user_id, match_id, points) VALUES (...);
  END LOOP;
END;
$$;
```

**RankingPage realtime subscription:**
```typescript
useEffect(() => {
  const channel = supabase
    .channel('scores-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' },
      () => fetchRanking()
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [tab, selectedDate]);
```

### Arquivos modificados
- **Migration SQL** — atualiza `calculate_match_scores`, habilita realtime em `scores`
- **`src/pages/AdminPage.tsx`** — chama `calculate_match_scores` após cada `+`/`-` de gol
- **`src/pages/RankingPage.tsx`** — adiciona subscription realtime na tabela `scores`

