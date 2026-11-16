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
| 01 · Antes de Partir | O que você considera um sucesso? | nuvem de palavras |
| 02 · Look Back | Olhando para 2026, o que fez você pensar: "isso foi um sucesso"? | nuvem + sorteio com 2 min de fala |
| 03 · Uso de IA | O que você fez (projeto, agente ou aprendizado) em 2026 com a ajuda da IA? | nuvem + sorteio com 3 min de fala (desafio → IA → impacto) |
| 04 · Look Ahead | O que precisaria ter acontecido para você dizer: "2027 foi um sucesso"? | nuvem + "Destino: 2027" (a pessoa pode enviar sem nome) |

- **Um login só.** A pessoa escolhe o nome uma vez, no check-in, e esse nome vale para tudo: nas
  dinâmicas do Sucesso ela responde direto no app, sem digitar o nome de novo. Quem cai e volta no
  meio do evento entra de novo pelo nome e cai no momento atual.
- **Painel do Doc**: cada dinâmica é um passo do roteiro. Ao chegar nela, a pergunta entra no telão
  e nos celulares; os botões do passo são iniciar/pausar/encerrar o recebimento, **✨ Revelar respostas
  no telão**, **🎲 Sortear viajante** e o **tempo de fala** (dinâmicas 2 e 3). Em "Mais opções": ver e
  **baixar as respostas** (.txt/Word), reabrir o recebimento e apagar as respostas.
- **Celulares**: pergunta + campo de resposta (200 caracteres) + prazo. Depois do envio, a pessoa vê a
  própria resposta. Quem é sorteado recebe o aviso "É você!" com a resposta e o tempo de fala.
- **Telão**: pergunta + contagem + prazo + o carro 3D carregando a cada resposta (sem QR: todo mundo
  já está no app). **Nenhuma resposta aparece enquanto elas chegam.** Ao encerrar, o carro entra no
  portal; a **nuvem de palavras só aparece quando o Doc clica em "Revelar respostas no telão"** (e
  some de novo se ele reabrir o recebimento). No sorteio: roleta de nomes, resposta, guia e
  cronômetro de fala. Os **textos das respostas só aparecem no telão aberto no navegador logado no
  Painel do Doc** (o topo do painel avisa se o telão está aberto e logado).
- **Painel 3D** (`/painel`): o painel original do Lucas continua disponível, com a mesma senha, do
  jeito que ele fez (com o QR dele e a nuvem ao vivo). O QR abre o formulário original
  (`/participar/<sala>`), que também usa o nome do check-in.

**Mesmo visual nos dois:** o motor 3D do painel do Lucas virou `public/delorean3d.js` e a nuvem de
palavras virou `public/nuvem.js`; o carro realista está em `public/delorean-model.js` (Three.js).

O código do Lucas está em [`sucesso/`](sucesso/) (API, banco, páginas e testes originais, sem
alterações); a ponte com este servidor está em `server/sucesso.js`. As respostas ficam em
`data/sucesso.db` (SQLite).

## 💭 Reflexão · Ato 1: O Combustível do Futuro

O bloco **Reflexão** veio do protótipo `Prototipo_Ato1_SORTEIO_2_PROJETOS_RESPONSAVEIS.html` e virou
um passo do roteiro. São **6 paradas**, cada uma com uma pergunta:

| Parada | Pergunta |
|---|---|
| 01 · O Capacitor de Fluxo | Que ideias testamos e o que aprendemos? |
| 02 · Mudamos a Linha do Tempo | O que passou a funcionar de outro jeito? |
| 03 · Dobra no Tempo | Onde devolvemos tempo às pessoas? |
| 04 · Conexões | Que fronteiras aproximamos? |
| 05 · Reação em Cadeia | O que começou pequeno e ganhou escala? |
| 06 · Doc & Marty | Quem ajudou cada conquista a acontecer? |

Em cada parada:

1. **Abrir a parada**: a pergunta entra no telão e nos celulares.
2. **Iniciar votação (1:30)**: cada pessoa escolhe **1 projeto** da lista (36 projetos, com busca por
   projeto ou responsável). O voto usa o nome do check-in e vale um por parada.
3. A cada voto o **Flux Capacitor 3D** do telão carrega (15 votos = 100% da parada) e aparece
   "Fulano votou ⚡" (só o nome, não o projeto escolhido).
4. **Encerrar votação** (ou o tempo acaba sozinho) e **🏆 Revelar os 2 mais votados**. O telão faz o
   suspense ("E os mais votados são…", com a roleta de nomes): primeiro aparece o 2º mais votado e,
   por último, o 1º, cada um com o **responsável**. Os celulares só mostram os nomes depois do telão.
   - **Nunca saem dois projetos do mesmo responsável**: se o 2º mais votado for de quem já está no 1º
     lugar, ele dá lugar ao seguinte. Projetos com vários responsáveis (`Fulano / Beltrano`) contam
     para cada um deles. Empate: fica na frente quem chegou primeiro àquela quantidade de votos.
   - **A quantidade de votos não aparece** no telão nem nos celulares (só no painel do Doc). Se quiser
     mostrar, o botão "Mostrar nº de votos no telão" liga isso na hora.
5. **Próxima parada ▶**. O menu das paradas mostra os votos de cada uma e a energia total.

No painel, em "Mais opções": **votos de teste** (para ensaiar sem os celulares; saem marcados como
"teste"), ver os votos, **exportar .csv**, reiniciar a votação e limpar. "Ver a contagem de todos os
projetos" mostra quem ficou em 1º e 2º e quem foi pulado por ter o mesmo responsável. Sair da
Reflexão no meio de uma votação a deixa pausada.

Em **Preparar → Reflexão** dá para mudar o título, o tempo de votação, as paradas e a lista de
projetos (um por linha: `projeto | responsável`). O código está em `server/reflexao.js` (regras e
dados) e `public/flux.js` (o Flux Capacitor 3D do protótipo).

## 📊 Dados do evento (extração)

A página **`/dados.html`** (mesma senha do Painel do Doc; há um atalho em Preparar e no passo de
Encerramento) reúne o que o evento gerou, em três abas, cada tabela com download em **.csv** (abre
direto no Excel):

| Aba | O que mostra | Arquivos |
|---|---|---|
| ⚡ Conexões | as duplas de cada viagem com as **perguntas que cada dupla teve**; o **ranking de cada pessoa** (posição que deu e que recebeu em cada conversa, pontos somados); o **match de cada pessoa** (conexão sugerida, pontos, se foi mútua) | `Conexoes_Duplas_e_Perguntas.csv`, `Conexoes_Ranking.csv`, `Conexoes_Matches.csv` |
| 💭 Reflexão | por parada: contagem de votos de cada projeto, quem ficou em 1º e 2º (e quem foi pulado por ter o mesmo responsável) e quem votou em quê | `Reflexao_Resultado.csv`, `Reflexao_Votos.csv` |
| 🚀 Sucesso | as **respostas de cada pergunta** (nome, resposta, hora) | `Sucesso_Respostas.csv` (todas) ou uma pergunta por vez |

No plano gratuito do Render os dados somem quando o servidor reinicia: **baixe os arquivos logo
depois do evento**.

## ⏱ Bipes dos cronômetros e 🎬 transições

- **Bipes.** Em todos os cronômetros (encontro, conversa e avaliação das Conexões; recebimento e tempo
  de fala do Sucesso; votação da Reflexão) toca um "pi" quando faltam **30 segundos** e um **a cada
  segundo nos últimos 10** (mais agudo nos 3 finais), além do sinal de tempo esgotado. O som sai do
  telão (ou do painel, se o som estiver nele) e segue o volume do painel. O botão **⏱ Bipes** no topo
  do painel liga e desliga; eles tocam mesmo com "Sem áudio". É preciso um clique na tela do telão
  para o navegador liberar o som (o painel avisa quando falta).
- **Transições.** Ao trocar de bloco, o telão mostra por alguns segundos uma "viagem no tempo": os
  circuitos de tempo (LAST TIME DEPARTED = de onde saímos, DESTINATION TIME = para onde vamos), uma
  fala do filme e um mostrador que muda conforme o destino (88 MPH com rastros de fogo para Conexões
  e Sucesso, 1,21 gigawatts para a Reflexão, o relógio da torre às 10:04 para os blocos de fala,
  "CONTINUA…" no encerramento), terminando no raio. Nos celulares, o velocímetro sobe até 88 MPH com
  o destino escrito. Dá para desligar em Preparar → Ajustes.

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
| `/dados.html` | apresentador | Extração de dados: Conexões, Reflexão e Sucesso em tabelas, com download em .csv |
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
| Reflexão | escolher 1 projeto por parada | menu das paradas, Flux Capacitor, os 2 mais votados (com suspense) | **Abrir parada**, **Iniciar / Encerrar votação**, **Revelar os 2 mais votados**, **Próxima parada** |
| Sucesso 01–04 | pergunta e resposta, com o nome do check-in | carro carregando; nuvem só ao revelar; sorteio | **Iniciar / Encerrar recebimento**, **Revelar respostas**, **Sortear**, tempo de fala |
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
server/reflexao.js   bloco Reflexão: paradas, projetos, votos, cronômetro e os 2 mais votados
public/dados.*       página de extração de dados (Conexões, Reflexão, Sucesso) com download em .csv
public/              app do viajante (index.html, app.*), telão (telao.*), Painel do Doc (admin.*)
public/delorean3d.js motor 3D (céu, estrada, raios, portal) extraído do painel do Sucesso
public/delorean-model.js  DeLorean realista (Three.js) · public/nuvem.js  nuvem de palavras
public/flux.js       Flux Capacitor 3D do bloco Reflexão (motor do protótipo, sem bibliotecas)
public/trilha.js     música e trilha de fundo geradas no navegador (Web Audio)
sucesso/             projeto do Lucas: server/api.js, drizzle/, public/ (painel, participar), tests/
scripts/             testes
```
