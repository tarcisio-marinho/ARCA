---
title: Bitcoin offline
category: Tecnologia
---

Como guardar, receber e enviar bitcoin sem internet com segurança: conceitos essenciais (chave privada, semente, passphrase, xpub, endereços, UTXO, taxas), como proteger a semente, o fluxo de assinatura offline com PSBT e como transmitir a transação quando surgir qualquer conexão. Use para planejar antes da crise e como roteiro na hora de mover fundos.

> ⚠️ **Regras que não têm exceção**
> - **Quem tem a semente (as 12/24 palavras) tem o dinheiro.** Nunca digite, fotografe, fale ou envie a semente para ninguém — nem para "suporte", "governo", "banco" ou parente desconhecido pedindo por mensagem.
> - **Nenhum atendente legítimo pede semente.** Quem pede é golpista. Sempre.
> - **Transação Bitcoin não tem estorno.** Confira o endereço de destino caractere por caractere antes de assinar.
> - **Treine primeiro em testnet/signet** (dinheiro de mentira) antes de mexer em valores reais.

## Conceitos essenciais

### Chave privada

Um número secreto gigante que dá poder de gastar os bitcoins de um endereço. Quem tem a chave privada controla o dinheiro. Formato comum de exportação: **WIF** (começa com `K`, `L` ou `5`).

### Semente (frase mnemônica BIP39)

Uma lista de **12 ou 24 palavras** (de uma lista padrão de 2.048 palavras em inglês) que gera **todas** as chaves privadas e endereços da carteira. É o **backup completo** da carteira.

- 12 palavras já são seguras contra adivinhação; 24 palavras dão margem extra.
- A **ordem** das palavras importa.
- As 4 primeiras letras de cada palavra já a identificam de forma única (útil para gravar em metal).
- A última palavra contém um **checksum**: uma frase inventada "de cabeça" normalmente é inválida.
- Qualquer carteira compatível com BIP39 (Sparrow, Electrum, carteiras de hardware, a própria Arca) recupera os fundos com a mesma semente — desde que use o mesmo **tipo de script/caminho de derivação** (veja xpub/zpub).

### Passphrase (a "25ª palavra")

Uma senha opcional somada à semente. **Semente + passphrase diferente = carteira totalmente diferente.**

- Protege contra quem encontrar só o papel da semente.
- Permite carteira "isca" (semente sem passphrase com pouco valor).
- **Risco**: se esquecer a passphrase, o dinheiro está perdido para sempre — não há recuperação. Faça backup dela **separado** da semente.
- Maiúsculas, minúsculas, espaços e acentos contam. Evite acentos para não ter problemas de codificação.

### xpub / ypub / zpub (chave pública estendida)

Gera **todos os endereços** da carteira, mas **não permite gastar**. Serve para:
- Carteira **watch-only** (somente observação): ver saldo, gerar endereços de recebimento, montar transações (PSBT) **sem** expor chaves privadas.
- O prefixo indica o tipo de endereço: **xpub** → legado (`1…`), **ypub** → SegWit aninhado (`3…`), **zpub** → SegWit nativo (`bc1q…`).

**Privacidade**: quem tem seu xpub vê todo o seu histórico e saldo. Não é segredo como a semente, mas não divulgue.

### Endereços

| Prefixo | Tipo | Observação |
|---|---|---|
| `1…` | Legado (P2PKH) | Taxas mais altas; suporte universal à assinatura de mensagem |
| `3…` | SegWit aninhado ou multisig (P2SH) | Intermediário |
| **`bc1q…`** | **SegWit nativo (P2WPKH)** | **Padrão recomendado**: taxas menores, amplamente aceito |
| `bc1p…` | Taproot (P2TR) | Mais moderno; nem toda carteira suporta tudo (ex.: assinatura de mensagem) |
| `tb1…` | Testnet/signet | Moeda de teste, sem valor |

**Use um endereço novo para cada recebimento** (privacidade). Endereços antigos continuam válidos.

### UTXO (saída não gasta)

Bitcoin não fica como "saldo" numa conta: fica em "moedas" separadas, cada uma resultado de um recebimento — os **UTXOs**. Ao enviar, a carteira junta UTXOs como entrada e cria saídas: o **destino** e o **troco** (que volta para um endereço seu).

- Muitos UTXOs pequenos = transação maior = **taxa maior**.
- Juntar UTXOs de origens diferentes numa transação revela que são da mesma pessoa (privacidade).
- Carteiras como a da Arca guardam os **UTXOs conhecidos** para montar transações offline.

### Taxa (sat/vB)

- **1 bitcoin = 100.000.000 satoshis (sats).**
- A taxa é calculada por **tamanho** da transação em bytes virtuais (vB), não pelo valor enviado: **taxa = sat/vB × tamanho**.
- Uma transação típica SegWit nativa com 1 entrada e 2 saídas tem cerca de **140 vB**.
- A taxa "de mercado" varia muito com o congestionamento. Taxa baixa demais = transação fica parada por horas ou dias.
- Sem internet, você **não sabe a taxa atual**: escolha uma taxa conservadora (mais alta) se precisar de confirmação rápida, ou ative **RBF** (Replace-By-Fee) para poder aumentar a taxa depois.

## Boas práticas de guarda da semente

1. **Escreva à mão, em papel**, com caneta, letra legível, numerando as palavras (1 a 12 ou 1 a 24). Confira duas vezes.
2. **Nunca**: foto, print, arquivo no computador, e-mail, nuvem, gerenciador de notas, mensagem para si mesmo. Celular e computador são hackeados; fotos vão para a nuvem automaticamente.
3. **Metal** (placa de aço/titânio gravada ou com letras de estampar) resiste a fogo e enchente — ótimo para o Brasil, onde enchentes são comuns.
4. **Duas cópias em locais diferentes** (ex.: casa e casa de familiar de confiança), protegidas de água (saco plástico grosso) e de olhares.
5. **Passphrase**: backup separado da semente.
6. **Teste a recuperação** com valor pequeno: apague a carteira, restaure com a semente e confira que o endereço/saldo aparece.
7. **Herança**: deixe instruções (não a semente!) explicando onde está e como recuperar, para que a família consiga acessar se algo acontecer com você.
8. Se precisar guardar a semente digitalmente por algum motivo, no mínimo cifre com senha forte (página **Ferramentas → Cifrar com senha**) — mas papel/metal ainda é melhor.

## Configurar carteira na Arca

Na página **Bitcoin → Carteiras**, há três formas:

1. **Gerar nova semente** (12 ou 24 palavras). Anote no papel **antes** de continuar. A semente fica cifrada com sua senha no computador.
2. **Importar semente** de outra carteira.
3. **Watch-only (xpub/zpub)**: só observa; não gasta. Ideal no computador que eventualmente fica online.
4. **Chave única (WIF)**: para varrer uma chave privada avulsa (ex.: carteira de papel antiga).

Escolha a rede: **Mainnet (real)**, **Testnet** ou **Signet** (treino). Use a opção **Revelar** só quando estritamente necessário, sozinho, e feche ao terminar.

## Receber bitcoin sem internet

1. Abra **Endereços de recebimento** e pegue o **próximo endereço não usado**.
2. Passe o endereço para quem vai pagar (QR code, papel, rádio soletrando com alfabeto fonético — mas cuidado: um caractere errado leva o dinheiro para o lugar errado ou gera endereço inválido; endereços bc1 têm checksum e quase sempre um erro é detectado).
3. **Você não consegue confirmar o recebimento sem acesso à rede.** Quem paga pode mostrar a transação assinada (hex) — você pode **decodificá-la** na Arca (Decodificar & fila) para ver que paga o seu endereço, mas isso **não garante** que ela foi transmitida nem que será confirmada (a pessoa pode gastar as mesmas moedas em outra transação antes).
4. Para trocas presenciais de valor alto em crise, só considere o pagamento recebido depois de **confirmações na rede**.

## Fluxo air-gapped com PSBT

PSBT (**Partially Signed Bitcoin Transaction**, BIP174) é o formato padrão para montar a transação num lugar e assinar em outro. A chave privada **nunca** encosta num computador conectado.

**Configuração típica:**
- **Máquina A (online ou watch-only)**: tem o xpub/zpub; vê UTXOs, monta a transação.
- **Máquina B (offline/air-gapped)**: tem a semente; só assina. Pode ser o notebook da Arca desconectado, uma carteira de hardware ou outra carteira offline.

**Passo a passo:**

1. **Montar** (página Bitcoin → **Enviar**, na carteira watch-only ou na carteira com UTXOs salvos):
   - Destino (cole e confira o endereço).
   - Valor (em BTC; ex.: 0,001).
   - Taxa (sat/vB) — conservadora se não souber a do momento.
   - Resultado: um **PSBT** (texto base64 ou arquivo).
2. **Transportar** o PSBT para a máquina offline: pen drive, cartão SD, QR code. O PSBT **não contém chave privada** — pode ser transportado sem risco de roubo de fundos (mas revela informações de privacidade).
3. **Assinar** (página Bitcoin → **Assinar PSBT**, com a carteira que tem a semente):
   - **Confira na tela da máquina que assina**: endereço de destino, valor, troco voltando para endereço seu, taxa total. Um vírus na máquina A pode trocar o destino — a verificação na máquina offline é sua proteção.
   - Assine e finalize. Resultado: **transação assinada em hex** (pronta para transmitir).
4. **Transmitir** quando houver internet (ver próxima seção). Na Arca, use **Decodificar & fila**: a transação fica na **fila de transmissão** e é enviada automaticamente quando o sistema detectar internet (dá para forçar nova tentativa).
5. **Acompanhar** a confirmação quando houver conexão.

**Antes de assinar, confira sempre**: destino correto, valor correto, taxa razoável (uma taxa absurda por erro de digitação vai para os mineradores e não volta), troco para endereço seu.

## Transmitir a transação por outros meios

A transação assinada (hex) é **pública por natureza**: pode ser enviada por qualquer pessoa, de qualquer lugar, para qualquer nó Bitcoin. Ela **não contém a chave privada**; quem a vê não consegue alterá-la nem roubar fundos (mas vê os endereços e valores).

Formas de transmitir:
1. **Fila da Arca**: envia sozinha quando a internet voltar.
2. **Qualquer nó ou site de "broadcast"** quando houver internet: por exemplo, as páginas de envio de transação de exploradores de blocos (mempool.space, blockstream.info), ou qualquer carteira que aceite "transmitir transação bruta".
3. **Celular de outra pessoa** com internet: passe o hex por QR code, cartão SD ou mensagem e transmita pelo navegador dela.
4. **Outro lugar com internet** (abrigo, posto de serviço, cidade vizinha): leve o hex num pen drive ou papel (é longo — prefira QR ou arquivo).
5. **Por rádio/SMS para alguém conectado**: é possível ditar o hex, mas é longo e um erro invalida a transação (não causa perda: transação corrompida é simplesmente rejeitada).

**Detalhes importantes:**
- A transação assinada **não expira** sozinha, mas deixa de valer se as mesmas moedas forem gastas em outra transação antes.
- Se a taxa estiver baixa demais para o momento, a transação pode ficar parada na fila dos nós (mempool). Com RBF ativado, você pode assinar uma substituta com taxa maior.
- Não transmita a mesma transação "por garantia" em muitos lugares sem necessidade — não faz mal à segurança, mas também não acelera.

## Provar posse com assinatura de mensagem

Às vezes é preciso provar que você controla um endereço (para uma troca, uma herança, uma exchange) **sem mover o dinheiro**.

1. Página Bitcoin → **Mensagens → Assinar mensagem**: escolha o endereço, escreva a mensagem **exata** (inclua data e nome, ex.: "Eu, Fulano, controlo este endereço em 03/11/2026"), assine com a senha.
2. Envie **endereço + mensagem + assinatura (base64)** à outra parte.
3. A outra parte usa **Verificar assinatura** (na Arca ou em qualquer carteira compatível) com os três dados.
4. Atenção à compatibilidade:
   - Endereços **legados (`1…`)** têm o padrão mais universal.
   - Endereços **SegWit** (`bc1q…`, `3…`) são suportados por muitas carteiras, mas há mais de um formato (Electrum, BIP137, BIP322) — confirme que o verificador entende o mesmo formato.
   - **Taproot (`bc1p…`)**: na Arca, a assinatura de mensagem precisa de carteira **não-taproot**.
5. Nunca assine uma mensagem que você não escreveu ou não entendeu.

## Golpes comuns em crise

Crises trazem desespero e pressa — o ambiente perfeito para golpe.

| Golpe | Como funciona | Defesa |
|---|---|---|
| **"Suporte" ou "recuperação"** | Alguém oferece ajudar a recuperar ou proteger sua carteira e pede a semente | **Nunca** informe semente. Ninguém legítimo pede |
| **Endereço trocado** | Malware ou golpista troca o endereço de destino na área de transferência ou na mensagem | Confira o endereço completo na tela da máquina que assina; confirme por outro canal (voz) |
| **Pagamento "enviado" que nunca chega** | Pessoa mostra print ou hex de transação e leva o produto; depois gasta as moedas em outra transação ou a transação nunca é transmitida | Só entregue bens de valor depois de confirmação na rede |
| **Carteira falsa / app falso** | Programa modificado que rouba a semente | Use software conhecido, verificado (hash/assinatura), instalado antes da crise |
| **Doação para vítimas falsa** | Campanhas de "ajuda humanitária" com endereço do golpista | Doe só para organizações conhecidas, confirmando o endereço no canal oficial |
| **Câmbio vantajoso demais** | Oferta de comprar/vender bitcoin muito acima ou abaixo do preço | Desconfie; troque presencialmente, em local seguro, com valores pequenos |
| **Coação física** ("ataque da chave inglesa") | Ameaça para forçar transferência | Discrição: não conte que tem bitcoin. Carteira-isca com passphrase diferente |
| **QR code adulterado** | Adesivo com outro QR por cima | Confira o endereço decodificado, não só o QR |

## Resumo prático

1. Semente em papel/metal, duas cópias, nunca digital. Passphrase separada.
2. Treine em testnet/signet.
3. Computador online só com watch-only (xpub/zpub). Assinatura sempre offline.
4. Confira destino, valor, troco e taxa **na tela da máquina que assina**.
5. Transação assinada pode ser transmitida por qualquer um, de qualquer lugar — use a fila da Arca ou o celular de alguém quando houver internet.
6. Discrição sobre o que você tem.
