# Prompt para a extensão do Claude no Chrome

> Deploy de **27/08/2026** — Fase 5, passos 1 a 4: papéis na tabela de usuários, camada de
> avisos in-app, validação de inteiro na requisição (bug em produção) e aviso ao separador.
> Sai da versão 6 para a 7.

## Como usar

1. Abra a aba do Apps Script do projeto **"Inventario Ephigenia"**.
2. Abra `google-apps-script/Code.gs` no VS Code, `Ctrl+A`, `Ctrl+C`.
3. Cole na extensão **primeiro o prompt abaixo**, e o código **na mensagem seguinte**.

São ~2.487 linhas.

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

1. **NUNCA crie uma implantação nova.** A URL atual está gravada dentro do app publicado.
   Criar implantação nova gera outra URL e o app para de funcionar. Você deve **editar a
   implantação existente** e criar uma **nova versão** dela. A URL tem que continuar
   contendo `AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg`.

2. **Não altere nenhuma constante do topo do arquivo**, em especial `APP_TOKEN` e
   `SENHA_SALT`. Mudar o token derruba a conexão; mudar o sal invalida todas as senhas.

3. **Substitua o conteúdo inteiro do arquivo** (`Ctrl+A` e cole por cima). Colagem parcial
   deixa o arquivo com sintaxe quebrada.

4. **Não altere "Executar como" nem "Quem pode acessar".** Já estão em "Eu" e "Qualquer
   pessoa". Se alguma tela exigir confirmar essas opções, **pare e me avise**.

5. **Pare e me pergunte** se: o projeto não for o descrito acima, houver mais de uma
   implantação ativa, aparecer erro de sintaxe, ou qualquer função devolver erro.

## Passo 1 — substituir o código

`Ctrl+A` no editor, cole o código novo por cima, `Ctrl+S`. Me diga quantas linhas ficou
(esperado: ~2.487) e se salvou sem erro.

## Passo 2 — conferir que colou inteiro

Com `Ctrl+F`, procure e me diga se encontrou cada um:

1. `function migrarUsuariosEPapeis`
2. `function notificar`
3. `function validarInteiro`
4. `function dataOperacional`
5. `notif_marcar_todas_lidas`

Se algum não aparecer, **pare e me avise**.

## Passo 3 — migrar as colunas e os papéis

Este é o passo delicado do deploy: ele acrescenta colunas em duas abas **que já têm
dados**. Antes de executar, abra a planilha e me diga:

- quantas linhas preenchidas tem a aba **USUARIOS** (fora o cabeçalho)
- quantas linhas preenchidas tem a aba **REQUISICOES** (fora o cabeçalho)

Anote esses dois números. Depois selecione a função **`migrarUsuariosEPapeis`** e clique em
**Executar**.

Ela faz três coisas, e nenhuma apaga nada:
- acrescenta colunas **à direita** do cabeçalho de USUARIOS e REQUISICOES
- cria a aba NOTIFICACOES
- define os papéis do time, criando quem ainda não existe

Me diga o que apareceu no log. Deve ser parecido com:
`USUARIOS: 3 coluna(s) acrescentada(s), 3 usuario(s) criado(s), 2 atualizado(s). REQUISICOES: 6 coluna(s). Aba NOTIFICACOES pronta.`

## Passo 4 — conferir que a migração não estragou nada

Abra a planilha e me confirme, um por um:

**USUARIOS** — cabeçalho tem que ser exatamente:
`usuario_id | nome | login | senha_hash | perfil | ativo | papel | pode_atribuir_tarefa | papel_operacional`

E tem que ter **5 linhas**: franco, jon, sarah, daniel, yvison. Me diga o valor das colunas
`papel`, `pode_atribuir_tarefa` e `papel_operacional` de cada uma.

**Importante**: confirme que as colunas antigas (nome, login, senha_hash) continuam com os
valores certos e **não foram deslocadas**. Se algum senha_hash estiver vazio ou na coluna
errada, **pare imediatamente e me avise** — é o único jeito de esta migração dar errado.

**REQUISICOES** — cabeçalho tem que terminar com:
`... | obs | criado_por | criado_em | data_operacional | cancelado_por | cancelado_em | fechado_automaticamente`

E o número de linhas tem que ser o **mesmo** que você anotou no Passo 3. As requisições
antigas ficam com as colunas novas vazias — isso é esperado.

**NOTIFICACOES** — aba nova, cabeçalho:
`notif_id | usuario | tipo | titulo | corpo | link | lida | criada_em`

## Passo 5 — publicar nova versão da implantação existente

1. **Implantar** → **Gerenciar implantações** (não "Nova implantação").
2. Na implantação que **já existe** do tipo "App da Web", clique no **lápis**.
3. Em **Versão**, escolha **Nova versão** (primeira opção, acima dos números).
4. Descrição: `Fase 5 passos 1-4 — papeis, avisos, inteiro na requisicao`
5. **Não toque** em "Executar como" nem em "Quem pode acessar".
6. Clique em **Implantar**.

## Passo 6 — confirmar que a URL não mudou

Copie a URL do app da web e me mostre. Tem que conter
`AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg`.

Se for diferente, você criou implantação nova. **Me avise imediatamente.**

## Ao final, me relate

- Linhas do arquivo e se os cinco trechos do Passo 2 foram encontrados
- Os dois números de linhas que anotou antes da migração
- O log do `migrarUsuariosEPapeis`
- Os três cabeçalhos do Passo 4, e se as colunas antigas ficaram intactas
- Número da versão nova e a URL
- Qualquer erro ou tela inesperada

---

## O que muda com este deploy

**Papéis.** USUARIOS ganha `papel` (ADMIN/OPERADOR), `pode_atribuir_tarefa` e
`papel_operacional`. Permissão deixa de depender de nome de pessoa: quem recebe aviso de
requisição é quem tiver `papel_operacional = SEPARADOR`, e trocar isso é editar a planilha,
não o código.

**Avisos in-app.** Aba NOTIFICACOES e uma função `notificar()` que é a única porta de saída
de aviso. Canal único dentro do app — nenhum push, nenhum service worker, nenhuma permissão
de navegador. Ela nunca lança: se a gravação do aviso falhar, a operação que a chamou segue.

**Inteiro na requisição.** Bug em produção: existe requisição gravada com 12,4 / 12,3 /
12,2. Agora quantidade de requisição tem que ser inteiro positivo, validado no servidor, e
um item inválido recusa a requisição inteira nomeando o item — sem arredondar em silêncio.
A contagem não foi tocada: 0,8 de garrafa aberta continua válido.

**Autoria da requisição.** Quem pediu, quando, e a data operacional (movimento antes das
06:00 pertence ao dia anterior — a casa opera depois da meia-noite). Autoria é imutável:
reenviar o mesmo req_id atualiza itens e preserva o autor original.

Os testes de aceite rodam contra este mesmo arquivo com `npm test`, num simulador de Apps
Script, e passam.
