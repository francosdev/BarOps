# Prompt para a extensão do Claude no Chrome

Cole o texto entre as linhas abaixo na extensão, **com a aba do Apps Script já aberta**.

Antes de colar, copie o conteúdo de `google-apps-script/Code.gs` (abra no VS Code,
`Ctrl+A`, `Ctrl+C`) — a extensão não lê arquivos do seu computador, então o código
precisa ir junto na conversa. Cole o prompt primeiro e o código logo em seguida.

---

Você vai atualizar um Google Apps Script **que está em produção**. Ele é o backend de um
app de inventário de bar que roda em `inventario-ephigenia.netlify.app` e grava contagens
reais numa planilha. Se você quebrar, a equipe do bar não consegue mais enviar contagem.
Trabalhe com cuidado e confirme cada passo antes de seguir para o próximo.

## O que precisa acontecer

O arquivo `Code.gs` do projeto precisa ser substituído por uma versão nova, e depois duas
funções precisam ser executadas e uma nova versão da implantação precisa ser publicada.

O código novo vai na mensagem seguinte a esta. São cerca de 774 linhas.

## Regras que não podem ser quebradas

1. **NUNCA crie uma implantação nova.** A URL da implantação atual está gravada dentro do
   app publicado. Criar uma implantação nova gera uma URL nova e o app para de funcionar.
   Você deve **editar a implantação existente** e criar uma **nova versão** dela. A URL tem
   que continuar terminando em:
   `AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg/exec`

2. **Não altere nenhuma constante do topo do arquivo.** Em especial `APP_TOKEN` e
   `SENHA_SALT`. Mudar o token derruba a conexão com o app; mudar o sal invalida todas as
   senhas já cadastradas. Cole o código exatamente como recebeu.

3. **Substitua o conteúdo inteiro do arquivo**, não faça edições parciais. Selecione tudo
   no editor (`Ctrl+A`) e cole por cima. Colagem parcial deixa o arquivo com sintaxe
   quebrada.

4. **Pare e me pergunte** se: o projeto que abrir não for o descrito abaixo, houver mais de
   uma implantação ativa, aparecer erro de sintaxe ao salvar, ou qualquer função devolver
   erro. Não tente contornar sozinho.

## Passo 1 — confirmar que é o projeto certo

No editor do Apps Script, confira que a primeira linha do `Code.gs` atual é:

```
const SPREADSHEET_ID = "1RHbLyanJ9I56JMlBsaMOGWu6V4atnwKjtsb50Ja0XCQ";
```

Se não for esse ID, **pare e me avise**.

## Passo 2 — substituir o código

Clique no editor, selecione tudo com `Ctrl+A` e cole o código novo por cima. Salve com
`Ctrl+S` e confirme que o ícone de "salvando" sumiu sem erro.

O Apps Script guarda histórico de versões automaticamente, então a versão antiga fica
recuperável — mas confirme que salvou antes de seguir.

## Passo 3 — testar o acesso à planilha

No seletor de função (dropdown ao lado do botão Executar), escolha `testarAcessoPlanilha`
e clique em **Executar**.

Se pedir autorização, autorize com a conta dona da planilha. É esperado: o código novo usa
`Utilities.computeDigest` para o hash de senha.

Abra o log de execução e confirme que apareceu o nome da planilha e a lista de abas.
Me diga quais abas ele listou.

## Passo 4 — criar as abas novas

Selecione a função `criarAbasBase` e clique em **Executar**. Ela cria três abas, se ainda
não existirem, e não apaga nada — pode rodar quantas vezes quiser.

Depois abra a planilha e confirme que existem três abas novas com estes cabeçalhos exatos
na primeira linha:

- **PRODUTOS**: `produto_id | nome_canonico | categoria | unidade | fator_pack | pack_nome | fornecedor | minimo | ativo | requisitavel | produzido`
- **USUARIOS**: `usuario_id | nome | login | senha_hash | perfil | ativo`
- **MOVIMENTOS**: `mov_id | timestamp | tipo | origem | destino | produto_id | qtd | unidade | usuario_id | ref_documento | obs`

A aba USUARIOS nasce vazia de propósito — não invente nenhum usuário nela.

## Passo 5 — publicar nova versão da implantação existente

1. Clique em **Implantar** → **Gerenciar implantações** (não "Nova implantação").
2. Localize a implantação ativa do tipo "App da Web".
3. Clique no ícone de **lápis** (Editar) no canto superior direito do painel.
4. Em **Versão**, escolha **Nova versão**.
5. Na descrição, escreva: `Fase 1, 2 e 4A — abas base, espelho de movimentos, catálogo`
6. Confirme que **"Quem pode acessar"** está como **"Qualquer pessoa"**. O front no Netlify
   chama sem autenticação; se estiver restrito, o app quebra.
7. Clique em **Implantar**.

## Passo 6 — confirmar que a URL não mudou

Depois de implantar, copie a URL do app da web que aparece e me mostre. Ela **tem que**
conter `AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg`.

Se a URL for diferente, você criou uma implantação nova em vez de uma versão nova.
**Me avise imediatamente** — o app precisará ser reconstruído com a URL nova.

## Ao final, me relate

- As abas que o `testarAcessoPlanilha` listou
- Se as três abas novas foram criadas e com os cabeçalhos certos
- A URL da implantação depois do deploy
- Qualquer erro ou tela inesperada que tenha aparecido

---

## Depois que a extensão terminar (você faz no app, não a extensão)

1. Abra o app e entre como Admin.
2. **Planilha** → **Testar**. Deve responder "Conexão OK. Planilha acessível: ...".
3. **Base da planilha** → **Criar abas**. Isso semeia PRODUTOS com os 36 produtos que as
   fichas técnicas exigem — as 6 produções, os 5 pré-batches e os insumos.
4. **Usuários da planilha** → cadastre seu usuário com senha e perfil admin.
5. **Movimentos** → **Atualizar**. Deve abrir vazio, sem erro.

Só depois disso o login por senha passa a valer. Até lá, o PIN local (Admin / 2708)
continua sendo a reserva.

## Observação de segurança

O `APP_TOKEN` viaja dentro do JavaScript publicado no Netlify. Qualquer pessoa que abra o
site consegue lê-lo e chamar estas rotas direto, inclusive `usuarios.salvar`. Enquanto for
assim, o login serve para saber quem fez o quê, não para impedir quem não deveria.
Fechar isso exige exigir login e senha de admin nas rotas de escrita.

---

# Prompt de verificação (usar quando as rotas novas não respondem)

Sintoma que motiva este diagnóstico: no app, "Base da planilha" → "Ler catálogo" responde
**"Aba destino nao informada."**. Essa frase só existe no caminho antigo do script, o que
significa que a implantação no ar não tem o roteador `ROTAS`. O ping continuar funcionando
não desmente isso — ele é idêntico nas duas versões.

Cole na extensão, com a aba do Apps Script aberta:

---

Preciso descobrir por que a versão nova de um Google Apps Script não está no ar, e
corrigir. O código foi colado e salvo, e duas funções foram executadas com sucesso, mas as
rotas novas continuam respondendo como a versão antiga. A suspeita é que a **implantação**
está servindo uma versão anterior do código.

Não altere o código. Este trabalho é de diagnóstico e de implantação apenas.

## Verificação A — o editor tem o código novo?

No editor, procure no `Code.gs` (use `Ctrl+F`) por estes quatro trechos. Me diga, um por
um, se cada um foi encontrado e em que linha:

1. `const TIPOS_SEM_SALDO`
2. `function criarAbasBase()`
3. `const ROTAS = {`
4. `function calcularSaldos`

Para referência, no arquivo correto eles estão por volta das linhas 37, 49, 209 e 434, e o
arquivo tem cerca de 774 linhas no total. Me diga também quantas linhas o arquivo tem.

**Se algum dos quatro não for encontrado**, o código não foi salvo corretamente. Pare e me
avise — não tente consertar.

## Verificação B — as abas foram criadas?

Abra a planilha vinculada e me diga se existem estas três abas, e quais são os títulos da
primeira linha de cada uma:

- PRODUTOS
- USUARIOS
- MOVIMENTOS

## Verificação C — qual versão a implantação está servindo?

1. **Implantar** → **Gerenciar implantações**.
2. Me diga quantas implantações aparecem e, para a do tipo "App da Web", qual o **número da
   versão** que está escrito nela.
3. Clique no ícone de **lápis** (Editar).
4. Abra o dropdown **Versão** e me diga **todos** os números de versão que aparecem na
   lista e qual está selecionado no momento.

Este é o ponto mais provável do problema: se o dropdown estiver com um número fixo em vez
de refletir o código salvo, é a versão antiga que está sendo servida.

## Correção — criar uma versão nova

Ainda na tela de editar a implantação:

1. Em **Versão**, selecione **"Nova versão"** (é a primeira opção da lista, acima dos
   números).
2. Descrição: `Rotas da Fase 1, 2 e 4A`
3. Confirme que **"Quem pode acessar"** está em **"Qualquer pessoa"**.
4. Clique em **Implantar**.
5. Me diga o novo número de versão que apareceu e a URL do app da web.

A URL **tem que** continuar contendo
`AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg`.
Se mudou, você criou uma implantação nova em vez de uma versão nova — me avise na hora.

## Me relate ao final

- os quatro trechos da verificação A: achados ou não, e em que linhas
- o total de linhas do arquivo
- as três abas da verificação B e seus cabeçalhos
- quantas implantações existem e qual versão cada uma servia ANTES
- a lista de versões do dropdown e qual estava selecionada
- o número da versão nova e a URL depois de implantar

Não conclua que "está tudo certo" só porque a tela não deu erro. Me dê os números.
