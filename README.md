# Encurtador de URL

Encurtador de URL full-stack construído com Next.js 15 (App Router), TypeScript e MongoDB Atlas. Recebe um link longo, gera um código curto de 8 caracteres e redireciona com HTTP 302 preservando a contagem de cliques. API REST inspecionável + interface React leve estilizada com Tailwind.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

> **Demo**: https://simple-shortener-nine.vercel.app/

---

## Funcionalidades

- **Encurtar URL**: valida um link longo e o transforma num código curto de 8 caracteres
- **Redirect 302**: o código curto redireciona para a URL original preservando analytics
- **Contagem de cliques**: cada acesso incrementa um contador atômico no banco
- **Health check**: endpoint de status com ping real ao banco e latência medida

---

## Stack

- **Next.js 15**: App Router e Route Handlers
- **TypeScript**
- **MongoDB Atlas** + **Mongoose**
- **Tailwind CSS**: interface
- **nanoid**: geração do código curto

---

## Endpoints da API

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/shorten` | `POST` | Cria um link curto a partir de uma URL |
| `/[shortCode]` | `GET` | Redireciona para a URL original (302) e incrementa cliques |
| `/api/health` | `GET` | Status do serviço + ping ao banco |

### `POST /api/shorten`

**Request:**

```json
{ "url": "https://www.google.com" }
```

**Response `201`:**

```json
{ "shortUrl": "http://localhost:3000/MQ5epFi0" }
```

| Status | Quando |
|---|---|
| `201` | Link criado com sucesso |
| `400` | Body ausente/malformado ou URL fora do padrão `http`/`https` |
| `503` | Falha de conexão com o banco |

### `GET /[shortCode]`

Redireciona para a URL original com **HTTP 302** e incrementa `clicks` na mesma operação. Código inexistente retorna `404` em JSON.

### `GET /api/health`

Retorna `200` quando o banco responde ao ping (com a latência medida) e `503` quando está inacessível. Não expõe dados internos, serve para monitores externos.

---

## Decisões de arquitetura

Algumas notas sobre o porquê de certas escolhas técnicas.

### Conexão serverless: cache em `globalThis`

Ambientes serverless reutilizam containers entre requisições (warm start) e o hot reload do Next mantém o processo vivo em desenvolvimento. Sem cache, cada requisição abriria uma conexão nova e esgotaria o pool do Atlas (~500 no free tier). A conexão é cacheada em `globalThis`, que sobrevive tanto ao warm start quanto ao hot reload.

Três detalhes fecham as arestas:

- **Cacheia a `promise`, não só a conexão**: dois requests simultâneos num cold start compartilham a mesma promise em vez de abrir duas conexões (elimina uma race condition).
- **`bufferCommands: false`**: falha rápida e explícita, em vez de enfileirar queries por 10s mascarando um erro de conexão.
- **Reset da promise no `catch`**: sem isso, uma promise rejeitada envenenaria todos os requests seguintes do mesmo container.

O mesmo princípio protege o registro de models com a guarda `mongoose.models.Url || mongoose.model(...)`: o registro global do Mongoose sobrevive ao hot reload, e re-registrar o model estouraria `OverwriteModelError`.

### Geração do código curto: `nanoid`

Escolhido em vez de ID incremental, UUID ou `Math.random()`:

- **Incremental** é enumerável: expõe volume e permite varredura sequencial (privacidade).
- **UUID** é longo demais para uma URL curta.
- **`Math.random()`** não é criptograficamente seguro.

`nanoid` é URL-safe, resistente a colisão e padrão da indústria. O comprimento (8 caracteres, ~281 trilhões de combinações) fica numa constante nomeada `SHORT_CODE_LENGTH`: é decisão de design, não configuração de ambiente, então vive no código versionado e não numa variável de ambiente.

### Validação e segurança de entrada

A URL recebida é validada com o parser nativo `new URL()`, não com regex: regex de URL é notoriamente frágil, e o parser entrega o `protocol` de graça. Sobre ele, uma **allowlist de esquema**: apenas `http` e `https` passam. Isso bloqueia `javascript:`, `file:` e `data:`, sem essa barreira o redirect se tornaria um vetor de XSS.

Allowlist em vez de blocklist porque blocklist sempre tem lacunas: ou o valor prova ser o que deve ser, ou não entra.

### Redirect 302 e contagem atômica

O redirect usa **HTTP 302 explícito, nunca 301**. Um 301 é cacheado permanentemente pelo navegador: os cliques seguintes nunca chegariam ao servidor e a contagem morreria. O 302 garante que toda visita passe pelo backend.

A cada acesso, o contador é incrementado com `findOneAndUpdate` + `$inc: { clicks: 1 }`, uma operação atômica no banco. Isso elimina a race condition de cliques simultâneos (que um padrão read-modify-write teria) e resolve tudo em uma única ida ao banco em vez de duas, o que importa em serverless, onde latência de rede conta.

### Contrato HTTP semântico

As respostas usam status codes que significam o que dizem: `201` (criado), `400` (entrada inválida), `404` (código inexistente), `503` (banco indisponível). Colisão de código (erro `E11000` do banco) é o **único** caso que dispara retry, até 3 tentativas de gerar outro código. Qualquer outro erro é relançado, porque mascarar erro de banco com retry esconde bugs.

A URL de resposta é montada com `request.nextUrl.origin`, sem hardcode de host. O mesmo código funciona em `localhost` e no domínio de produção sem alteração.

### Health check honesto

O `/api/health` faz um ping real ao servidor via `admin().ping()`. Um check ingênuo seria enganoso: por causa do cache de conexão, o app poderia reportar "saudável" com o banco caído. O ping força uma ida real ao servidor e mede a latência. Contrato `200`/`503` pensado para monitores externos.

### Fronteira cliente/servidor no frontend

No App Router, todo componente é Server Component por padrão: renderiza no servidor e envia zero JavaScript ao navegador. Apenas o formulário, que precisa de `useState` e handlers de evento, é marcado com `"use client"`. A página permanece Server Component; só a ilha interativa é hidratada no cliente. Isso mantém o bundle enviado ao navegador mínimo.

---

## Setup local

### Pré-requisitos

- Node.js 18+
- Uma conta no [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier serve), com um cluster e um usuário de banco criados

### Variáveis de ambiente

Crie um `.env.local` na raiz:

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.xxxxx.mongodb.net/nomedobanco?retryWrites=true&w=majority
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `MONGODB_URI` | Sim | String de conexão do MongoDB Atlas. **Inclua o nome do banco no path**: sem ele, o Mongoose conecta silenciosamente no banco `test`. |

### Iniciar

```bash
git clone https://github.com/the-matt-augusto/url-shortener.git
cd url-shortener
npm install
npm run dev
```

A aplicação fica disponível em `http://localhost:3000`.

---

## Testando a API

Testes manuais via `curl` (validação usada durante o desenvolvimento):

```bash
# Criar link curto
curl -i -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com"}'

# Seguir o redirect (deve responder 302)
curl -i http://localhost:3000/MQ5epFi0

# Código inexistente (deve responder 404 em JSON)
curl -i http://localhost:3000/naoexiste
```

> Testes automatizados (Vitest/Playwright) estão no roadmap.

---

## Deploy na Vercel

O `.env.local` **não** é versionado, então a Vercel não o enxerga. Cadastre `MONGODB_URI` manualmente em **Settings → Environment Variables** antes de confiar no site: sem isso, a página carrega normalmente, mas qualquer operação que dependa do banco falha (o "banco morto"). Em produção, prefira o formato `mongodb+srv://`, que a Vercel resolve nativamente e que se mantém válido caso o Atlas remaneje o cluster.

---

## Roadmap

- Rate limiting no `POST /api/shorten`
- Expiração de links via índice TTL do MongoDB
- Dashboard de analytics por link (o `$inc` atômico já é a fundação)
- Testes automatizados das rotas

---

## Licença

[AGPL-3.0](LICENSE): código aberto, mas qualquer uso, **inclusive rodar como serviço web**, exige disponibilizar o código-fonte sob a mesma licença.

## Contato

**GitHub**: [@the-matt-augusto](https://github.com/the-matt-augusto)
