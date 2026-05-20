## Plano — Fonte FWC 26 nos títulos

### Pré-requisito
Você envia os arquivos da fonte FWC 26 no chat (idealmente `.woff2`; `.ttf`/`.otf` também servem). Se forem múltiplos pesos, mande todos.

### Passos

1. **Salvar a fonte no projeto**
   - Copiar os arquivos enviados para `public/fonts/` (ex.: `public/fonts/FWC26-Bold.woff2`).

2. **Registrar a fonte via `@font-face`**
   - Em `src/index.css`, adicionar um bloco `@font-face` com `font-family: 'FWC 26'`, `font-display: swap` apontando para os arquivos em `/fonts/...`.

3. **Expor como utilitário Tailwind**
   - Em `tailwind.config.ts`, adicionar `fwc: ['"FWC 26"', 'DM Serif Display', 'serif']` em `fontFamily` — gera a classe `font-fwc`.
   - DM Serif Display (atual) e DM Sans continuam intactos para o resto do app.

4. **Aplicar nos dois únicos locais combinados**
   - `src/pages/AuthPage.tsx`: adicionar `font-fwc` nos dois `<h1>`/`<p>` que renderizam "Rebolão" e "2026".
   - `src/components/AppLayout.tsx`: adicionar `font-fwc` no `<h1>` "Rebolão da Copa 2026" do header.

### Fora de escopo (não vou tocar)
- Subtítulos, body, botões, qualquer outro título do app.
- Cores, tamanhos, espaçamentos, estrutura — apenas a `font-family` muda nesses 3 elementos.

### Arquivos afetados
- `public/fonts/` (novos arquivos)
- `src/index.css` (+ `@font-face`)
- `tailwind.config.ts` (+ entrada `fwc` em `fontFamily`)
- `src/pages/AuthPage.tsx` (+ classe `font-fwc` em 2 elementos)
- `src/components/AppLayout.tsx` (+ classe `font-fwc` em 1 elemento)

Aguardo o(s) arquivo(s) da fonte para implementar.
