---
title: Energia e iluminação
category: Abrigo
---

Como gerar, guardar e gastar energia elétrica sem a rede: priorizar o que importa, usar bateria de carro com inversor, calcular autonomia em Wh, carregar celular, painel solar, power bank, gerador com segurança e iluminação sem risco de incêndio. Inclui como manter um notebook (e a própria Arca) funcionando.

> ⚠️ **Gerador e qualquer motor a combustão produzem monóxido de carbono (CO).** Nunca ligue gerador dentro de casa, garagem (mesmo com porta aberta), varanda fechada ou perto de janelas. Mantenha **pelo menos 6 metros** de distância de portas e janelas, com o escapamento apontado para longe da casa (CDC). Dor de cabeça, tontura e náusea em várias pessoas = saia para o ar livre e chame 192/193.

## Prioridades de energia

Energia vai ser escassa. Gaste nesta ordem:

1. **Saúde**: aparelhos médicos (concentrador de oxigênio, CPAP, nebulizador), refrigeração de insulina, lanterna para atendimento.
2. **Comunicação**: rádio (notícias e Defesa Civil), celular para emergência.
3. **Iluminação** noturna mínima e segura.
4. **Informação**: notebook com a Arca (guias, mapas, IA) — use em sessões curtas.
5. **Conforto**: ventilador pequeno USB em calor extremo (crianças, idosos), carregar tablet para crianças.
6. **Não prioritário**: TV, geladeira grande (consome muito), micro-ondas, chuveiro elétrico, ar-condicionado — não rodam em bateria pequena.

**Quem depende de aparelho médico** (oxigênio, CPAP, diálise domiciliar): tenha plano B **antes** da crise — cilindro de oxigênio, bateria dedicada, contato com a distribuidora de energia (há cadastro de clientes com equipamento vital) e com a equipe de saúde.

## Conceitos básicos: W, Wh, Ah e V

- **W (watt)**: potência — quanto o aparelho puxa **agora**.
- **Wh (watt-hora)**: energia — quanto foi gasto ao longo do tempo. Um aparelho de 10 W ligado por 5 horas gasta 50 Wh.
- **Ah (ampère-hora)**: capacidade de bateria. Para virar Wh, **multiplique pela tensão**: Wh = Ah × V.
- **mAh** (power bank): divida por 1.000 e multiplique pela tensão interna da bateria (geralmente **3,7 V**). Ex.: 20.000 mAh × 3,7 V ≈ **74 Wh**.

### Consumo típico

| Aparelho | Potência | Energia de uso típico |
|---|---|---|
| Celular (carga completa) | 10–25 W carregando | **10–20 Wh por carga** |
| Notebook | **30–60 W** em uso (menos com tela baixa) | 30–60 Wh por hora |
| Rádio a pilha | 1–3 W | Muito pouco |
| Lâmpada LED 9 W | 9 W | 9 Wh por hora |
| Lanterna LED / luminária USB | 1–5 W | — |
| Ventilador USB pequeno | 2–5 W | — |
| Ventilador de mesa 40 cm | 50–100 W | — |
| Roteador Wi-Fi | 6–12 W | — |
| Geladeira (média) | 100–200 W ao rodar; pico de partida 3–5x maior | **1–2 kWh/dia** |
| Freezer horizontal | 80–150 W | 1–1,5 kWh/dia |
| Concentrador de oxigênio | 250–600 W | Muito alto |
| CPAP | 30–60 W (sem umidificador) | 300–500 Wh/noite |
| Chuveiro elétrico, ferro, micro-ondas, ar-condicionado | 1.000–7.500 W | **Inviável em bateria** |

Muitos aparelhos trazem a potência na etiqueta ou na fonte (saída V × A = W).

## Bateria de carro + inversor

A bateria do carro é a "usina" mais disponível. Bateria típica: **12 V, 45 a 70 Ah**.

### Quanto de energia tem

**Wh nominal = Ah × 12 V.** Ex.: bateria de 60 Ah → 60 × 12 = **720 Wh**.

Mas você **não pode usar tudo**:
1. **Bateria de carro (chumbo-ácido, de partida)** não foi feita para descarga profunda. **Não desça abaixo de ~50%** da carga — abaixo disso ela se degrada rapidamente (e você pode ficar sem conseguir dar partida no carro).
2. O **inversor** (12 V → 127/220 V) perde **10–20%**.

**Energia útil ≈ Ah × 12 × 0,5 × 0,85.**

| Bateria | Wh nominal | Útil (50% e inversor) | Autonomia aproximada |
|---|---|---|---|
| 45 Ah | 540 Wh | ~230 Wh | Notebook 40 W: ~5–6 h; ou ~15 cargas de celular |
| 60 Ah | 720 Wh | ~300 Wh | Notebook 40 W: ~7 h; ou ~20 cargas de celular |
| 70 Ah | 840 Wh | ~360 Wh | Notebook 40 W: ~9 h |
| Estacionária 105 Ah (ciclo profundo) | 1.260 Wh | ~530–750 Wh | Notebook 40 W: ~13–18 h |

**Como calcular a autonomia de qualquer aparelho**: autonomia (h) = energia útil (Wh) ÷ potência do aparelho (W).

### Como usar com segurança

1. **Inversor**: escolha um com potência contínua um pouco acima do que vai ligar (para notebook e celulares, 150–300 W bastam). Inversores de **onda senoidal pura** são melhores para eletrônicos sensíveis e fontes de notebook.
2. Inversores pequenos (até ~150 W) ligam no **acendedor de cigarro**. Acima disso, ligue **direto nos polos da bateria** com garras e cabos grossos, respeitando a polaridade (vermelho no +, preto no –).
3. **Ligue o carro de tempos em tempos** para recarregar: o alternador recarrega a bateria. Com o motor em marcha lenta, a recarga é lenta (uma hora de motor ligado repõe apenas parte da carga); rodar com o carro recarrega melhor. **Motor ligado = CO**: carro sempre ao ar livre, nunca em garagem.
4. **Monitore a tensão** com um voltímetro barato (de acendedor de cigarro ou multímetro), com a bateria em repouso por algumas horas:

| Tensão em repouso (12 V chumbo-ácido) | Carga aproximada |
|---|---|
| 12,7 V ou mais | ~100% |
| 12,4 V | ~75% |
| **12,2 V** | **~50% — pare de descarregar** |
| 12,0 V | ~25% (prejudicial) |
| 11,8 V ou menos | Praticamente vazia |

5. Bateria em uso libera **hidrogênio** (inflamável) durante a recarga: use em local ventilado, sem chama e sem faísca perto.
6. Não curto-circuite os polos (ferramenta de metal encostando nos dois polos derrete e pode explodir a bateria).

### Carregar celular pelo carro

- **Carregador USB de acendedor de cigarro** é muito mais eficiente que inversor + carregador de tomada (sem dupla conversão).
- Com o carro **desligado**, um celular gasta tão pouco da bateria que dá para carregar vários sem risco. Mesmo assim, ligue o motor de vez em quando ou confira a tensão.
- Muitos carros cortam a tomada 12 V com a ignição desligada — use a posição "acessórios" (cuidado para não esquecer luzes ligadas) ou ligue o inversor direto na bateria.

## Painel solar portátil

O Brasil tem ótima insolação, e painel solar é a única fonte que **se renova** sem combustível.

1. **Produção real** de um painel ≈ **potência nominal × 4 a 5 horas de sol pleno por dia × 0,7** (perdas, ângulo, calor, sujeira). Ex.: painel de 100 W → cerca de **300–350 Wh por dia** em dia bom; em dia nublado, um quinto disso ou menos.
2. **Painel dobrável USB** de 20–30 W: carrega celular e power bank diretamente; ótimo para emergência.
3. **Painel de 50–200 W** + **controlador de carga** (PWM ou MPPT) + bateria 12 V: sistema completo. **Nunca ligue o painel direto na bateria sem controlador** (sobrecarga).
4. Posicionamento: voltado para o **norte** (no Brasil), inclinado aproximadamente no ângulo da sua latitude, sem sombra. Ajuste ao longo do dia se puder (rende mais).
5. Limpe a poeira do painel com pano úmido.
6. Painel quente rende menos: deixe espaço de ventilação embaixo.
7. "Gerador solar"/estação de energia portátil (bateria de lítio com inversor e entrada solar embutidos) é o jeito mais simples: tudo num aparelho só.

## Power banks

- **Capacidade real**: aproximadamente 60–70% do anunciado chega ao celular (perdas de conversão). Um power bank de 10.000 mAh carrega um celular comum cerca de 1,5–2 vezes; 20.000 mAh, cerca de 3–4 vezes.
- Mantenha **carregados** e recarregue a cada 3 meses no armazenamento.
- Guarde em local fresco; **não deixe no carro ao sol** (bateria de lítio + calor = risco de incêndio).
- Power bank estufado, quente demais ou com cheiro: **pare de usar** e descarte em local seguro, longe de material inflamável.
- Alguns notebooks carregam por USB-C PD com power bank de 45–100 W — confira se o seu aceita.

## Gerador a combustão

1. **Sempre ao ar livre**, a **6 m ou mais** de portas, janelas e entradas de ar, escapamento para longe da casa (CDC). Nunca em garagem, porão, varanda fechada ou dentro de casa.
2. **Detector de CO a pilha** dentro de casa se estiver usando gerador.
3. Abastecer **só com o motor desligado e frio**. Gasolina derramada em motor quente pega fogo.
4. Proteja da chuva com cobertura aberta nas laterais (não feche).
5. **Nunca ligue o gerador na tomada da casa** ("backfeed"): pode eletrocutar quem estiver consertando a rede da rua e queimar sua instalação. Use extensões grossas direto do gerador aos aparelhos, ou peça instalação de **chave de transferência** por eletricista.
6. Estoque de combustível: gasolina degrada em 1–3 meses (estabilizador ajuda); guarde em galão próprio, fora de casa, à sombra.
7. **Consumo**: gerador pequeno (1–2 kW) gasta cerca de 0,5–1 L de gasolina por hora. Planeje **sessões curtas** para tarefas concentradas (recarregar todas as baterias de uma vez, rodar o freezer por 1–2 h para manter frio, bombear água).
8. Barulho atrai atenção — considere a segurança (ver guia "Segurança e abrigo").

## Iluminação

| Opção | Duração | Risco de incêndio | Observação |
|---|---|---|---|
| **Lanterna LED** a pilha | 10–100 h por conjunto de pilhas | Nenhum | Melhor opção. Lanterna de cabeça libera as mãos |
| **Luminária/lâmpada LED USB recarregável** | Muitas horas com power bank | Nenhum | Pendure no teto para iluminar o cômodo todo |
| **Lanterna de dínamo/manivela** ou solar | Ilimitada | Nenhum | Ótima reserva |
| **Lampião a gás** | Horas | Médio | **Gera CO** — só em área muito ventilada |
| **Lampião a querosene** | Horas | Alto | Fumaça, CO, cheiro. Use pouco e ventilado |
| **Vela** | 4–10 h | **Alto** | Última opção |

### Velas com segurança

1. Em **recipiente não inflamável e estável**: pote de vidro, lata com areia, prato fundo com água.
2. Longe de cortinas, roupas, papel, colchão, crianças e animais.
3. **Nunca deixe vela acesa sozinha ou dormindo.** A maioria dos incêndios domésticos em apagões começa assim.
4. Uma vela por cômodo, no máximo. Muitas velas acesas também consomem oxigênio e geram fumaça.
5. Tenha fósforos/isqueiros guardados em lugar fixo, seco, longe de crianças.

### Truques para iluminar mais com menos

- **Garrafa PET com água** sobre uma lanterna apontada para cima espalha a luz pelo cômodo.
- Paredes claras e espelhos refletem luz.
- Concentre a família num cômodo à noite: uma luz para todos.
- **Durante o dia**, faça tudo que precisa de luz. Adapte o horário: acordar e dormir com o sol economiza muita energia.

## Como economizar energia

1. **Desligue tudo que não está usando** — inclusive inversor ligado sem carga (consome 5–15 W à toa).
2. Celular: modo economia, brilho baixo, Wi-Fi/Bluetooth/GPS desligados, modo avião quando não houver sinal (procurar sinal gasta muita bateria). Ligue o rádio do celular só em horários combinados.
3. Carregue durante o dia, com o sol, quando houver painel.
4. Prefira aparelhos que funcionam em **12 V/USB direto** (sem inversor).
5. Use **pilhas recarregáveis** (NiMH) com carregador USB.
6. Agrupe tarefas: carregue tudo junto numa sessão de motor/gerador.
7. Geladeira: só vale a pena se houver energia sobrando; abra o mínimo possível.

## Rodar um notebook e a Arca com pouca energia

Um notebook consome **30–60 W** durante o uso — muito mais que celular e rádio. Com uma bateria de carro de 60 Ah (cerca de 300 Wh úteis), você tem algo como **5 a 9 horas** de notebook.

1. **Use a bateria do próprio notebook primeiro** e recarregue em sessões (do carro, do painel ou do gerador).
2. Prefira carregar o notebook **por USB-C no acendedor de cigarro** (carregador veicular PD de 65–100 W), se o notebook aceitar — evita a perda do inversor.
3. **Brilho da tela no mínimo confortável** (a tela é um dos maiores consumos).
4. Feche abas e programas que não está usando.
5. Na IA da Arca, **desligue o modo de raciocínio** quando não for necessário e faça **perguntas curtas e diretas**: a IA local usa muito processador, e cada resposta longa gasta bateria.
6. Para consulta rápida, abra o **guia** direto (texto puro, quase não gasta) em vez de perguntar à IA.
7. **Desligue (ou suspenda) o notebook** entre as sessões. Defina horários fixos: por exemplo, 30 minutos de manhã e 30 minutos à noite.
8. Calor reduz a vida da bateria e faz o processador gastar mais: use o notebook em local fresco e com ventilação embaixo.

Veja também o guia "Como usar a Arca".
