# ⚡ De Volta ao Futuro · app do townhall

App em tempo real para o townhall: check-in dos participantes (cada pessoa só escolhe o próprio nome na lista),
blocos controlados pelo apresentador e o bloco **Conexões**: três "viagens no tempo" em duplas de áreas e
WLs diferentes, com perguntas sincronizadas nos dois celulares, timer de 4 minutos, avaliação por ranking e
cálculo automático de quem cada pessoa deve procurar depois.

- **App do viajante** (celular): `http://SEU-SERVIDOR/`
- **Painel do Doc** (apresentador/admin): `http://SEU-SERVIDOR/admin.html` · senha padrão `doc1985`
  (troque definindo a variável de ambiente `ADMIN_PASSWORD`).

## 🚀 De Volta para o Sucesso (parte 2 do townhall)

As quatro dinâmicas ao vivo do projeto do Lucas
([`LucasBarbosaMelo/de-volta-para-o-sucesso-townhall`](https://github.com/LucasBarbosaMelo/de-volta-para-o-sucesso-townhall))
rodam **dentro deste mesmo app**, no mesmo servidor e com a mesma senha:

| Dinâmica | Pergunta | Depois de encerrar |
|---|---|---|
| 01 · Antes de Partir | O que você considera um sucesso? | nuvem de palavras ao vivo |
| 02 · Look Back | Olhando para 2026, o que fez você pensar: "isso foi um sucesso"? | nuvem + sorteio com 2 min de fala |
| 03 · Uso de IA | O que você fez (projeto, agente ou aprendizado) em 2026 com a ajuda da IA? | nuvem + sorteio com 3 min de fala (desafio → IA → impacto) |
| 04 · Look Ahead | O que precisaria ter acontecido para você dizer: "2027 foi um sucesso"? | nuvem + "Destino: 2027" (a pessoa pode enviar sem nome) |

- **Um login só.** A pessoa escolhe o nome uma vez, no check-in, e esse nome vale para tudo: nas
  dinâmicas do Sucesso ela responde direto no app, sem digitar o nome de novo. Quem cai e volta no
  meio do evento entra de novo pelo nome e cai no momento atual.
- **Painel do Doc**: cada dinâmica é um passo do roteiro. Ao chegar nela, a pergunta entra no telão
  e nos celulares; os botões do passo são iniciar/pausar/encerrar o recebimento, **🎲 Sortear viajante**
  e o **tempo de fala** (dinâmicas 2 e 3). Em "Mais opções": ver e **baixar as respostas** (.txt/Word),
  reabrir o recebimento e apagar as respostas.
- **Celulares**: pergunta + campo de resposta (200 caracteres) + prazo. Depois do envio, a pessoa vê a
  própria resposta. Quem é sorteado recebe o aviso "É você!" com a resposta e o tempo de fala.
- **Telão**: pergunta + QR do app + contagem + prazo + o carro 3D carregando a cada resposta; ao
  encerrar, o carro entra no portal e aparece a **nuvem de palavras**; no sorteio, roleta de nomes,
  resposta, guia e cronômetro de fala. Os **textos das respostas só aparecem no telão aberto no
  navegador logado no Painel do Doc** (o topo do painel avisa se o telão está aberto e logado).
- **Painel 3D** (`/painel`): o painel original do Lucas continua disponível, com a mesma senha. O QR
  dele abre o formulário original (`/participar/<sala>`), que também usa o nome do check-in.

**Mesmo visual nos dois:** o motor 3D do painel do Lucas virou `public/delorean3d.js` e a nuvem de
palavras virou `public/nuvem.js`; o carro realista está em `public/delorean-model.js` (Three.js).

O código do Lucas está em [`sucesso/`](sucesso/) (API, banco, páginas e testes originais, sem
alterações); a ponte com este servidor está em `server/sucesso.js`. As respostas ficam em
`data/sucesso.db` (SQLite).

## 🎤 Blocos do evento, telão calmo e som

- **Blocos de fala** (passos do roteiro): cada um tem **nome, tema e quem fala**, editáveis a qualquer
  momento. Quando o bloco entra no ar, os celulares mostram o nome e o tema dele e o telão entra no
  **modo calmo**: fundo parado e escurecido, sem raios, sem carro passando, só o tema.
- **Som** (três botões no topo do Painel do Doc, sempre à mão): **🎵 Música** (animada),
  **🎼 Trilha sonora** (fundo calmo) e **🔇 Sem áudio**, mais o volume. A música é original, gerada
  no navegador (`public/trilha.js`, Web Audio), sem arquivos. Exibir um bloco de fala desliga o som
  (dá para mudar em Config).
  - O som sai do **computador do telão**; na primeira vez é preciso **clicar uma vez na tela do
    telão** (os navegadores só liberam áudio depois de um gesto). O painel avisa se falta esse clique.
    Em "SOM · telão ⇄" dá para trocar para o som sair do computador do painel.
  - Em Config dá para informar o endereço de um **arquivo de áudio próprio** para cada botão.

## Como rodar

Requisitos: Node.js 22.13 ou mais novo (usa o SQLite embutido do Node, sem dependências nativas).

```bash
npm install
npm start
```

Abre em `http://localhost:3000`. O banco de dados SQLite fica em `data/townhall.db` (mude com `DATA_DIR` ou `DB_PATH`).

Variáveis de ambiente:

| Variável         | Padrão     | Para quê                                  |
|------------------|------------|-------------------------------------------|
| `PORT`           | `3000`     | porta HTTP                                |
| `ADMIN_PASSWORD` | `doc1985`  | senha do Painel do Doc                    |
| `DATA_DIR`       | `./data`   | pasta do banco SQLite                     |

Testes (algoritmo de duplas + fluxo completo do evento + integração com o Sucesso + testes originais do Lucas):

```bash
npm test
```

### Colocar no ar (Render, grátis)

1. Crie uma conta em https://render.com (pode entrar com o GitHub).
2. No painel: **New → Web Service → Public Git Repository** e cole
   `https://github.com/nick-kuh/app-back-to-future-townhall`.
3. Escolha a branch (`claude/nice-ptolemy-l4hnfq` ou `main`), Runtime **Docker**, plano **Free**,
   região **Virginia** e adicione a variável de ambiente `ADMIN_PASSWORD` com a senha do painel.
4. **Create Web Service**. Em 2 a 3 minutos o app fica em `https://NOME.onrender.com`
   (app dos viajantes na raiz, painel em `/admin.html`). Cada novo push na branch republica sozinho.

Se o arquivo `render.yaml` estiver na branch padrão do repositório, o botão abaixo faz tudo isso em um clique:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/nick-kuh/app-back-to-future-townhall)

Para o dia do evento: no plano Free o serviço hiberna após 15 min sem acesso (o primeiro acesso demora
~1 min) e o banco zera quando ele reinicia (todo mundo refaz o check-in). Suba para o plano **Starter**
e, opcionalmente, adicione um **disco** de 1 GB montado em `/app/data` para o banco persistir.

Outras opções: qualquer host com Node 22+ ou Docker (Railway, Fly.io, Cloud Run, VPS) usando o `Dockerfile`;
ou um notebook na própria sala (`npm start` + `http://IP-DO-NOTEBOOK:3000`, se o Wi-Fi permitir acesso
entre dispositivos). O servidor usa WebSocket (Socket.IO) para avisar os celulares em tempo real.

## Páginas

| Página | Para quem | O que mostra |
|---|---|---|
| `/` | viajantes (celular) | check-in pelo nome, blocos, viagens, avaliação, resultado |
| `/telao.html` | projetor | QR do check-in, circuitos de tempo, cronômetros gigantes, 88 MPH, avaliação, conexões, créditos; modos "relógio", "logo" e "frases" para servir de fundo durante PPT ou fala |
| `/admin.html` | apresentador (notebook) | Painel do Doc: roteiro do evento (Ao vivo) e preparação |
| `/painel` | apresentador | painel 3D do De Volta para o Sucesso (mesma senha) |
| `/participar/<sala>` | participantes | formulário de resposta das dinâmicas (sem login) |
| `/ao-vivo` | todos | página de entrada do De Volta para o Sucesso |

Os viajantes nunca veem área, WL ou time uns dos outros: esses dados ficam só no painel, para o sorteio.

## Painel do Doc: como conduzir o evento

O painel tem duas áreas.

**▶ Ao vivo** (é onde você fica durante o evento)

- À esquerda, o **roteiro**: os passos do evento em ordem (check-in, blocos de fala, Conexões, as
  dinâmicas do Sucesso, encerramento). O passo que está no ar fica em destaque.
- À direita, **só o passo atual**: o que os celulares e o telão estão mostrando, os números do momento
  e **um botão principal por vez** (iniciar viagens, iniciar/encerrar recebimento, sortear viajante…).
  Quando o passo não pede mais nada, o botão principal vira **Próximo ▶**.
- Dá para clicar em qualquer passo do roteiro para pular ou voltar; o que é raro fica em "Mais opções".
- **Fora do roteiro**: "Aviso rápido" (intervalo, recado, link) e "Olhos no telão" entram na hora e
  depois é só voltar ao roteiro.
- O topo mostra o que está **no ar**, quantas pessoas embarcaram, se o **telão** está aberto e logado
  e os três botões de **som**.

O que cada passo faz:

| Passo | Celulares | Telão | Você faz |
|---|---|---|---|
| Check-in | cada pessoa digita o nome e embarca | QR do app + carro carregando | acompanha quem falta |
| Bloco de fala | nome e tema do bloco | modo calmo, só o tema | nada (som desliga sozinho) |
| Conexões | dupla, perguntas, avaliação e resultado | cronômetros e "88 MPH" | **Iniciar viagens**; o resto anda sozinho |
| Sucesso 01–04 | pergunta e resposta, com o nome do check-in | carro, nuvem de palavras, sorteio | **Iniciar / Encerrar recebimento**, **Sortear**, tempo de fala |
| Aviso / intervalo | o aviso | o aviso | nada |
| Encerramento | agradecimento e a conexão de cada um | créditos com todos os nomes | baixar as respostas |

Sair do passo Conexões no meio das viagens deixa a viagem em pausa; ao voltar, ela continua de onde
parou. A sala das dinâmicas do Sucesso é criada sozinha.

**⚙ Preparar** (antes do evento)

1. **Roteiro** · a ordem dos passos: reordenar, remover, adicionar blocos de fala e avisos, escrever o
   tema e quem fala em cada bloco. Pode mudar durante o evento.
2. **Pessoas** · a lista do townhall já vem carregada (47 pessoas). Dá para editar WL/área, adicionar,
   marcar ausente, fazer check-in manual, importar outra lista (colar do Excel) e **importar as respostas
   do forms** (CSV/planilha): as respostas aparecem na tela da dupla como "para puxar assunto".
3. **Perguntas** · banco inicial com 42 perguntas em três eras (presente · 1985, passado · 1955,
   futuro · 2015). Edite, desative ou substitua em massa (uma por linha, com prefixo `[presente]`,
   `[passado]` ou `[futuro]`; `[off]` marca uma desativada).
4. **Ajustes** · tempos das viagens, fluxo automático ou manual, textos, som (onde toca, arquivos
   próprios) e acesso.
5. **Testes** · check-in de todos, modo demo com tempos curtos, avaliações aleatórias e **resetar o
   evento** (volta o roteiro ao começo e apaga check-ins, duplas e respostas: use depois do ensaio).

No check-in, a pessoa digita o próprio nome e a lista aparece já filtrada (ela fica oculta até começar a
digitar). Quem já embarcou e voltou (celular novo, navegador limpo) acha o nome marcado como "já
embarcou" e entra de novo no lugar dele. Quem chegar depois do sorteio das duplas aparece como "sem
dupla" no passo Conexões, com um botão para incluir a pessoa nas próximas viagens.

## Regras da dinâmica

- **Duplas**: área diferente **e** WL diferente (ex.: Estag ↔ WL2/WL3, WL1 ↔ WL3/Estag), nunca a mesma dupla
  em duas viagens. Número ímpar de pessoas forma um trio. Só se for impossível, o app relaxa a regra
  (primeiro libera WL, depois área) e avisa no painel. Com a lista atual (47 pessoas) as três rodadas saem
  sem relaxar nada.
- **Perguntas**: cada viagem prioriza a era correspondente; ninguém recebe uma pergunta que já viu e cada
  dupla começa em um ponto diferente da lista (duplas vizinhas não discutem a mesma pergunta ao mesmo tempo).
- **Ranking → conexão**: 1º lugar vale 3 pontos, 2º vale 2, 3º vale 1. Para cada par que conversou, soma-se
  o que cada lado deu ao outro. A conexão sugerida é o par com maior soma (desempate: quem te colocou mais
  alto). Se os dois se escolheram, aparece "conexão mútua".

## Estrutura

```
server/index.js      servidor HTTP + Socket.IO + API do admin
server/engine.js     estado do evento: blocos, fases, timer, duplas, filas, ranking, resultados
server/matching.js   algoritmo de pareamento (área ≠, WL ≠, sem repetição, trio se ímpar)
server/queues.js     filas de perguntas por dupla (eras, sem repetir, rotação)
server/results.js    ranking → conexões
server/db.js         SQLite (node:sqlite) e esquema
server/seed/         lista de pessoas e banco de perguntas iniciais
server/sucesso.js    ponte com o De Volta para o Sucesso (API do Lucas sem alterações, login do Doc)
public/              app do viajante (index.html, app.*), telão (telao.*), Painel do Doc (admin.*)
public/delorean3d.js motor 3D (céu, estrada, raios, portal) extraído do painel do Sucesso
public/delorean-model.js  DeLorean realista (Three.js) · public/nuvem.js  nuvem de palavras
public/trilha.js     música e trilha de fundo geradas no navegador (Web Audio)
sucesso/             projeto do Lucas: server/api.js, drizzle/, public/ (painel, participar), tests/
scripts/             testes
```
