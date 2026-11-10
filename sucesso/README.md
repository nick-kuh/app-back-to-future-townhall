# De Volta para o Sucesso — participação ao vivo

Townhall integrado com check-in, viagens em duplas, telão e quatro dinâmicas 3D com QR por sala. As respostas são salvas em D1 e o formulário abre sem login.

O app do viajante abre na raiz, o telão em `/telao.html` e o Painel do Doc em `/admin.html`. A conta ChatGPT do apresentador é vinculada pela variável de servidor `TOWNHALL_PRESENTER_ID`. **Dinâmicas ao vivo** abre `/painel`. O check-in começa com viajantes fictícios. Os cronômetros usam prazos persistidos e atualizam a fase na próxima consulta depois de um período sem conexões.

## Uso

1. Abra `/painel` e entre com sua conta ChatGPT (apenas o apresentador).
2. Crie uma sala ou reabra uma sala existente.
3. Abra a dinâmica e mostre seu QR. A primeira dinâmica já recebe respostas; inicie o recebimento nas demais.
4. Cada participante escaneia o QR no celular, informa seu nome (opcional na dinâmica 4) e responde.
5. Com as abas visíveis, o painel consulta mudanças a cada segundo e o celular consulta o estado aproximadamente a cada três segundos. Em segundo plano as consultas param; ao voltar, a sala é atualizada. Falhas aumentam gradualmente o intervalo de tentativa.

Use **Ampliar QR** para projetar um código maior. Se o celular perder a confirmação de um envio, **Confirmar envio anterior** repete exatamente a mesma solicitação, sem duplicar a resposta, inclusive depois do encerramento da dinâmica. O texto só é limpo depois de um recibo válido do servidor.

Pausar interrompe recebimento e relógio. Reiniciar mantém respostas; Limpar remove respostas da dinâmica e abre nova rodada. As respostas sobrevivem ao recarregamento. Sorteio e tempo de fala são locais à apresentação; o histórico de sorteados reinicia ao recarregar.

## Estrutura

- `public/painel.html`: visual original, com adaptador `live-panel.js`.
- `public/participar.html`: formulário móvel independente.
- `server/site.js`: Worker integrado e autorização do apresentador.
- `server/api.js`: salas, controle de coleta e respostas públicas por QR.
- `townhall/`: motor de viagens e persistência da sessão do Townhall.
- `drizzle/`: migrations de esquema D1; Sites aplica no deploy.
- `scripts/build.mjs`: empacota os módulos e assets com esbuild.
- `scripts/dev.mjs`: preview em `127.0.0.1:4173`, com SQLite e identidade fictícia apenas local.
- `tests/`: testes de autorização, persistência, concorrência, recuperação de envio, cronômetros e renderização.

Requer Node.js 24 para ferramentas locais. Execute `npm ci`, `npm test`, `npm run build` e, opcionalmente, `npm run dev`. A versão hospedada usa D1 provisionado por Sites, binding `DB`. Não envie a pasta `.local`, que contém dados locais de ensaio.

O pacote de código não inclui o manifesto de hospedagem nem a identidade do apresentador. É possível compilar e testar localmente sem essa configuração. Para publicar, configure o ambiente de hospedagem, o banco e um gateway que valide a identidade antes de encaminhar requisições ao Worker.

## Desempenho e validação

A nuvem mantém todas as frequências e desenha até 100 termos; todas as respostas continuam disponíveis para sorteio e exportação. Animações rodam até 30 quadros/s, param em abas ocultas e respeitam a preferência de movimento reduzido. O cronômetro de fala usa tempo decorrido, evitando atraso por callbacks suspensos. A recepção usa o relógio do banco e atualizações condicionais para proteger prazos e conflitos entre controles.

Os testes automatizados cobrem 100 envios concorrentes no banco local, idempotência, prazos, isolamento entre donos de salas, troca de rodada e confirmação após falha de rede. A verificação publicada usa uma sala técnica separada e lotes de 100 respostas com 10 requisições simultâneas. Esses ensaios não substituem medição na rede e nos aparelhos do evento nem garantem uma quantidade de participantes simultâneos.

## API para integração futura

Todas as URLs são relativas ao mesmo domínio. Rotas administrativas exigem identidade validada pelo Sites e propriedade da sala. Não confie em headers de identidade enviados pelo cliente fora desse gateway. Não há CORS aberto.

- `GET /api/rooms`: salas do apresentador.
- `POST /api/rooms` com `{name}`: cria sala com quatro dinâmicas.
- `GET /api/rooms/:roomId/status`: metadados e estado público, sem nomes ou respostas.
- `GET /api/rooms/:roomId/snapshot?after=:cursor`: estados e respostas incrementais, somente dono.
- `POST /api/rooms/:roomId/responses`: envio público via link da sala.
- `POST /api/rooms/:roomId/activities/:activityId/command`: `{action: 'start' | 'pause' | 'end' | 'reset' | 'clear'}`.

Envio: `{activityId, roundId, clientRequestId, participantId, name, answer}`. IDs de requisição e participante são UUIDs; reutilize o mesmo `clientRequestId` ao repetir exatamente um envio sem confirmação. Uma limpeza muda `roundId` e invalida envios atrasados. Dinâmicas: `d1` a `d4`. Respostas têm `id`, `sequence`, `activityId`, `roundId`, `name`, `answer` e `createdAt` em milissegundos. Estado tem `phase`, `endsAt`, `remainingSeconds`, `revision`, `roundId`. O relógio e a aceitação são decididos pelo servidor, incluindo prazo expirado sem painel aberto.

Limites: nome80, resposta200 caracteres; 2s entre envios do mesmo participante; 4.000 respostas/sala; 30 salas/apresentador. Participantes sem login são identificados por um UUID local, não identidade comprovada. A sala possui URL aleatória; qualquer pessoa que receba esse link pode responder enquanto aberta. Respostas são visíveis somente no painel autenticado. O sorteio seleciona registros, não identidades únicas.

O check-in, as duplas e o telão foram adaptados de [`nick-kuh/app-back-to-future-townhall`, branch `claude/nice-ptolemy-l4hnfq`](https://github.com/nick-kuh/app-back-to-future-townhall/tree/db47000079cceb759c5a2fe648a8314447de6065).

## Dependência vendorizada

`public/vendor/qrcode.js`: qrcode-generator 2.0.4, Kazuhiko Arase, licença MIT. Código original: https://github.com/kazuhikoarase/qrcode-generator. O QR é gerado localmente no navegador; não usa serviço externo de imagem.
