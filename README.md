# Jogos ao Vivo ⚽

App Android simples com os jogos destas competições:

- **Ligas:** Brasileirão, Premier League, Campeonato Espanhol, Italiano, Bundesliga,
  Campeonato Francês, Português e Argentino;
- **Taças de clubes:** Champions League, Liga Europa, Libertadores, Copa Sul-Americana e Copa do Brasil;
- **Seleções:** Liga das Nações (UEFA), Eliminatórias da América do Sul, Copa América, Copa do Mundo
  e amistosos das seleções da América do Sul (Brasil, Argentina, Uruguai, etc.).

A lista fica em `www/js/leagues.js`. O app mostra:

- separador **Ao vivo**: só os jogos a decorrer, em destaque (placar e minuto), e por baixo os
  próximos 5 jogos;
- separador **Resultados**: placar final dos jogos que já terminaram hoje e dos de ontem;
- separador **Campeonatos**: um botão por competição (com o número de jogos e quantos estão ao vivo);
  toque para ver os **Jogos** dessa competição nos próximos 14 dias ou a **Classificação**
  (posição, jogos, vitórias, empates, derrotas, saldo e pontos, com as cores das zonas:
  Libertadores, Champions, rebaixamento, etc.). Taças a eliminar, como a Copa do Brasil, não têm tabela;
- separador **Filmes**: ~20 filmes e séries recentes e bem avaliados (nota de 0 a 10), escolhidos
  para o gosto de roubos/golpes, hackers e tecnologia, estratégia, espionagem e guerra, com a plataforma
  quando se sabe (Netflix, Prime Video, etc.). A lista é refeita **uma vez por dia** no GitHub (workflow
  "Filmes") e o app descarrega-a no máximo de 12 em 12 horas. Não precisa de conta nem de chave:
  notas do IMDb (ficheiros públicos), título em português, plataforma, resumo e imagem da
  Wikidata/Wikipédia;
- separador **Calendário**: de **ontem** até daqui a 13 dias, um botão por dia, com o número de jogos;
- **aviso de versão nova**: quando há um APK mais recente, aparece uma faixa verde com o botão
  "Atualizar" (abre o download no navegador; instala por cima). Verifica no máximo de 6 em 6 horas;
- visual em azul e roxo, cada campeonato com a sua cor;
- **horário de Portugal** (muda sozinho no horário de verão);
- **canal de TV do Brasil** em hoje e amanhã (ou "canal a confirmar"); o site dos canais só
  publica a véspera, por isso os dias mais à frente aparecem sem canal;
- jogos do **Santos sempre em destaque** (fundo dourado e ★) e caixa "Próximos jogos do Santos";
- tema da tela **Automático** (segue o telemóvel), **Escuro** ou **Claro**; a escolha fica guardada.

O APK é gerado automaticamente pelo GitHub sempre que o código muda.

---

## 1. De onde vêm os dados (e porquê)

| O quê | Fonte | Precisa de chave? |
|---|---|---|
| Jogos, placares e minuto ao vivo (todas as competições) | ESPN (dados públicos) | Não |
| Reserva, se a ESPN falhar (só Brasileirão, Champions, 6 ligas europeias e Copa do Mundo) | football-data.org, plano grátis | Sim (opcional) |
| Canais de TV do Brasil | futebolnatv.com.br | Não |

**Porque não a API-Football?** O plano grátis da API-Football só libera **temporadas antigas**
(as temporadas atuais respondem com erro de plano). Com ela, o app não mostraria os jogos de hoje.
Por isso foi trocada.

**O que fica de fora / limitações:**
- A ESPN não é uma API oficial: é grátis e completa, mas um dia pode mudar. Se isso acontecer,
  o app passa sozinho para o football-data.org (se tiver a chave), mas só para as competições
  que o plano grátis tem (ficam de fora Argentino, Liga Europa, taças sul-americanas, Copa do Brasil
  e jogos de seleções, exceto a Copa do Mundo).
- Desde novembro de 2026 a ESPN não aceita pedir vários dias de uma vez; o app pede **dia a dia**
  (no máximo 8 pedidos ao mesmo tempo). Por isso a primeira atualização pode levar alguns segundos.
- No football-data.org grátis o placar ao vivo chega **com atraso** e às vezes sem o minuto.
- Os canais vêm de um site que não tem API. Se o site mudar o layout, aparece
  "canal a confirmar" até o app ser ajustado. Os jogos e horários continuam a funcionar.
- Só entram as competições da lista (não entram Série B, Liga Conferência, etc.).
  Se o Santos jogar noutra competição, não aparece.

**Quantas consultas faz:** a agenda é guardada no telemóvel e atualizada no máximo a cada
4 horas (≈ 6 vezes por dia). O placar ao vivo é atualizado de 10 em 10 minutos, **só com o app
aberto e só quando há jogo a decorrer**. O botão "Atualizar" não deixa repetir em menos de 2 minutos
(a não ser que a última tentativa tenha dado erro). Se um campeonato falhar, o motivo aparece em
baixo, junto de "Sem dados agora".

---

## 2. Segurança (o repositório é público)

- Nenhuma senha ou chave está no código. Tudo fica em **GitHub Secrets**, que ninguém consegue ver,
  nem quem visita o repositório.
- A chave de assinatura do APK é sempre a mesma → cada APK novo **instala por cima** do anterior,
  sem desinstalar e sem perder nada.
- ⚠️ Atenção: a chave do football-data.org (opcional) acaba **dentro do APK**, porque é o telemóvel
  que faz o pedido. Como o repositório é público, qualquer pessoa com conta no GitHub consegue baixar
  o APK e, com conhecimento técnico, tirar essa chave. O risco é pequeno (é uma chave grátis; no pior
  caso alguém gasta o seu limite). Se preferir zero risco, simplesmente **não crie** esse Secret:
  o app funciona na mesma com a ESPN.
- **Nunca** envie para o GitHub o ficheiro `.jks` nem o `keystore-base64.txt`. Guarde-os num local
  seguro (pen USB, Google Drive pessoal). **Se perder a chave, não consegue atualizar o app por cima**:
  terá de desinstalar e instalar de novo.

---

## 3. Passo a passo: criar a chave de assinatura (faz-se uma só vez)

### Opção A — no Windows

1. Instale o Java (grátis): entre em <https://adoptium.net>, clique em **Download** e instale
   (pode clicar sempre "Next").
2. Crie uma pasta, por exemplo `C:\chave-app`.
3. Abra o menu Iniciar, escreva **PowerShell** e abra.
4. Copie e cole estas linhas, uma de cada vez, carregando Enter:

   ```powershell
   cd C:\chave-app
   keytool -genkeypair -v -keystore jogos.jks -alias jogos -keyalg RSA -keysize 2048 -validity 10000
   ```

5. Vai pedir uma **senha** (escreva duas vezes; as letras não aparecem enquanto escreve — é normal).
   **Anote essa senha.** Depois faz perguntas (nome, cidade…): pode responder o que quiser ou só
   carregar Enter. No fim, escreva `sim` (ou `yes`) e Enter.
6. Agora transforme a chave em texto (o GitHub só aceita texto nos Secrets):

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\chave-app\jogos.jks")) | Set-Content C:\chave-app\keystore-base64.txt
   ```

7. Na pasta `C:\chave-app` tem agora dois ficheiros: `jogos.jks` (a chave) e `keystore-base64.txt`
   (a mesma chave em texto). Guarde ambos em local seguro.

### Opção B — Mac ou Linux

```bash
keytool -genkeypair -v -keystore jogos.jks -alias jogos -keyalg RSA -keysize 2048 -validity 10000
base64 < jogos.jks | tr -d '\n' > keystore-base64.txt
```

(No Mac, se `keytool` não existir, instale o Java em <https://adoptium.net>.)

---

## 4. Passo a passo: cadastrar os Secrets no GitHub

1. Abra o repositório no GitHub (no computador).
2. Clique em **Settings** (Configurações) → no menu da esquerda **Secrets and variables** → **Actions**.
3. Clique em **New repository secret**. Crie, um de cada vez:

| Name (exatamente assim) | Secret (o que colar) |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | todo o conteúdo do ficheiro `keystore-base64.txt` (abra no Bloco de Notas, Ctrl+A, Ctrl+C) |
| `ANDROID_KEYSTORE_PASSWORD` | a senha que escolheu no passo 3.5 |
| `ANDROID_KEY_ALIAS` | `jogos` |
| `ANDROID_KEY_PASSWORD` | a mesma senha |
| `FOOTBALL_DATA_KEY` | *(opcional)* a chave do football-data.org — veja abaixo |

**Para obter a chave do football-data.org (opcional):** entre em
<https://www.football-data.org/client/register>, registe-se com o seu e-mail, e a chave
chega por e-mail. Cole-a no Secret `FOOTBALL_DATA_KEY`.

---

## 5. Gerar e baixar o APK

### O jeito mais fácil (link direto, serve no celular e no tablet)

Abra no navegador do aparelho:

**https://github.com/junyorangelo131313-lgtm/Jogos-ao-vivo/releases/latest/download/JogosAoVivo.apk**

O APK baixa logo, sem `.zip` e sem precisar de conta no GitHub. O link é sempre o mesmo e
aponta para a última versão compilada (a página com os detalhes fica em **Releases**, à direita
na página do repositório). Este link é público: se cadastrou o Secret `FOOTBALL_DATA_KEY`,
essa chave vai dentro do APK (ver o aviso no passo 2).

### Pelo separador Actions (alternativa)

1. No repositório, clique no separador **Actions**.
2. À esquerda, clique em **Gerar APK**.
3. Para gerar agora: botão **Run workflow** → escolha o ramo → **Run workflow**.
   (Também é gerado sozinho sempre que o código muda.)
4. Espere a bolinha ficar **verde ✅** (uns 5 minutos) e clique nessa execução.
5. Em baixo, na secção **Artifacts**, clique em **JogosAoVivo-APK-v…** para baixar.
   Vem um ficheiro `.zip`: abra-o e lá dentro está o `JogosAoVivo-v….apk`.
   - Se aparecer **JogosAoVivo-TESTE-sem-assinatura**, é porque os Secrets do passo 4 ainda não
     estão cadastrados. Esse APK funciona, mas **não** atualiza por cima da versão oficial.
   - Os ficheiros ficam disponíveis durante 90 dias. É preciso estar com sessão iniciada no GitHub.

### Instalar no telemóvel

1. Passe o `.apk` para o telemóvel (ou baixe direto pelo navegador do telemóvel, no site do GitHub).
2. Toque no ficheiro. Se o Android avisar, permita **"Instalar apps desconhecidas"** para o navegador
   ou gestor de ficheiros.
3. Para **atualizar**: baixe o APK mais recente e instale por cima. Não precisa desinstalar.

---

## 6. Para quem for mexer no código

```
www/                 o app (HTML, CSS e JavaScript simples)
  js/app.js          tela e regras de atualização
  js/sources/        ESPN (principal) e football-data.org (reserva)
  js/channels.js     leitura dos canais de TV
  js/leagues.js      lista de campeonatos (para adicionar/retirar)
android/             projeto Android gerado pelo Capacitor
.github/workflows/   gera o APK
tests/               testes (npm test)
```

Comandos: `npm ci`, `npm test`, `npx cap sync android`.
