# Instruções para agentes de código (ChatGPT/Codex, Claude, etc.)

App Android **Jogos ao Vivo** (Capacitor). O dono do projeto não é programador: explique tudo em
português simples e passo a passo.

## Estrutura
- `www/` — o app (HTML, CSS e JavaScript simples, sem bundler; módulos ES em `www/js/`).
  - `js/app.js` tela e regras de atualização · `js/leagues.js` lista de competições
  - `js/sources/espn.js` jogos (ESPN, sem chave) · `js/espnhost.js` servidor de reserva e épocas
  - `js/channels.js` canais de TV (futebolnatv.com.br) · `js/standings.js` classificação
  - `js/detalhes.js` detalhes do jogo · `js/notify.js` avisos · `js/favorites.js` times favoritos
- `android/` — projeto Android (assinatura lida de variáveis de ambiente; não alterar sem necessidade).
- `tests/` — testes (`npm test`). `tools/` — scripts de diagnóstico/verificação usados no GitHub Actions.
- `.github/workflows/` — `apk.yml` gera o APK a cada push; `verificacao.yml` corre todos os dias.

## Regras
1. **Antes de enviar qualquer mudança:** `npm ci && npm test` — todos os testes têm de passar.
2. **Trabalhe num ramo novo e abra um pull request** para `ccr-ba3f24b0-3joki5` (o ramo principal).
   Não faça push direto para o ramo principal: outros agentes também trabalham nele.
3. **Nunca** coloque chaves, senhas ou o ficheiro `.jks` no repositório (é público). Tudo isso fica
   em GitHub Secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`, `FOOTBALL_DATA_KEY`). Não altere a assinatura do APK: o app tem de continuar
   a instalar por cima da versão anterior.
4. Horários sempre no fuso `Europe/Lisbon`; canais de TV do Brasil; textos da interface em português.
5. Poupar pedidos à ESPN (ela bloqueia com HTTP 403 se forem muitos): não aumentar a frequência de
   atualização sem motivo; usar `espnJson()` de `js/espnhost.js` para qualquer pedido novo à ESPN.
6. Mudanças pequenas e focadas, com testes para a lógica nova (em `tests/`).
7. Não há acesso de rede às APIs reais em alguns ambientes: para confirmar com dados reais, use o
   workflow "Diagnóstico" ou "Verificação diária" no GitHub Actions.
