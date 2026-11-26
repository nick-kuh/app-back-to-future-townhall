# Vídeos do Doc para gerar no Gemini

Hoje o telão tem só 3 trechos do Doc falando, de ~2 s cada, cortados de um único vídeo. Ele repete esses
trechos o tempo todo, e é isso que deixa a cena fraca. Com 10 a 14 vídeos de 8 s, cada um com um gesto
diferente, o telão corta entre eles sem repetir, no ritmo da fala.

## Como gerar

1. Use a imagem **`doc-quadro.jpg`** (o quadro do seu vídeo da chegada) como imagem inicial de **todos** os
   vídeos. É o que mantém o mesmo Doc, o mesmo lugar e a mesma luz.
2. **Se o Flow estiver no seu plano** (flow.google): use "Frames to Video" com a **mesma imagem como primeiro e
   último quadro**. Assim todo vídeo começa e termina igual, e o corte de um para outro fica invisível. Esse é o
   melhor caminho.
3. **No app do Gemini**: Vídeo (Veo) → anexe a imagem → cole o prompt. Formato 16:9.
4. Gere 2 vezes os que saírem estranhos (mão deformada, rosto mudando, texto na tela) e fique com o melhor.
5. Baixe os .mp4 e coloque numa pasta do Google Drive chamada **Doc - vídeos** (ou mande aqui na conversa).
   Pode deixar o nome que vier: eu identifico, corto, acerto a cor e ligo no telão.

O som dos vídeos não importa: no telão eles ficam mudos, e a voz vem da fala gerada no dia.

## Prioridade 0 · Doc em ação, de boca fechada (6 vídeos, sem custo extra)

Estes são os mais importantes. Enquanto a voz do Doc fala, o telão mostra o Doc fazendo coisas, de boca fechada,
como num documentário com narração. Assim ninguém espera a boca acompanhar as palavras, e não precisa pagar a API.
No painel, eles vão no campo "Vídeos enquanto a voz fala".

**A1 · mexendo no carro**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc turns to the time machine behind him and adjusts a glowing cyan component with a small tool, a few sparks fly, then he looks back at the camera with a satisfied smile. His mouth stays closed the whole time; he does not speak. No subtitles, no on-screen text, no music.

**A2 · holograma no controle remoto**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc raises his small remote control, a soft cyan hologram of floating abstract shapes and sparkles appears above it, and he studies it with fascination, eyebrows raised. No letters or words in the hologram. His mouth stays closed the whole time; he does not speak. No subtitles, no on-screen text, no music.

**A3 · olhando o horizonte**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc slowly turns his head and looks into the distance off-screen with hope and wonder, a warm light grows on his face and a light breeze moves his hair. His mouth stays closed the whole time; he does not speak. No subtitles, no on-screen text, no music.

**A4 · pensativo, tendo uma ideia**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc strokes his chin, thinking, looks up, then his eyes light up and he raises one finger as if he just had a brilliant idea, smiling. His mouth stays closed the whole time; he does not speak. No subtitles, no on-screen text, no music.

**A5 · anotando num caderninho**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc takes a small notebook and a pencil from his coat pocket and scribbles notes quickly, nodding to himself, then glances up at the camera. The notebook pages never face the camera. His mouth stays closed the whole time; he does not speak. No subtitles, no on-screen text, no music.

**A6 · rindo em silêncio**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc chuckles silently with a closed-mouth grin, shoulders shaking, shakes his head in amused disbelief and wipes a happy tear from his eye. His mouth stays closed the whole time; he does not speak. No subtitles, no on-screen text, no music.

## Prioridade 1 · Doc falando (8 vídeos)

Cole cada prompt inteiro. Todos começam igual de propósito.

**F1 · explicando, empolgado**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc talks excitedly to the camera, explaining something amazing, with open hands and raised eyebrows, natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

**F2 · contando nos dedos**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc talks to the camera while counting on his fingers, one, two, three, nodding with each point, natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

**F3 · apontando para o público**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc talks to the camera and points straight at the viewer with a big proud smile, as if saying "you did it!", natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

**F4 · contando um segredo**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc leans slightly toward the camera and talks in a low, conspiratorial way, as if revealing a secret about the future, eyes wide, one hand half raised, natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

**F5 · rindo, maravilhado**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc talks to the camera, laughs with delight and shakes his head in disbelief, then keeps talking, natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

**F6 · sério e inspirador**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc becomes calm and sincere, puts one hand on his chest and talks to the camera warmly, with a small emotional smile, natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

**F7 · olhando o relógio, agitado**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc glances at his big wristwatch, then talks fast and excitedly to the camera, gesturing with both hands, natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

**F8 · ajustando os óculos**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc touches the welding goggles on his forehead, then talks to the camera with enthusiasm, nodding, natural mouth movement. He ends in the same pose as at the start. No subtitles, no on-screen text, no music.

## Prioridade 2 · Doc parado, entre as falas (3 vídeos)

**P1 · respirando, olhando em volta**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc stands still with his mouth closed, breathing, blinking, glancing around in amazement with tiny head movements. He ends in the same pose as at the start. No dialogue, no subtitles, no on-screen text, no music.

**P2 · ouvindo, sorrindo**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc tilts his head as if listening to the audience, mouth closed, then smiles and nods slowly. He ends in the same pose as at the start. No dialogue, no subtitles, no on-screen text, no music.

**P3 · conferindo o controle remoto**
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc looks down at a small remote control in his hand, presses a button, a tiny cyan light blinks, then he looks back at the camera with a satisfied smile, mouth closed. He ends in the same pose as at the start. No dialogue, no subtitles, no on-screen text, no music.

## Prioridade 3 · momentos especiais (opcionais)

Nestes não precisa usar a imagem como último quadro.

**J1 · o jornal de 2027** (toca antes da Gazeta do Futuro aparecer na tela)
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc pulls a folded old newspaper from inside his coat, unfolds it facing himself, reads it and reacts with amazement, eyes wide. The printed side of the newspaper never faces the camera. No subtitles, no on-screen text, no music.

**R1 · "Grande raio!"** (reação forte, para a abertura)
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc grabs his head with both hands in total amazement, eyes huge, then throws his arms up in excitement and talks to the camera, natural mouth movement. No subtitles, no on-screen text, no music.

**T1 · despedida** (o fim, antes do "2027")
> Animate this exact image. Keep the same character, outfit, background, lighting, colors and framing; Pixar-style 3D animated film look. Locked-off camera, no cuts. Action: Doc gives a warm smile, waves goodbye to the camera, checks his wristwatch, then turns and hurries toward the car behind him as a bright white light flashes. No subtitles, no on-screen text, no music.

## Depois que eu receber

- Corto cada vídeo nas partes boas, acerto a cor para ficarem iguais e tiro o som.
- **Falando** (F) e **parado** (P) entram no editor ao vivo do telão. Com 8 e 3 vídeos de 8 s, ele corta entre
  eles no ritmo da voz, sem repetir o mesmo trecho em seguida. Os de **ação** (A) tocam enquanto a voz fala,
  no lugar dos de falando, para a narração não depender da boca.
- **J1** toca no jornal, **R1** na abertura e **T1** no fim, antes do "2027".
- Te mando o vídeo do telão de novo, para você aprovar antes de ir para a main.
