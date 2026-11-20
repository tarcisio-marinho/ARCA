---
title: Como usar a Arca
category: Tecnologia
---

Guia do próprio sistema Arca: o que tem em cada página, como fazer boas perguntas à IA, como ler as fontes citadas e como economizar energia para o notebook durar. Use na primeira vez que abrir o sistema e sempre que tiver dúvida sobre onde encontrar algo.

> ⚠️ **Em emergência médica, não espere a IA.** Abra direto **Guias → Primeiros socorros** (texto puro, abre na hora e quase não gasta bateria). A IA é ótima para dúvidas específicas, mas leva alguns segundos e consome bastante energia.

## O que é a Arca

A Arca é um "kit de sobrevivência digital" que roda **100% offline** num notebook ou computador da casa. Ela junta:

- **Guias curados em português** (como este) sobre emergência, água, comida, abrigo, comunicação, planos e veículos/realocação.
- **Vídeos offline** do canal Sobrevivencialismo, com transcrição pesquisável.
- **Enciclopédias offline** (Wikipédia de medicina em português, MedlinePlus, CDC, manuais de medicina, culinária, faça-você-mesmo, entre outras).
- **Mapas offline** do Brasil até nível de rua.
- **Uma IA local** que lê esse acervo e responde perguntas citando as fontes.
- **Ferramentas** de inventário, diário, criptografia e Bitcoin.

Nada disso precisa de internet. Quando a internet existe, a barra lateral mostra "Internet: online", e algumas funções (como transmitir transação Bitcoin) passam a funcionar.

O indicador no canto da barra lateral mostra o estado de três coisas: **IA** (modelo carregado), **Acervo** (enciclopédias) e **Internet**.

## Página Início

Visão geral: autonomia estimada da casa (dias de água e comida, a partir de **Suprimentos**), acesso rápido aos protocolos de emergência e uma caixa para perguntar direto à IA ("como tratar uma queimadura de 2º grau?").

## Página Guias de sobrevivência

Os guias em Markdown, organizados por categoria: Emergência, Água, Alimentos, Abrigo, Comunicação, Planos, Tecnologia e **Veículos e realocação** (bateria 12 V, consertos na estrada, híbridos e elétricos, saída da capital para o interior).

- São a fonte **mais confiável e mais rápida** do sistema: escritos para o contexto brasileiro, revisados, com doses e procedimentos.
- Abrem instantaneamente e gastam quase nada de energia.
- Os guias também alimentam a IA: quando você pergunta algo, ela busca primeiro aqui.
- Os **checklists** podem ser impressos ou usados como roteiro de revisão.

## Página Suprimentos

O inventário da casa.

1. Informe **quem está na casa** (adultos, crianças, animais).
2. Cadastre cada item: nome, categoria (água, comida, remédios…), quantidade, unidade, **calorias por unidade** (comida) ou **litros por unidade** (água), validade e onde está guardado.
3. A página calcula **quantos dias o estoque sustenta a família**, limitada pelo recurso que acaba primeiro — a meta é 30 dias.
4. Atualize **toda semana** ou a cada uso grande. Veja "Plano de 30 dias" (seção Inventário).

Dica: calorias de referência — arroz ~3.600 kcal/kg, feijão ~3.300 kcal/kg, macarrão ~3.700 kcal/kg, óleo ~8.800 kcal/L, açúcar ~4.000 kcal/kg, leite em pó ~5.000 kcal/kg.

## Página Mapas offline

Mapa do Brasil até nível de rua, funcionando sem internet.

- **Salve pontos** com tipo: ponto de encontro, fonte de água, abrigo, saúde/hospital, suprimentos, perigo/evitar, outro. Adicione notas (horários, condição da água, contato).
- Use para planejar **rotas de evacuação** e registrar o que a família descobriu (onde há distribuição de água, que rua alagou, qual posto está atendendo).
- "Minha localização" usa o GPS do aparelho, quando disponível (GPS funciona sem internet).

## Página Diário & notas

Bloco de notas que **salva sozinho**. Use para:

- **Saúde**: horário e dose de cada remédio dado, temperatura, sintomas (ex.: "14h — dipirona 500 mg para João, febre 38,4 °C"). Isso evita dose dobrada e ajuda o médico depois.
- **Consumo** de água e comida.
- **Contatos** feitos e notícias recebidas pelo rádio, com hora.
- **Decisões** tomadas e o motivo.

Notas importantes podem ser **fixadas** no topo.

## Página IA Arca

Assistente que roda localmente, sem internet. Ela **busca no acervo** (guias, seus documentos e enciclopédias) antes de responder e **cita as fontes**.

### Modos

- **Assistente** (padrão): perguntas sobre saúde, água, comida, reparos, técnica, sobrevivência. Busca no acervo e responde em português.
- **Agente dev**: modo para programação. Além do acervo, a IA tem um espaço de trabalho (`/workspace`) onde pode **ler, criar e editar arquivos e executar comandos** (bash, node, python, git). Útil para quem quer escrever um script, consertar um programa ou automatizar algo offline. Use só se souber o que está pedindo.

### Raciocínio estendido

O botão de **raciocínio** faz a IA "pensar" antes de responder: melhora respostas para problemas difíceis (cálculos, situações complexas), mas é **bem mais lento e gasta mais energia**. Deixe **desligado** no dia a dia e ligue só quando a resposta normal não for suficiente.

### Como ler as fontes citadas

A IA marca de onde tirou cada informação:

- **[D1], [D2]…** = **D**ocumento: guias da Arca ou PDFs/documentos enviados.
- **[W1], [W3]…** = **W**iki/enciclopédia: artigos das bibliotecas offline (Wikipédia, MedlinePlus, CDC etc.).
- **[V1 12:34]…** = **V**ídeo: fala de um vídeo do canal, com o minuto. Clicar abre o vídeo exatamente naquele ponto.

Clique na fonte para abrir o trecho original. **Para doses de remédio e procedimentos médicos, sempre confira a fonte.** Se a IA disser que a informação não veio do acervo, trate com mais cautela.

## Como fazer boas perguntas à IA

Perguntas **curtas e específicas** dão respostas melhores, mais rápidas e gastam menos bateria.

| Em vez de… | Pergunte… |
|---|---|
| "O que fazer numa emergência?" | "Criança de 3 anos com febre de 39 °C, qual dose de paracetamol gotas 200 mg/mL? Ela pesa 14 kg." |
| "Como tratar água?" | "Quantas gotas de água sanitária para um galão de 20 litros?" |
| "Meu filho está doente" | "Diarreia há 2 dias, sem sangue, criança de 5 anos. Como fazer soro caseiro e quanto dar?" |
| "Me fala sobre cobras" | "Picada de jararaca no pé, o que fazer agora?" |

Dicas:
1. Inclua **idade, peso, há quanto tempo, o que já foi feito**.
2. **Uma pergunta por vez.**
3. Se a resposta for longa demais, peça: "resuma em 5 passos".
4. Para continuar o assunto, pergunte na **mesma conversa** (ela lembra o contexto).
5. Nomes de doenças e remédios em inglês às vezes encontram mais fontes médicas — a IA já traduz a busca automaticamente.
6. A IA pode errar. Em saúde, cruze com o guia e, se houver qualquer sinal de alarme, procure atendimento.

## Página Biblioteca

Enciclopédias offline (formato ZIM, servidas pelo Kiwix). Exemplos do acervo: **Wikipédia de medicina em português**, **MedlinePlus**, **CDC**, **WikiMed**, manuais de medicina militar, NHS (remédios), receitas de culinária, perguntas e respostas de faça-você-mesmo, mecânica, marcenaria, eletrônica (Arduino, Raspberry Pi), documentação de programação, nós e cordas, água e pós-desastre.

- Use a busca para procurar em **todas as enciclopédias** de uma vez; filtre por idioma (português, inglês, todos).
- Muitos termos técnicos e médicos rendem mais em inglês (ex.: "tetanus", "solar panel", "water purification").
- Abra o artigo em nova aba para leitura completa.

## Página Vídeos

Os vídeos do canal Sobrevivencialismo, guardados no HD e tocando no navegador, sem internet.

- **Grade** com busca pelo título e ordenação (mais novos, mais antigos, mais longos).
- **Player** com legenda opcional e a **transcrição ao lado**, que acompanha o vídeo. Clique numa fala para pular até ela. **⌘F** procura dentro da transcrição; **Enter** e **Shift+Enter** pulam entre as ocorrências e o vídeo vai junto.
- **Buscar nas falas** procura o que foi **dito** em todos os vídeos de uma vez e abre no segundo certo. A busca geral (⌘K) também mostra os vídeos.
- As legendas são automáticas do YouTube: às vezes trocam palavras. Se não achar, tente um sinônimo. Vídeos marcados "sem transcrição" tocam normalmente, mas não aparecem na busca nem na IA.

## Página Documentos & PDFs

Tudo o que está aqui é **lido pela IA**.

1. **Arraste** PDFs, Markdown, TXT ou código para enviar.
2. O sistema extrai o texto, divide em trechos e indexa (os PDFs grandes levam algum tempo para ficar pesquisáveis).
3. Escolha uma **categoria** ao enviar (ex.: "manuais da casa", "médico", "documentos da família").
4. Use a **busca semântica** para achar trechos por significado, não só por palavra exata.

**Ideias do que enviar**: manuais de aparelhos (gerador, inversor, fogão, carro), bulas dos remédios da família, receitas médicas e laudos, plano de evacuação da cidade, apostilas de primeiros socorros, cópias de documentos (cuidado: tudo que você enviar fica legível por quem usar o computador).

## Página Ferramentas

Utilitários que funcionam offline:

- **Codificação**: Base64, Base32, Base58, hex, URL, binário, conversor de bases numéricas.
- **Hash & integridade**: SHA-256 e outros, para conferir se um arquivo ou texto não foi alterado.
- **Criptografia**: **cifrar e decifrar texto com senha** (AES-256-GCM) — ótimo para guardar senhas, dados bancários ou documentos sensíveis num pen drive; gerar pares de chaves; assinar e verificar mensagens.
- **Comunicação**: conversor de **código Morse** (texto ↔ Morse) para rádio, lanterna ou batidas.
- **Utilidades** diversas.
- **CyberChef**: o "canivete suíço" completo de codificação e análise de dados, embutido na própria página.

**Atenção com a cifragem**: se esquecer a senha, **não há como recuperar** o conteúdo.

## Página Bitcoin

Carteira Bitcoin que funciona sem internet: gerar ou importar semente, carteira apenas de observação (xpub/zpub), endereços de recebimento, montar e assinar transações (PSBT), assinar e verificar mensagens, decodificar transações e uma **fila de transmissão** que envia automaticamente quando a internet voltar. Testnet e signet disponíveis para treinar sem dinheiro real. Detalhes e boas práticas no guia "Bitcoin offline".

## Página Sistema

Saúde dos serviços (IA, modelo de embeddings, enciclopédias, banco de dados), quantidade de documentos indexados, uso de disco e qual modelo de IA está carregado. Mostra também como **parar a IA** quando não estiver usando, para economizar energia.

## Economizar energia ao usar a Arca

O notebook gasta **30–60 W** em uso; a IA local é o que mais consome (usa o processador/placa de vídeo ao máximo enquanto responde).

1. **Consulte os guias primeiro** — texto puro, gasto mínimo.
2. **Perguntas curtas** à IA e **raciocínio estendido desligado**.
3. **Feche abas** e programas que não está usando (inclusive abas da Arca abertas à toa — mapas e enciclopédias também consomem).
4. **Brilho da tela** no mínimo confortável.
5. **Pare a IA** (página Sistema) quando for usar só guias, mapas e diário por um tempo.
6. Use em **sessões programadas** (ex.: 30 min de manhã e 30 min à noite) e **suspenda** o notebook entre elas.
7. Mantenha o notebook em local fresco e ventilado — calor aumenta o consumo e desgasta a bateria.

## Rodar a Arca na bateria do carro

1. Prefira um **carregador veicular USB-C PD** (65–100 W) se o notebook carregar por USB-C — é o modo mais eficiente.
2. Senão, use um **inversor** (150–300 W, onda senoidal pura de preferência) ligado ao acendedor de cigarro ou direto na bateria.
3. Uma bateria de carro de 60 Ah rende algo como **5 a 9 horas** de notebook sem descer abaixo de 50% de carga (ver "Energia e iluminação").
4. Confira a **tensão da bateria**: em repouso, abaixo de **12,2 V**, pare e recarregue (ligando o carro **ao ar livre**).
5. Carregue o notebook enquanto o motor estiver ligado ou com sol no painel solar, e use **na bateria interna** depois.

## Se algo não funcionar

- **IA não responde ("IA: fora")**: verifique na página Sistema se o serviço da IA está rodando; reinicie-o. Enquanto isso, use Guias e Biblioteca.
- **Enciclopédias não abrem ("Acervo: fora")**: o serviço da biblioteca pode estar parado; os guias continuam funcionando.
- **Busca não encontra um PDF recém-enviado**: a indexação pode estar em andamento (página Sistema mostra trechos pendentes).
- **Tudo lento**: feche abas, desligue o raciocínio, verifique se o notebook está em modo de economia extrema ou superaquecido.
