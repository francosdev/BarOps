# Prompt para a extensão do Claude no Chrome

> Deploy de **26/08/2026** — traz duas coisas: a rota `requisicoes.cancelar` e a
> **Fase 5 inteira** (checklists operacionais + mural). Sai da versão 5 para a 6.

## Como usar

1. Abra a aba do Apps Script do projeto **"Inventario Ephigenia"**.
2. Abra `google-apps-script/Code.gs` no VS Code, `Ctrl+A`, `Ctrl+C`.
3. Cole na extensão **primeiro o prompt abaixo**, e o código **na mensagem seguinte**.

São ~2.083 linhas.

---

Você vai atualizar um Google Apps Script **que está em produção**. Ele é o backend de um
app de inventário de bar que roda em `inventario-ephigenia.netlify.app` e grava contagens
reais numa planilha. Se você quebrar, a equipe do bar não consegue mais enviar contagem.
Trabalhe com cuidado e confirme cada passo antes de seguir para o próximo.

## O projeto certo

ID `1X7gMZRk2DGhAsWzkIc7pe4U28tgKK8CgI4-caKLGMyoKYr0Zhxe1nH9X`, chamado
**"Inventario Ephigenia"**. O arquivo se chama **`Código.gs`** (com acento — é o nome
padrão em português; é o mesmo arquivo que eu chamo de `Code.gs`).

Existe um segundo projeto na conta chamado "Projeto sem título" que **não** é o backend.

Confirme antes de mexer: a primeira linha do arquivo tem que ser

```
const SPREADSHEET_ID = "1RHbLyanJ9I56JMlBsaMOGWu6V4atnwKjtsb50Ja0XCQ";
```

Se não for, **pare e me avise**.

## Regras que não podem ser quebradas

1. **NUNCA crie uma implantação nova.** A URL da implantação atual está gravada dentro do
   app publicado. Criar uma implantação nova gera outra URL e o app para de funcionar.
   Você deve **editar a implantação existente** e criar uma **nova versão** dela. A URL tem
   que continuar contendo
   `AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg`.

2. **Não altere nenhuma constante do topo do arquivo**, em especial `APP_TOKEN` e
   `SENHA_SALT`. Mudar o token derruba a conexão com o app; mudar o sal invalida todas as
   senhas já cadastradas. Cole o código exatamente como recebeu.

3. **Substitua o conteúdo inteiro do arquivo** (`Ctrl+A` e cole por cima). Não faça
   edições parciais — colagem parcial deixa o arquivo com sintaxe quebrada.

4. **Não altere "Executar como" nem "Quem pode acessar".** Já estão em "Eu" e "Qualquer
   pessoa" e devem continuar assim. Se alguma tela exigir confirmar essas opções, **pare e
   me avise** — esse clique é meu.

5. **Pare e me pergunte** se: o projeto não for o descrito acima, houver mais de uma
   implantação ativa, aparecer erro de sintaxe ao salvar, ou qualquer função devolver erro.
   Não tente contornar sozinho.

## Passo 1 — substituir o código

Clique no editor, `Ctrl+A`, cole o código novo por cima, `Ctrl+S`. Confirme que salvou sem
erro de sintaxe e me diga quantas linhas o arquivo ficou (esperado: ~2.083).

O Apps Script guarda histórico de versões, então a anterior fica recuperável.

## Passo 2 — conferir que o código novo está lá

Com `Ctrl+F`, procure estes quatro trechos e me diga se cada um foi encontrado:

1. `function rotaRequisicoesCancelar`
2. `const ABA_CHK_TEMPLATES`
3. `function criarAbasChecklists`
4. `"chk_responder_item": rotaChkResponderItem`

Se algum não aparecer, o código não colou inteiro. **Pare e me avise.**

## Passo 3 — testar o acesso à planilha

No seletor de função, escolha `testarAcessoPlanilha` e clique em **Executar**. Se pedir
autorização, autorize com a conta dona da planilha.

Abra o log e me diga quais abas ele listou.

## Passo 4 — criar as abas da Fase 5

Selecione a função **`criarAbasChecklists`** e clique em **Executar**.

Ela cria cinco abas (se ainda não existirem) e semeia seis checklists sem itens. Não apaga
nada e pode rodar quantas vezes quiser.

Me diga o que apareceu no log — deve ser algo como
`Abas da Fase 5 prontas. Checklists criados agora: 6. Ja existiam: 0.`

Depois abra a planilha e confirme que existem estas cinco abas novas, com estes
cabeçalhos exatos na primeira linha:

- **CHK_TEMPLATES**: `template_id | nome | local | responsavel | momento | dias_semana | ativo | criado_em`
- **CHK_ITENS**: `item_id | template_id | ordem | descricao | tipo_evidencia | referencia | obrigatorio | ativo`
- **CHK_EXECUCOES**: `execucao_id | template_id | data | local | usuario | status | iniciado_em | concluido_em`
- **CHK_RESPOSTAS**: `resposta_id | execucao_id | item_id | valor | usuario | registrado_em`
- **MURAL**: `aviso_id | criado_em | autor | texto | status | resolvido_por | resolvido_em`

E confirme que a aba CHK_TEMPLATES tem seis linhas, uma para cada:
Pre-operacao Bar 22, Pre-operacao Bar 23, Contagem Estoque Central, Producao e pre-batch,
Reposicao e vidraria, Double-check geral.

## Passo 5 — ligar a expiração diária

Selecione a função **`criarGatilhoDeExpiracao`** e clique em **Executar**.

Ela apaga o gatilho anterior da mesma função (se houver) e cria um novo, diário, entre 4h
e 5h. Rodar de novo não acumula gatilhos duplicados.

Se pedir autorização para gerenciar gatilhos, autorize.

Depois vá em **Acionadores** (ícone de relógio na barra lateral) e me confirme que existe
**exatamente um** acionador, para a função `chkExpirarAbertas`, do tipo "Baseado em tempo",
diário.

## Passo 6 — publicar nova versão da implantação existente

1. **Implantar** → **Gerenciar implantações** (não "Nova implantação").
2. Na implantação que **já existe** do tipo "App da Web", clique no ícone de **lápis**.
3. Em **Versão**, escolha **Nova versão** (primeira opção da lista, acima dos números).
4. Descrição: `Fase 5 — checklists operacionais, mural e cancelamento de requisicao`
5. **Não toque** em "Executar como" nem em "Quem pode acessar".
6. Clique em **Implantar**.

## Passo 7 — confirmar que a URL não mudou

Copie a URL do app da web depois de implantar e me mostre. Ela **tem que** conter
`AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg`.

Se for diferente, você criou uma implantação nova em vez de uma versão nova.
**Me avise imediatamente.**

## Ao final, me relate

- Quantas linhas ficou o arquivo, e se os quatro trechos do Passo 2 foram encontrados
- O log do `criarAbasChecklists`
- Se as cinco abas foram criadas com os cabeçalhos certos e se CHK_TEMPLATES tem 6 linhas
- Se o acionador diário aparece na tela de Acionadores
- O número da versão nova e a URL da implantação
- Qualquer erro ou tela inesperada

---

## O que muda com este deploy

**Cancelar requisição.** Rota `requisicoes.cancelar`. Não apaga linha: marca `CANCELADO`,
com quem cancelou e quando. Só cancela enquanto tudo está `PENDENTE` — depois que algo foi
separado o estoque já baixou, e desfazer é movimento de devolução.

**Fase 5 — checklists operacionais.** Cinco abas novas e doze rotas. Não escreve em
MOVIMENTOS: lê apenas para validar evidência do tipo `CONTAGEM`. Toda escrita é upsert por
chave dentro de lock, então reenviar sobrescreve em vez de acrescentar — é o antídoto para
o padrão de contagem duplicada que existe no histórico de inventário. Timestamp é sempre do
servidor.

**Mural.** Quadro de recados da operação: qualquer um deixa, qualquer um resolve. Sem
destinatário, prazo ou dono, e fora dos relatórios.

Nenhuma aba existente muda. Os oito testes de aceite do escopo rodam contra este mesmo
arquivo com `npm run test:checklists`, num simulador de Apps Script — e passam.

## Observação de segurança que continua valendo

O `APP_TOKEN` viaja dentro do JavaScript publicado no Netlify. Qualquer pessoa que abra o
site consegue lê-lo e chamar estas rotas direto. Por isso a checagem de admin da Fase 5 é
feita **no servidor**, contra a aba USUARIOS — nunca acreditando no que o cliente afirma
sobre quem é. Ainda assim, fechar isso de verdade exige exigir login e senha nas rotas de
escrita.
