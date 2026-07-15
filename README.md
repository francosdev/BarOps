# Ephigenia Inventário

Aplicação web para controle operacional de inventário de bar, criada para agilizar contagens por setor, consolidar histórico, exportar relatórios e sincronizar dados com uma planilha Google Sheets por meio de Google Apps Script.

O projeto foi pensado para uso em operação real: funciona bem em telas móveis, mantém rascunhos no navegador, separa permissões por perfil e reduz o trabalho manual de transcrição das contagens.

## Principais recursos

- Login por usuário e PIN, com perfis de `admin` e `lider`.
- Controle de acesso por setor: `22`, `23`, `Chivas`, `Cozinha` e `Estoque`.
- Criação de inventários por data, bar/setor, turno e tipo de contagem.
- Tipos de inventário: `Abertura`, `Fechamento` e `Inventário geral`.
- Catálogo inicial de produtos com categoria, unidade, fornecedor, par stock, preço unitário e setores habilitados.
- Rascunho automático da contagem em andamento usando `localStorage`.
- Revisão antes do envio para evitar fechamento incompleto.
- Envio para Google Sheets via Web App do Apps Script.
- Consulta de estoque atual a partir da planilha.
- Histórico local de inventários finalizados.
- Exportação de inventários em `.xlsx`, `.pdf` e `.csv`.
- Gestão administrativa de produtos, usuários e integração com a planilha.

## Stack

- [React](https://react.dev/)
- [Vite](https://vite.dev/)
- JavaScript moderno com módulos ES
- CSS puro e responsivo
- `xlsx` para exportação Excel
- `jspdf` e `jspdf-autotable` para exportação PDF
- Google Apps Script para integração com Google Sheets

## Estrutura do projeto

```text
.
+-- google-apps-script/
|   +-- Code.gs              # Web App do Apps Script usado pela planilha
+-- src/
|   +-- assets/
|   |   +-- ephigenia.jpg    # Logotipo usado na tela de login
|   +-- main.jsx             # Aplicação React, regras de negócio e telas
|   +-- styles.css           # Estilos globais e responsividade
+-- index.html               # Entrada do Vite
+-- package.json             # Scripts e dependências
+-- package-lock.json
```

## Requisitos

- Node.js 18 ou superior.
- npm.
- Uma planilha Google Sheets operacional.
- Um projeto Google Apps Script publicado como aplicativo web para habilitar a sincronização.

## Instalação

Clone o repositório e instale as dependências:

```bash
npm install
```

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

Por padrão, o Vite disponibiliza a aplicação em uma URL local exibida no terminal. O script `start` fixa a porta `5173`:

```bash
npm start
```

## Scripts disponíveis

```bash
npm run dev
```

Executa o Vite em modo de desenvolvimento.

```bash
npm start
```

Executa o Vite em `0.0.0.0` na porta `5173`, útil para testar em outros dispositivos da rede.

```bash
npm run build
```

Gera a versão de produção em `dist/`.

```bash
npm run preview
```

Serve localmente o build gerado para conferência.

## Acesso inicial

O projeto cria automaticamente um usuário administrador inicial quando não há usuários salvos no navegador:

```text
Usuário: Admin
PIN: 2708
Perfil: admin
```

Após o primeiro acesso, cadastre os usuários reais na tela **Usuários** e substitua o PIN padrão.

## Como usar

1. Faça login com um usuário ativo.
2. Clique em **Novo inventário**.
3. Informe data, setor, tipo de inventário e turno.
4. Preencha as contagens por categoria.
5. Revise os itens antes de finalizar.
6. Envie para a planilha, quando a integração estiver configurada.
7. Acompanhe inventários finalizados em **Histórico**.

Usuários com perfil `lider` acessam apenas os setores permitidos. Usuários `admin` também acessam histórico, produtos, usuários, estoque atual e configuração da planilha.

## Integração com Google Sheets

A integração fica dividida em duas partes:

- Frontend React: envia os inventários e consulta o estoque.
- `google-apps-script/Code.gs`: recebe as requisições, valida o token, localiza produtos na planilha e grava os valores.

### Configurar o Apps Script

1. Abra a planilha operacional no Google Sheets.
2. Acesse **Extensões > Apps Script**.
3. Copie o conteúdo de `google-apps-script/Code.gs` para o editor.
4. Confirme o valor de `SPREADSHEET_ID`.
5. Execute `testarAcessoPlanilha()` uma vez para autorizar o script.
6. Publique como **Aplicativo da Web**.
7. Configure o acesso conforme a necessidade da operação.
8. Copie a URL terminada em `/exec`.
9. No app, entre como admin e cole a URL em **Planilha**.
10. Use **Testar** para validar a conexão.

### Como a gravação funciona

O app envia apenas itens contados, com quantidade maior que zero ou com observação. O Apps Script:

- valida o token da aplicação;
- escolhe a aba de destino;
- procura o produto pela coluna A;
- grava o total na coluna `Fecha`;
- soma múltiplas contagens do mesmo dia;
- cria registros de auditoria na aba `LOG_APP`;
- retorna os produtos não encontrados.

As abas operacionais esperadas incluem:

- `SEXTA`
- `SABADO`
- `DOMINGO`
- `ESTOQUE GERAL` para consulta de estoque

## Persistência de dados

O app usa `localStorage` para manter dados locais no navegador:

- usuário atual;
- usuários cadastrados;
- catálogo de produtos;
- inventários finalizados;
- rascunho em andamento;
- configurações de integração;
- movimentações locais.

Isso permite uso rápido sem backend próprio, mas também significa que dados locais dependem do navegador/dispositivo. Para operação crítica, mantenha a planilha sincronizada e exporte relatórios regularmente.

## Exportações

Na tela de detalhes do inventário, o admin pode gerar:

- Excel (`.xlsx`);
- PDF (`.pdf`);
- CSV (`.csv`).

Os relatórios incluem produto, categoria, quantidade contada, estoque atual, diferença e data.

## Build e publicação

Gere o build de produção:

```bash
npm run build
```

O resultado fica em `dist/` e pode ser publicado em serviços de hospedagem estática, como Netlify, Vercel, Cloudflare Pages ou Firebase Hosting.

Antes de publicar, revise:

- URL atual do Apps Script;
- ID da planilha;
- token compartilhado entre frontend e Apps Script;
- permissões do Web App;
- usuário administrador inicial;
- catálogo e par stock dos produtos.

## Segurança e manutenção

Este projeto é uma aplicação estática e atualmente mantém a URL de integração e o token no código do frontend. Isso simplifica a operação, mas não deve ser tratado como segredo forte em ambientes públicos.

Recomendações:

- troque o PIN do admin inicial após o primeiro acesso;
- restrinja o acesso ao Web App do Apps Script quando possível;
- mantenha o token do frontend e do Apps Script sempre iguais;
- registre alterações de catálogo antes de eventos importantes;
- valide produtos não encontrados na aba `LOG_APP`;
- faça backup periódico da planilha operacional.

## Desenvolvimento

O arquivo principal `src/main.jsx` concentra a aplicação, incluindo:

- normalização e migração de dados locais;
- catálogo inicial;
- autenticação;
- criação e revisão de inventários;
- exportações;
- envio e consulta via Apps Script;
- telas administrativas.

Os estilos ficam em `src/styles.css`, com foco em uso mobile, contraste alto e botões grandes para operação em campo.

## Roadmap sugerido

- Mover token e URL para variáveis de ambiente no build.
- Separar regras de negócio em módulos menores.
- Adicionar testes automatizados para normalização, envio e matching de produtos.
- Criar backend dedicado caso a operação precise de multiusuário em tempo real.
- Implementar backup/importação de dados locais.
- Reativar o fluxo de retirada de estoque quando a regra operacional estiver definida.

## Licença

Defina aqui a licença do projeto antes de distribuir publicamente.
