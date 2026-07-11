# Encurtador de URL

Encurtador de URL full-stack construído com Next.js 15 (App Router), TypeScript e MongoDB Atlas. Recebe um link longo, gera um código curto de 8 caracteres e redireciona com HTTP 302 preservando a contagem de cliques. Inclui **rate limiting** na criação e **expiração automática de links** via índice TTL, com duração configurável por requisição. API REST inspecionável + interface React leve estilizada com Tailwind.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

---

## Funcionalidades

- **Encurtar URL**: valida um link longo e o transforma num código curto de 8 caracteres
- **Redirect 302**: o código curto redireciona para a URL original preservando analytics
- **Contagem de cliques**: cada acesso incrementa um contador atômico no banco
- **Expiração de links (TTL)**: cada link expira automaticamente e é removido pelo próprio banco; a duração é configurável por requisição (24h por padrão), mantendo a base enxuta sozinha
- **Rate limiting**: o endpoint de criação é protegido contra flood, por IP, na edge da Vercel
- **Health check**: endpoint de status com ping real ao banco e latência medida

---

## Stack

- **Next.js 15**: App Router e Route Handlers
- **TypeScript**
- **MongoDB Atlas** + **Mongoose**
- **Tailwind CSS**: interface
- **nanoid**: geração do código curto
- **@vercel/firewall**: rate limiting na edge (Vercel WAF)

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
{ "url": "https://www.google.com", "ttlSeconds": 3600 }
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `url` | Sim | Link a ser encurtado. Precisa ser uma URL `http`/`https` válida. |
| `ttlSeconds` | Não | Tempo de vida do link, em segundos. Omitido → **24h** (default). Quando presente, precisa ser um inteiro entre **60** (1 min) e **2592000** (30 dias); fora dessa faixa retorna `400`. |

**Response `201`:**

```json
{
  "shortUrl": "http://localhost:3000/MQ5epFi0",
  "expiresAt": "2026-07-11T00:57:34.000Z"
}
```

| Status | Quando |
|---|---|
| `201` | Link criado com sucesso |
| `400` | Body ausente/malformado, URL fora do padrão `http`/`https`, ou `ttlSeconds` inválido (não-inteiro ou fora da faixa 60–2592000) |
| `429` | Limite de requisições excedido (rate limiting) |
| `503` | Falha de conexão com o banco |

> A duração máxima é limitada a 30 dias de propósito: não há opção pública de link "permanente", garantindo que a política de expiração (banco que se limpa sozinho) valha para toda criação vinda da API.

### `GET /[shortCode]`

Redireciona para a URL original com **HTTP 302** e incrementa `clicks` na mesma operação. Código inexistente (ou já expirado e removido pelo TTL) retorna `404` em JSON.

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

Além do cache, a conexão fixa um **`maxPoolSize` pequeno** (10). Como cada instância concorrente da Vercel mantém seu próprio pool e o Atlas free/shared corta em 500 conexões, limitar o pool por instância mantém a aritmética sã sob escalonamento horizontal (ex.: 40 instâncias × 10 = 400). O valor não é `1` de propósito: `1` não reduz o total de conexões e ainda prejudica a concorrência do modelo de compute da Vercel, que reusa a conexão entre requests da mesma instância.

O mesmo princípio do cache protege o registro de models com a guarda `mongoose.models.Url || mongoose.model(...)`: o registro global do Mongoose sobrevive ao hot reload, e re-registrar o model estouraria `OverwriteModelError`.

### Geração do código curto: `nanoid`

Escolhido em vez de ID incremental, UUID ou `Math.random()`:

- **Incremental** é enumerável: expõe volume e permite varredura sequencial (privacidade).
- **UUID** é longo demais para uma URL curta.
- **`Math.random()`** não é criptograficamente seguro.

`nanoid` é URL-safe, resistente a colisão e padrão da indústria. O comprimento (8 caracteres, ~281 trilhões de combinações) fica numa constante nomeada `SHORT_CODE_LENGTH`: é decisão de design, não configuração de ambiente, então vive no código versionado e não numa variável de ambiente.

### Validação e segurança de entrada

A URL recebida é validada com o parser nativo `new URL()`, não com regex: regex de URL é notoriamente frágil, e o parser entrega o `protocol` de graça. Sobre ele, uma **allowlist de esquema**: apenas `http` e `https` passam. Isso bloqueia `javascript:`, `file:` e `data:`, sem essa barreira o redirect se tornaria um vetor de XSS.

Allowlist em vez de blocklist porque blocklist sempre tem lacunas: ou o valor prova ser o que deve ser, ou não entra.

O mesmo rigor vale para o `ttlSeconds`, que vem do cliente e portanto é input externo como qualquer outro. Ele é validado com `Number.isInteger` — uma checagem única que rejeita string, float, `NaN` e `Infinity` de uma vez (cobrindo tipo *e* forma) — e limitado à faixa `[60, 2592000]`. O piso de 60s não é arbitrário: casa com a granularidade do processo de expiração do MongoDB (ver abaixo); prometer um TTL menor seria uma promessa que o banco não cumpre.

### Rate limiting na edge

O `POST /api/shorten` é protegido por rate limiting via **Vercel WAF**, acionado no código com o pacote `@vercel/firewall`. A regra (limite e ação) vive no dashboard da Vercel e recebe um ID; a rota chama `checkRateLimit` com esse ID como **primeira operação** do handler, antes de parsear o body ou tocar no banco — a requisição barrada é a mais barata possível. Se o limite estoura, a resposta é `429`.

Duas escolhas valem nota:

- **WAF nativo em vez de um store externo (ex.: Redis)**: para o perfil de carga de um encurtador, manter uma infraestrutura de rate limiting à parte seria desproporcional. A trava roda na edge, antes mesmo da função — protege *e* economiza invocação.
- **Chave por IP resolvida na edge**: sem passar chave customizada, o SDK usa o IP real que a Vercel determina, eliminando a necessidade (e a fragilidade) de parsear o header `X-Forwarded-For`, que é spoofável.

### Expiração de links: índice TTL do MongoDB

Cada documento carrega um campo opcional `expiresAt` (um `Date`), e a coleção tem um índice TTL declarado com `expireAfterSeconds: 0` — que instrui o MongoDB a expirar o documento exatamente na data guardada no campo. Um processo de fundo do banco (o *TTLMonitor*) varre a coleção a cada ~60s e remove os documentos vencidos, sem intervenção da aplicação.

A remoção não é instantânea ao segundo: um documento pode viver até ~60s além do vencimento, até a próxima varredura. Para limpeza de base, essa imprecisão é irrelevante.

### Redirect 302 e contagem atômica

O redirect usa **HTTP 302 explícito, nunca 301**. Um 301 é cacheado permanentemente pelo navegador: os cliques seguintes nunca chegariam ao servidor e a contagem morreria. O 302 garante que toda visita passe pelo backend.

A cada acesso, o contador é incrementado com `findOneAndUpdate` + `$inc: { clicks: 1 }`, uma operação atômica no banco. Isso elimina a race condition de cliques simultâneos (que um padrão read-modify-write teria) e resolve tudo em uma única ida ao banco em vez de duas, o que importa em serverless, onde latência de rede conta.

### Contrato HTTP semântico

As respostas usam status codes que significam o que dizem: `201` (criado), `400` (entrada inválida), `404` (código inexistente), `429` (limite excedido) e `503` (banco indisponível). Colisão de código (erro `E11000` do banco) é o **único** caso que dispara retry, até 3 tentativas de gerar outro código. Qualquer outro erro é relançado, porque mascarar erro de banco com retry esconde bugs.

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

> **Nota sobre o rate limiting**: a proteção do `POST /api/shorten` é aplicada pela edge da Vercel via Vercel WAF, e por isso **não é enforçada em desenvolvimento local** — localmente as requisições sempre passam. Em produção, ela depende de uma regra de rate limiting configurada no dashboard da Vercel (Firewall), cujo ID precisa coincidir com o usado no código. O restante da aplicação roda normalmente em local.

---

## Testando a API

Testes manuais via `curl` (validação usada durante o desenvolvimento):

```bash
# Criar link curto com o TTL padrão (24h)
curl -i -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com"}'

# Criar link curto com TTL customizado (1 hora)
curl -i -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com", "ttlSeconds": 3600}'

# ttlSeconds fora da faixa (deve responder 400)
curl -i -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com", "ttlSeconds": 10}'

# Seguir o redirect (deve responder 302)
curl -i http://localhost:3000/MQ5epFi0

# Código inexistente (deve responder 404 em JSON)
curl -i http://localhost:3000/naoexiste
```

> Testes automatizados (Vitest/Playwright) estão no roadmap.

---

## Roadmap

Entregue:

- [x] Encurtamento + redirect 302 com contagem atômica de cliques
- [x] Rate limiting no `POST /api/shorten` (Vercel WAF)
- [x] Expiração de links via índice TTL, com duração configurável por requisição (`ttlSeconds`)
- [x] Health check com ping real ao banco e latência medida

Planejado (pós-MVP):

- [ ] Página 404 amigável para links inexistentes ou já expirados (hoje é JSON)
- [ ] Botão de copiar o link curto no resultado
- [ ] Dashboard de analytics por link (o `$inc` atômico já é a fundação)
- [ ] Testes automatizados das rotas (Vitest)
- [ ] Monitor externo de uptime no `/api/health`
- [ ] Pooling de conexão sob carga (`attachDatabasePool`) quando o volume de tráfego justificar
- [ ] Domínio curto próprio para links mais enxutos

---

## Licença

[AGPL-3.0](LICENSE): código aberto, mas qualquer uso, **inclusive rodar como serviço web**, exige disponibilizar o código-fonte sob a mesma licença.

## Contato

**GitHub**: [@the-matt-augusto](https://github.com/the-matt-augusto)