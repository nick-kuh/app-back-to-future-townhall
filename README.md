# ⚡ De Volta ao Futuro · app do townhall

App em tempo real para o townhall **CDIO HC + BPC · Townhall 2026**: check-in dos participantes (cada pessoa só
escolhe o próprio nome na lista), o **roteiro do evento em 4 atos** controlado pelo apresentador (as cenas do deck
no telão, em português) e os blocos interativos. O bloco **Conexões** são três "viagens no tempo" em duplas de
áreas e WLs diferentes, com perguntas sorteadas e sincronizadas nos dois celulares, timer de 2 minutos, avaliação
por ranking e cálculo automático de quem cada pessoa deve procurar depois.

- **App do viajante** (celular): `http://SEU-SERVIDOR/`
- **Painel do Doc** (apresentador/admin): `http://SEU-SERVIDOR/admin.html` · senha padrão `doc1985`
  (troque definindo a variável de ambiente `ADMIN_PASSWORD`).

## 🎬 Roteiro em 4 atos e as cenas do deck

O roteiro padrão segue a agenda do deck `CDIO_HC_BPC_Townhall_2026_BTTF_v18` (14:00 às 17:00, 180 minutos).
Todo o conteúdo do deck está no app, **em português** e com o visual do app; **Conexões, Reflexão e Sucesso
continuam como eram**.

| Ato | Passo do roteiro | O que é |
|---|---|---|
| I · Reconectar | 🚪 Chegada · Check-in | QR do app, o carro carregando e os circuitos de tempo do evento (destino DEZ 11 2027) |
| | 🗺️ Plano de voo | a agenda do dia em 4 atos, com horários; marca o item que está NO AR (no celular também) |
| | 👋 Boas-vindas e jornada | "Fechar 2026 com orgulho. Sair com um destino claro para 2027." e quem fala |
| | ⚡ Conexões | bloco interativo (sem mudanças de tela, só os ajustes abaixo) |
| II · Rebobinar 2026 | 📅 Jornada 2026 | o **almanaque**: 12 meses, 51 itens, 41 entregas, €51,3M; "tocar o ano" e o ano em uma página |
| | 🦋 Como a IA nos ajudou em 2026 | abertura da Frente 2, com o QR do app |
| | 💭 Reflexão | bloco interativo (sem mudanças) |
| III · Reconhecer | 🏆 Reconhecimento 2026 | abertura → tributo (vídeo) → **Prêmios Torre do Relógio** → cerimônia de cada prêmio → Hall da Fama |
| | ☕ Intervalo | cronômetro de 15 min no telão e nos celulares; a música entra |
| IV · Avançar para 2027 | 🔭 Visão 2027 · Estratégia | a **Estratégia CDIO LATAM 2027** no telão, interativa (arquivo original, sem alterações) |
| | 📜 Manifesto 2027 | "Nós conhecemos o destino de 2027. O que fez dele um sucesso?" e o QR do app |
| | 🚀 Sucesso 01 a 04 · 🧪 o Doc | bloco interativo (sem mudanças) |
| | 🏎️ 88 MPH · Encerramento | o velocímetro vai a 88 (telão e celulares) e "Bem-vindos a 2027" |
| | 🏁 Créditos | as frases finais do deck, os créditos e o elenco (todos os nomes do check-in) |

Como conduzir cada cena (no **Ao vivo**, um botão principal por vez):

- **Jornada 2026:** `▶ Tocar o ano` avança um mês a cada 3 s e, em dezembro, abre o ano em uma página. Dá para clicar
  direto em um mês, ir mês a mês e esconder/mostrar BUs e tipos (Mais opções).
- **Reconhecimento 2026:** `▶ Tributo` → `Abrir os Prêmios` → para cada prêmio: `Conhecer os indicados` →
  `⚡ Carregar o Flux Capacitor` → o raio cai e o vencedor aparece. Na carga, **cada toque no botão ⚡ CARREGAR dos
  celulares soma energia no telão** (em média, 6 toques por pessoa enchem; o painel tem `+15%` e `Raio agora`).
  Os vencedores são definidos antes (Preparar → Agenda e cenas); o "sorteio" é o suspense. Os aparelhos só recebem
  o nome do vencedor quando o sorteio daquele prêmio começa.
  - Os indicados do deck são **nomes de exemplo**: o telão mostra o aviso "NOMES DE EXEMPLO" até eles serem editados.
  - Vídeo-tributo: cole o endereço em Agenda e cenas → Reconhecimento, ou arraste o arquivo para a tela do telão.
- **Intervalo:** `▶ Iniciar intervalo`, pausar, ±1 min. O cronômetro segue contando se outro passo for mostrado.
- **Visão 2027 · Estratégia:** a página é clicada **direto na tela do telão** (filtros, pilares). Por padrão ela abre
  no mapa da estratégia, como no deck; há uma opção para começar pela abertura em vídeo da própria página.
- **88 MPH:** `🏎️ Acelerar até 2027`.

**Preparar → Agenda e cenas** edita todo o conteúdo sem mexer em código: horários e itens da agenda, textos, itens
do almanaque (`mês | tipo | BU | benefício | texto`), prêmios (indicados, vencedor, citação), créditos.
`*Asteriscos*` marcam palavras em destaque. Cada seção tem "Restaurar o conteúdo original".

Onde o deck dizia uma coisa no slide e outra na agenda, vale a **agenda** (ela é a versão atualizada): intervalo de
15 min (o slide dizia 10), Manifesto de 15 min (o slide dizia 10) e o Intervalo dentro do Ato III. As notas para quem
apresenta ("use apenas destaques selecionados…", "a confirmar") aparecem só no painel, não no telão.

O código está em `server/cenas.js` (conteúdo, estado e comandos), `public/cenas.js` e `public/cenas.css` (telão).
A estratégia é `public/estrategia-2027.html`, cópia byte a byte do arquivo enviado (o teste confere o SHA-256).

## ⚡ Conexões: tempos e perguntas

- **2 minutos** de conversa em cada viagem e **40 segundos** para a dupla se encontrar (Preparar → Ajustes muda).
- Banco de perguntas do **Speed Dating** (PDF da organização): 30 perguntas em três categorias,
  🟢 **Quebra-gelo**, 🟡 **Conexão** e 🔵 **Além do óbvio** (10 em cada).
- As perguntas são **sorteadas**: cada dupla recebe a sua própria ordem, ninguém vê a mesma pergunta duas vezes e as
  duplas começam espalhadas por perguntas diferentes. Dois modos (Preparar → Perguntas):
  - **Uma categoria por viagem** (padrão): viagem 1 sorteia do Quebra-gelo, viagem 2 da Conexão e viagem 3 do Além do
    óbvio; se a dupla passar por todas, entram as das outras categorias.
  - **As três categorias misturadas**: em toda viagem, uma pergunta de cada categoria, em ordem sorteada.
- No celular aparece **só a pergunta** (com o nome da categoria): não há "pergunta 2 de 10" nem quantas faltam.

## 📷 Fotos de perfil

Cada pessoa pode ter uma foto, que aparece no lugar das iniciais: na lista e na confirmação do check-in, na polaroid
de boas-vindas, **na polaroid da dupla das Conexões** (ajuda a achar a pessoa na sala), na avaliação e no resultado;
no telão, em quem fala nas boas-vindas, nos indicados, no vencedor e no Hall da Fama dos prêmios; e no Painel do Doc.
Quem não tem foto continua com as iniciais.

- **Preparar → Pessoas → 📷 Importar fotos**: escolha todas as fotos de uma vez. O **nome de cada arquivo** diz de quem
  é a foto, e não precisa ser o nome exato: valem nome completo, só uma parte, apelido e pequenos erros de digitação
  (`claudia guid.jpg`, `will.jpg`, `monse.jpg`, `caio souza.jpg` para Caio Sousa). O painel mostra o que casou, o que
  ficou sem dono e quem segue sem foto. Um arquivo que serve para duas pessoas (só `felipe.jpg` com dois Felipes) fica
  sem dono, para não errar.
- Na linha de cada pessoa: **📷 foto / trocar foto** e **sem foto**.
- JPG, PNG ou WebP, até 400 KB (o painel reduz as grandes para 320 px). As fotos ficam no banco, junto com os check-ins.
- Nas cenas, a foto vem do nome escrito no conteúdo (ex.: o indicado "Caio Souza"). Em duplas ("Giovana & Lucas")
  aparecem as duas. Nomes que servem para mais de uma pessoa (só "Vinicius") ficam com as iniciais: escreva o sobrenome.
- **As fotos acompanham o app, criptografadas.** O arquivo `server/seed/fotos.enc` é um pacote com as fotos de perfil
  (AES-256-GCM). Ele só abre no servidor que tiver a chave na variável de ambiente **`FOTOS_KEY`** (já configurada no
  serviço do Render). Sempre que o banco começa sem fotos, o que no plano gratuito do Render acontece a cada reinício,
  o app abre o pacote e associa cada foto à pessoa certa. O repositório é **público**: nele ficam só dados cifrados,
  sem rostos nem nomes.
  - Sem a chave (ou com a chave errada) o app funciona normalmente, com as iniciais, e o painel avisa em Preparar → Pessoas.
  - Para rodar no seu computador com as fotos: copie o valor de `FOTOS_KEY` do Render (Environment) e rode
    `FOTOS_KEY="…" npm start`.
  - Para trocar as fotos do pacote: `FOTOS_KEY="…" node scripts/fotos-pack.js <pasta com as fotos>` e envie o novo
    `server/seed/fotos.enc`. Quem for adicionado à lista depois ganha a foto se ela já estiver no pacote.
  - A pasta `server/seed/fotos/` (fotos soltas, sem criptografia) também é lida, mas está no `.gitignore`: fotos soltas
    enviadas para um repositório público ficam visíveis para qualquer pessoa.
- Quem abre o app pelo link vê os nomes e as fotos na tela de check-in (como já acontecia com os nomes).

O código está em `server/fotos.js`; as fotos são servidas em `/api/photo/<id>`.

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

## 🧪 Visão 2027 · o Doc (encerramento do Sucesso)

Depois da dinâmica 04, o passo **Visão 2027 · o Doc** fecha o Sucesso: o Doc (um cientista desenhado só
para este app) chega de 2027, lê tudo o que foi escrito nas quatro dinâmicas e conta o que "viu" no futuro.

1. **Gerar a mensagem** (no Painel do Doc, no passo Visão 2027; dá para gerar antes de colocar no ar).
   - Com a variável **`ANTHROPIC_API_KEY`** no Render, quem escreve o texto é a IA (Claude). Ela recebe
     **só os textos das respostas, sem os nomes**, e devolve: título, abertura, uma fala por dinâmica,
     3 ou 4 manchetes do jornal de 2027 e o encerramento.
   - Sem a chave (ou se a IA falhar), o app monta o texto com as **palavras mais citadas** em cada dinâmica.
   - **✎ Editar o texto**: você revisa e ajusta tudo antes de ir para o telão.
2. **🎬 Começar a cena no telão**, em partes:
   - **Chegada**: os circuitos de tempo marcam 2027, o carro carrega até 1,21 GW, três raios, e o Doc aparece.
   - **Abertura**, depois **uma parte por dinâmica** (com as palavras mais citadas em destaque), o
     **jornal de 2027** (Gazeta do Futuro, girando como nos filmes) e o **encerramento** com o "2027" em letras do logo.
   - O telão **lê o texto em voz alta** (voz em português do navegador do telão, de preferência masculina;
     no Windows, o Microsoft Edge tem as vozes mais naturais, como a "Antonio"). As palavras acendem
     enquanto ele fala, a boca e os braços do Doc mexem, e a música abaixa durante a fala.
   - No painel: pausar/retomar, próxima parte, parte anterior, recomeçar, ou clicar numa parte para ir direto.
3. **📱 Enviar a mensagem para os celulares**: cada pessoa recebe a mensagem completa para ler e guardar.
   Enquanto a cena roda, os celulares mostram "olhe para o telão".
4. **⬇ Baixar o .txt**: a mensagem do Doc, as palavras mais citadas e todas as respostas das quatro dinâmicas (com os nomes).

Em "Mais opções" do passo: ligar/desligar a voz, escolher a voz pelo nome, a velocidade da fala e
**🔈 Testar a voz no telão**. O navegador só libera som e voz depois de um clique na tela do telão.

### 🎬 Vídeo do Doc feito com IA (opcional)

Para quem quiser um curta "de cinema" do Doc, gerado no próprio computador com o método do tutorial
*"Não gaste dinheiro com IA: fiz um filme 100% grátis no PC"* (vídeo local + ComfyUI + agente de IA):

- **🎬 Baixar o kit do vídeo do Doc (.txt)** (Mais opções do passo): passo a passo do tutorial, prompts das
  imagens de referência (ficha do Doc igual ao personagem do telão, carro, estrada e o jornal de 2027, na
  paleta do app), o curta de ~1 minuto em segmentos de 6 a 8 s com as falas tiradas da mensagem do Doc, e o
  **briefing** para colar no agente de IA com a skill do tutorial.
- Precisa de placa de vídeo com **12 GB de VRAM ou mais** e cada segmento leva minutos: faça antes do evento
  (chegada genérica) ou, com as respostas do dia, só se houver pelo menos 1 hora até o encerramento.
- Pronto o vídeo, cole o endereço em **Vídeo do Doc**. Ele toca na chegada. Se o vídeo já traz a fala
  completa, marque **"O vídeo já traz a fala completa do Doc"**: depois dele o telão vai direto para o jornal
  de 2027 e o "2027" final, sem repetir a fala. Sem vídeo, a cena ao vivo (Doc animado + voz) faz tudo.

O código está em `server/doc.js` (palavras, IA, roteiro automático e .txt), `public/doc-cena.js` e
`public/doc-cena.css` (a cena e o personagem no telão).

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

A página **`/dados.html`** (mesma senha do Painel do Doc; botão **📊 Dados** no topo do painel)
reúne o que o evento gerou, um bloco por aba. Cada bloco baixa em **um arquivo Excel (.xlsx)** com uma
aba por tabela, e cada tabela também em .csv. O botão "Tudo em Excel" junta os três blocos.

| Aba | O que mostra | Arquivo Excel (abas) |
|---|---|---|
| ⚡ Conexões | as **duplas** de cada viagem, as **perguntas que cada dupla pegou**, o **ranking de cada pessoa** (posição que deu e que recebeu em cada conversa, pontos) e os **matches** (conexão sugerida, pontos, se foi mútua) | `Conexoes.xlsx`: Duplas · Perguntas por dupla · Ranking de cada pessoa · Matches |
| 💭 Reflexão | **o que cada pessoa escolheu** (uma linha por pessoa, uma coluna por parada), a contagem por projeto e os 2 mais votados de cada parada | `Reflexao.xlsx`: Escolhas por pessoa · Votos · Mais votados por parada |
| 🚀 Sucesso | **todas as respostas de todas as perguntas** em uma tabela só (pergunta, nome, resposta, hora) | `Sucesso.xlsx`: Respostas |

No plano gratuito do Render os dados somem quando o servidor reinicia: **baixe os arquivos logo
depois do evento**.

## 🚫 Quem não participa de um bloco (coordenação)

O login serve para marcar presença e para o app saber o nome de cada pessoa. Quem **coordena** um
bloco faz o login como todo mundo, mas pode ficar **de fora daquele bloco**:

- **Conexões:** não entra no sorteio das duplas (ninguém fica sem par por causa dela).
- **Reflexão:** não vota nos projetos.
- **Sucesso** (as 4 dinâmicas): não envia respostas.

No celular dessa pessoa aparece "Você está na coordenação". A lista é por bloco e fica no botão
**🚫 Fora deste bloco**, em Preparar → Roteiro (na linha de Conexões, Reflexão e Sucesso) e também
dentro de cada um desses passos no "Ao vivo". Nas Conexões, defina a lista **antes** de iniciar as
viagens (depois do sorteio, é preciso sortear de novo).

## ⏱ Bipes dos cronômetros e 🎬 transições

- **Bipes.** Em todos os cronômetros (encontro, conversa e avaliação das Conexões; recebimento e tempo
  de fala do Sucesso; votação da Reflexão) toca um "pi" quando faltam **30 segundos** e um **a cada
  segundo nos últimos 10** (mais agudo nos 3 finais), além do sinal de tempo esgotado. O som sai do
  telão (ou do painel, se o som estiver nele) e segue o volume do painel. O botão **⏱ Bipes** no topo
  do painel liga e desliga; eles tocam mesmo com "Sem áudio". É preciso um clique na tela do telão
  para o navegador liberar o som (o painel avisa quando falta).
- **Transições.** Ao trocar de bloco, o telão faz uma "viagem no tempo" de **15 segundos**, em quatro
  atos, para todo mundo olhar para ele:
  1. **Programando o destino**: os circuitos de tempo digitam o nome do próximo bloco, letra a letra
     (LAST TIME DEPARTED mostra de onde saímos), com uma fala do filme;
  2. **Carregando o Flux Capacitor**: o mostrador sobe até 1,21 gigawatts;
  3. **Acelerando até 88 milhas por hora**: as linhas correm cada vez mais rápido e a tela treme;
  4. **Chegada**: três raios, rastros de fogo e o nome do bloco em letras do logo ("CONTINUA…" na
     conclusão). A tela nova surge do clarão.

  Nos celulares, durante esse tempo, aparece **"👀 Olhe para o telão"** com o velocímetro subindo até
  88 MPH; a tela nova só entra quando o telão termina. Avisos rápidos e "olhos no telão" entram em 3 s.
  Em Preparar → Ajustes dá para mudar a duração (3 a 30 s; menos de 7 s usa a versão curta) ou
  desligar. No telão, a tecla **Esc** pula a transição. Os sons da transição (teclado, zumbido, motor
  e raios) tocam com a música ligada ou com os Bipes ligados.


### Fonte do logo

O título dos blocos imita o logo do filme (maiúsculas largas e inclinadas, gradiente do
vermelho-alaranjado ao amarelo, contorno azul fino e a seta). Por padrão usa a fonte livre Russo One
inclinada. Para usar a fonte **"Back to the Future 2002"** (Cyril Bourreau), coloque o arquivo
(`.ttf`, `.otf` ou `.woff2`) na pasta `public/fonts/` do repositório: o app passa a usá-la sozinho no
telão e nos celulares. Ela não vem junto porque a licença de uso precisa ser conferida por quem
organiza o evento.

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
| `FOTOS_KEY`      | (vazio)    | chave que abre o pacote de fotos de perfil (`server/seed/fotos.enc`) |

Testes (algoritmo de duplas + fluxo completo do evento + sorteio das perguntas + integração com o Sucesso + cenas do deck + testes originais do Lucas):

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
| `/telao.html` | projetor | QR do check-in, circuitos de tempo, cronômetros gigantes, 88 MPH, avaliação, conexões, créditos; modo "só o logo" para servir de fundo |
| `/admin.html` | apresentador (notebook) | Painel do Doc: roteiro do evento (Ao vivo) e preparação |
| `/dados.html` | apresentador | Extração de dados: Conexões, Reflexão e Sucesso em tabelas, com download em .csv |
| `/painel` | apresentador | painel 3D do De Volta para o Sucesso (mesma senha) |
| `/participar/<sala>` | participantes | formulário de resposta das dinâmicas (sem login) |
| `/ao-vivo` | todos | página de entrada do De Volta para o Sucesso |

Os viajantes nunca veem área, WL ou time uns dos outros: esses dados ficam só no painel, para o sorteio.

## Painel do Doc: como conduzir o evento

O painel tem duas áreas.

**▶ Ao vivo** (é onde você fica durante o evento)

- À esquerda, o **roteiro** em 4 atos: Chegada → Plano de voo → Boas-vindas → Conexões → Jornada 2026 → IA em 2026 →
  Reflexão → Reconhecimento → Intervalo → Visão 2027 → Manifesto → Sucesso 01 a 04 → o Doc → 88 MPH → Créditos.
  O passo que está no ar fica marcado como **NO AR**.
- À direita, **só o passo atual**: o que os celulares e o telão estão mostrando, os números do momento
  e **um botão principal por vez** (iniciar viagens, iniciar/encerrar recebimento, sortear viajante…).
  Quando o passo não pede mais nada, o botão principal vira **Mostrar o próximo ▶**.
- **Clicar em um passo do roteiro não muda o telão**: o passo só abre aqui no painel (borda
  tracejada, "fora do ar"), para você conferir ou editar. O telão e os celulares só mudam quando você
  clica em **📺 Mostrar no telão e nos celulares**. O que é raro fica em "Mais opções".
- **Fora do roteiro**: "Aviso rápido" (intervalo, recado, link) e "Olhos no telão" entram na hora e
  depois é só voltar ao roteiro.
- O topo mostra o que está **no ar**, quantas pessoas embarcaram, se o **telão** está aberto e logado
  e os três botões de **som**.

O que cada passo faz:

| Passo | Celulares | Telão | Você faz |
|---|---|---|---|
| Check-in | cada pessoa digita o nome e embarca | QR do app + carro carregando | acompanha quem falta |
| Cena do townhall | "olhe para o telão" (agenda, cronômetro, prêmios e 88 MPH aparecem no celular) | a cena do deck | os botões da cena (ver "Roteiro em 4 atos") |
| Bloco de fala (opcional) | nome e tema do bloco, no estilo do logo do filme | modo calmo: título no estilo do logo (seta, rastros de fogo, placa com quem fala, circuitos de tempo) | nada (som desliga sozinho) |
| Conexões | dupla, perguntas, avaliação e resultado | cronômetros e "88 MPH" | **Iniciar viagens**; o resto anda sozinho |
| Reflexão | escolher 1 projeto por parada | menu das paradas, Flux Capacitor, os 2 mais votados (com suspense) | **Abrir parada**, **Iniciar / Encerrar votação**, **Revelar os 2 mais votados**, **Próxima parada** |
| Sucesso 01–04 | pergunta e resposta, com o nome do check-in | carro carregando; nuvem só ao revelar; sorteio | **Iniciar / Encerrar recebimento**, **Revelar respostas**, **Sortear**, tempo de fala |
| Aviso / intervalo | o aviso | o aviso | nada |
| Encerramento | agradecimento e a conexão de cada um | créditos com todos os nomes | baixar as respostas |

Sair do passo Conexões no meio das viagens deixa a viagem em pausa; ao voltar, ela continua de onde
parou. A sala das dinâmicas do Sucesso é criada sozinha.

**⚙ Preparar** (antes do evento)

1. **Roteiro** · a ordem dos passos: reordenar, remover, adicionar cenas, blocos de fala e avisos. Pode mudar
   durante o evento. **Agenda e cenas** · o conteúdo de cada cena do deck.
2. **Pessoas** · a lista do townhall já vem carregada (47 pessoas). Dá para editar WL/área, adicionar,
   marcar ausente, fazer check-in manual, importar outra lista (colar do Excel), **importar as fotos de perfil** e **importar as respostas
   do forms** (CSV/planilha): as respostas aparecem na tela da dupla como "para puxar assunto".
3. **Perguntas** · banco com 30 perguntas em três categorias (Quebra-gelo, Conexão, Além do óbvio) e o modo de
   sorteio. Edite, desative ou substitua em massa (uma por linha, com prefixo `[quebra-gelo]`, `[conexão]` ou
   `[além do óbvio]`; `[off]` marca uma desativada).
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
- **Perguntas**: sorteadas para cada dupla (ver "Conexões: tempos e perguntas"); ninguém recebe uma pergunta que
  já viu e as duplas começam por perguntas diferentes enquanto houver perguntas sobrando na categoria.
- **Ranking → conexão**: 1º lugar vale 3 pontos, 2º vale 2, 3º vale 1. Para cada par que conversou, soma-se
  o que cada lado deu ao outro. A conexão sugerida é o par com maior soma (desempate: quem te colocou mais
  alto). Se os dois se escolheram, aparece "conexão mútua".

## Estrutura

```
server/index.js      servidor HTTP + Socket.IO + API do admin
server/engine.js     estado do evento: blocos, fases, timer, duplas, filas, ranking, resultados
server/matching.js   algoritmo de pareamento (área ≠, WL ≠, sem repetição, trio se ímpar)
server/queues.js     filas de perguntas por dupla (três categorias, sorteio por dupla, sem repetir)
server/cenas.js      cenas do deck do townhall: conteúdo em português, estado ao vivo e comandos do Doc
server/fotos.js      fotos de perfil: de quem é cada arquivo (pelo nome), validação e armazenamento
server/results.js    ranking → conexões
server/db.js         SQLite (node:sqlite) e esquema
server/seed/         lista de pessoas e banco de perguntas iniciais
server/sucesso.js    ponte com o De Volta para o Sucesso (API do Lucas sem alterações, login do Doc)
server/reflexao.js   bloco Reflexão: paradas, projetos, votos, cronômetro e os 2 mais votados
public/dados.*       página de extração de dados (Conexões, Reflexão, Sucesso) com download em .csv
public/              app do viajante (index.html, app.*), telão (telao.*), Painel do Doc (admin.*)
public/cenas.*       as cenas do deck no telão (plano de voo, almanaque, prêmios, intervalo, estratégia, 88 MPH)
public/estrategia-2027.html  a Estratégia CDIO LATAM 2027 (arquivo original, sem alterações)
public/delorean3d.js motor 3D (céu, estrada, raios, portal) extraído do painel do Sucesso
public/delorean-model.js  DeLorean realista (Three.js) · public/nuvem.js  nuvem de palavras
public/flux.js       Flux Capacitor 3D do bloco Reflexão (motor do protótipo, sem bibliotecas)
public/trilha.js     música e trilha de fundo geradas no navegador (Web Audio)
sucesso/             projeto do Lucas: server/api.js, drizzle/, public/ (painel, participar), tests/
scripts/             testes
```
