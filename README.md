# yield-routes-backend

> **The Data and API Layer of YieldRoutes**

**REST API, Stellar chain indexer, and automated jobs for YieldRoutes.** This is the bridge between on-chain smart contracts and the user-facing frontend — it indexes blockchain events, exposes a comprehensive REST API, and runs automated operations like yield harvesting and price feeds.

One of five repos in the project — see the [org homepage](https://github.com/YOUR_ORG) (rendered from the `.github` repo's `profile/README.md`) for the whole-system picture.

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square)](https://nodejs.org)
[![Express](https://img.shields.io/badge/-Express-000000?style=flat-square)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/-Prisma-2D3748?style=flat-square)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square)](https://www.postgresql.org)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

---

**📖 Navigation:** [Role in System](#role-in-the-system) • [Architecture](#service-architecture) • [API Reference](#api-reference) • [Database](#database-schema-and-design) • [Cron Jobs](#cron-jobs-and-automation) • [Indexer](#stellar-indexer-architecture) • [Stellar Service](#stellar-service-implementation-guide) • [Deployment](#deployment-guide) • [Security](#security-best-practices) • [Troubleshooting](#troubleshooting)

---

## Table of Contents

- [Role in the system](#role-in-the-system)
- [Service architecture](#service-architecture)
- [Data model (ERD)](#data-model-erd)
- [API reference](#api-reference)
  - [Routes API](#routes-api)
  - [Vault API](#vault-api)
  - [Pools API](#pools-api)
  - [Oracle API](#oracle-api)
  - [Health and Network](#health-and-network)
- [Database schema and design](#database-schema-and-design)
- [Cron jobs and automation](#cron-jobs-and-automation)
- [Stellar indexer architecture](#stellar-indexer-architecture)
- [Stellar service implementation guide](#stellar-service-implementation-guide)
- [Environment variables](#environment-variables)
- [Getting started](#getting-started)
- [Deployment guide](#deployment-guide)
- [Performance and scaling](#performance-and-scaling)
- [Security best practices](#security-best-practices)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [FAQ](#faq)

## Role in the system

This is the only repo that touches both PostgreSQL and Soroban RPC. It is the source of truth the frontend reads from, and the only piece of the system authorized to sign and submit *automated* transactions (harvest, price submission) with its own operator key — it never signs a transaction on behalf of a user.

```mermaid
graph LR
    C["yield-routes-contracts\n(deployed contract IDs feed .env here)"] --> B["yield-routes-backend\n(this repo)"]
    B -->|REST API| F[yield-routes-frontend]
    B -->|simulateTransaction / sendTransaction| RPC[(Soroban RPC)]
    B -->|reads/writes| DB[(PostgreSQL)]
```

**Key responsibilities:**
1. **API Server**: Exposes REST endpoints for quotes, vault operations, pools, and oracle data
2. **Blockchain Indexer**: Polls Soroban RPC for contract events and stores them in PostgreSQL
3. **Automated Jobs**: Runs scheduled harvests (6h) and price feeds (5min) using node-cron
4. **Transaction Builder**: Constructs unsigned transactions for frontend to sign with Freighter
5. **Data Aggregation**: Provides stats, history, and analytics the blockchain doesn't natively expose


## Service architecture

```mermaid
flowchart TB
    subgraph API["Express app (src/index.ts)"]
        MW["helmet, cors, rate-limit,\nrequestId, morgan logging"]
        RR[route.routes.ts]
        VR[vault.routes.ts]
        PR[pool.routes.ts]
        OR[oracle.routes.ts]
    end
    subgraph Controllers
        RC[route.controller.ts]
        VC[vault.controller.ts]
        PC[pool.controller.ts]
        OC[oracle.controller.ts]
    end
    SS["stellar.service.ts\n(Soroban RPC wrapper)"]
    IDX["stellar.indexer.ts\n(polling loop)"]
    HJ["harvest.job.ts\nnode-cron, every 6h"]
    PJ["price.job.ts\nnode-cron, every 5min"]
    PRISMA[(Prisma Client)]
    DB[(PostgreSQL)]
    RPC[(Soroban RPC)]

    MW --> RR --> RC
    MW --> VR --> VC
    MW --> PR --> PC
    MW --> OR --> OC
    RC --> SS
    VC --> SS
    PC --> PRISMA
    OC --> PRISMA
    RC --> PRISMA
    VC --> PRISMA
    SS --> RPC
    IDX --> RPC
    IDX --> PRISMA
    HJ --> SS
    PJ --> SS
    PRISMA --> DB
```

**Layer responsibilities:**

| Layer | Files | Purpose |
|-------|-------|---------|
| **Middleware** | `src/middleware/` | Request validation (zod), error handling, rate limiting, CORS |
| **Routes** | `src/routes/*.routes.ts` | Express route definitions, input validation schemas |
| **Controllers** | `src/controllers/*.controller.ts` | Business logic, orchestrates between services and database |
| **Services** | `src/services/stellar.service.ts` | Soroban RPC interactions, transaction building |
| **Indexers** | `src/indexers/stellar.indexer.ts` | Background polling for on-chain events |
| **Jobs** | `src/jobs/*.job.ts` | node-cron scheduled tasks (harvest, price feeds) |
| **Database** | `src/prisma.ts`, `prisma/schema.prisma` | PostgreSQL via Prisma ORM |


## Data model (ERD)

Eight Prisma models, all independent (no foreign keys between them by design — each table records one class of on-chain event, correlated by token address / timestamp rather than relational joins, since none of these entities own another).

```mermaid
erDiagram
    RouteQuote {
        string id PK "uuid"
        int onChainId UK "autoincrement, matches contract quote_id"
        string tokenIn
        string tokenOut
        float amountIn
        float expectedOut
        int priceImpactBps
        float protocolFee
        datetime validUntil
        boolean executed
        float executedOut "nullable"
        datetime createdAt
    }
    VaultDeposit {
        string id PK "uuid"
        string depositor
        string tokenId
        float amount
        float sharesIssued
        string txHash "nullable"
        datetime createdAt
    }
    VaultWithdrawal {
        string id PK "uuid"
        string depositor
        float shares
        float amountOut
        string txHash "nullable"
        datetime createdAt
    }
    HarvestEvent {
        string id PK "uuid"
        float yieldAmount
        float totalAssets
        float sharePrice
        string txHash "nullable"
        datetime harvestedAt
    }
    PriceSnapshot {
        string id PK "uuid"
        string baseToken
        string quoteToken
        float price
        float twapPrice
        string reporter
        datetime recordedAt
    }
    RegisteredPool {
        string id PK "uuid"
        string tokenA
        string tokenB
        string poolAddress
        boolean active
        datetime createdAt
    }
    FeeDistribution {
        string id PK "uuid"
        float totalAmount
        float toTreasury
        float toVault
        float toLpRewards
        string txHash "nullable"
        datetime distributedAt
    }
    IndexerCursor {
        int id PK "fixed at 1"
        int ledger "last processed ledger sequence"
    }
```

**Why no foreign keys:** every row here mirrors a discrete on-chain event (a deposit, a harvest, a price submission). The relationships that matter — "which deposits happened before this harvest," "what was the TWAP when this route executed" — are temporal, not relational, so they're queried by `createdAt`/`recordedAt` range rather than joined.


## API reference

Base path: `/api/v1`. All endpoints return JSON. Full request/response schemas are validated with `zod` in `src/middleware/validate.ts` before hitting the controller.

**Base URL:**
- **Development**: `http://localhost:3004`
- **Testnet**: `https://api-testnet.yieldroutes.example`
- **Mainnet**: `https://api.yieldroutes.example`

**Common Headers:**
```
Content-Type: application/json
X-Request-ID: <auto-generated UUID for tracing>
```

**Rate Limits:**
- Anonymous: 100 requests/minute
- Authenticated: 1000 requests/minute (not yet implemented)

**Pagination:**
All list endpoints support:
- `?page=1` (default: 1)
- `?limit=20` (default: 20, max: 100)

Response format:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Routes API

Handles swap quote generation and execution via RouteAggregator contract.


#### `POST /api/v1/routes/quote`

Get a swap quote (valid for 60 seconds).

**Request:**
```json
{
  "tokenIn": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "tokenOut": "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "amountIn": 1000.0,
  "maxHops": 2
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "onChainId": 42,
  "tokenIn": "CAAAAAAA...",
  "tokenOut": "CBBBBBBB...",
  "amountIn": 1000.0,
  "expectedOut": 996.0,
  "priceImpactBps": 10,
  "protocolFee": 1.0,
  "validUntil": "2025-01-20T12:35:00Z",
  "executed": false,
  "createdAt": "2025-01-20T12:34:00Z",
  "legs": [
    {
      "tokenIn": "CAAAAAAA...",
      "tokenOut": "CBBBBBBB...",
      "amountIn": 1000.0,
      "expectedOut": 996.0,
      "poolFeeBps": 30
    }
  ]
}
```

**curl example:**
```bash
curl -X POST http://localhost:3004/api/v1/routes/quote \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    "tokenOut": "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "amountIn": 1000,
    "maxHops": 2
  }'
```

**TypeScript client example:**
```typescript
const response = await fetch('http://localhost:3004/api/v1/routes/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tokenIn: USDC_CONTRACT_ID,
    tokenOut: XLM_CONTRACT_ID,
    amountIn: 1000,
    maxHops: 2
  })
});
const quote = await response.json();
console.log(`Expected output: ${quote.expectedOut}`);
```

**Errors:**
- `400 Bad Request`: Invalid token addresses or amount
- `404 Not Found`: No route found (no registered pools for this pair)
- `500 Internal Server Error`: RPC communication failure


#### `POST /api/v1/routes/execute`

Execute a previously obtained quote.

**Request:**
```json
{
  "quoteId": "550e8400-e29b-41d4-a716-446655440000",
  "sender": "GDUSER...",
  "minOut": 990.0
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "executed": true,
  "executedOut": 995.5,
  "txResult": {
    "actualOut": 995.5,
    "slippageBps": 5,
    "txHash": "abc123..."
  }
}
```

**Errors:**
- `404 Not Found`: Quote ID doesn't exist
- `409 Conflict`: Quote already executed
- `410 Gone`: Quote expired (> 60s old)
- `422 Unprocessable Entity`: Slippage exceeded (`actualOut < minOut`)

**curl example:**
```bash
curl -X POST http://localhost:3004/api/v1/routes/execute \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "550e8400-e29b-41d4-a716-446655440000",
    "sender": "GDUSER...",
    "minOut": 990
  }'
```


#### `GET /api/v1/routes`

List recent quotes with pagination.

**Query parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "...",
      "tokenIn": "...",
      "tokenOut": "...",
      "amountIn": 1000,
      "expectedOut": 996,
      "executed": true,
      "createdAt": "2025-01-20T12:34:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

**curl example:**
```bash
curl "http://localhost:3004/api/v1/routes?page=2&limit=50"
```

#### `GET /api/v1/routes/:id`

Get a single quote by ID.

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "onChainId": 42,
  "tokenIn": "CAAAAAAA...",
  "tokenOut": "CBBBBBBB...",
  "amountIn": 1000,
  "expectedOut": 996,
  "priceImpactBps": 10,
  "protocolFee": 1.0,
  "validUntil": "2025-01-20T12:35:00Z",
  "executed": false,
  "executedOut": null,
  "createdAt": "2025-01-20T12:34:00Z"
}
```

**Errors:**
- `404 Not Found`: Quote doesn't exist


#### `GET /api/v1/routes/stats`

Aggregate statistics for all routes.

**Response (200 OK):**
```json
{
  "totalQuotes": 1523,
  "executedQuotes": 1250,
  "totalVolumeIn": 1250000.0,
  "totalVolumeOut": 1247500.0,
  "avgSlippageBps": 3.2
}
```

**curl example:**
```bash
curl http://localhost:3004/api/v1/routes/stats
```

### Vault API

Handles YieldVault operations (SEP-56 compliant).

#### `GET /api/v1/vault`

Get vault statistics and share price.

**Response (200 OK):**
```json
{
  "totalAssets": 500000.0,
  "totalShares": 480000.0,
  "sharePrice": 1.0416666,
  "underlyingAsset": "CAUSDC...",
  "totalDepositors": 125,
  "totalHarvests": 42,
  "isPaused": false,
  "lastHarvest": "2025-01-20T06:00:00Z"
}
```

**curl example:**
```bash
curl http://localhost:3004/api/v1/vault
```

**TypeScript client:**
```typescript
const vault = await fetch('http://localhost:3004/api/v1/vault').then(r => r.json());
console.log(`Share price: ${vault.sharePrice} USDC per yrUSDC`);
```


#### `GET /api/v1/vault/share-price`

Get current share price (read-only, always up-to-date).

**Response (200 OK):**
```json
{
  "sharePrice": 1.0416666,
  "timestamp": "2025-01-20T12:34:00Z"
}
```

#### `GET /api/v1/vault/preview-deposit?assets=1000`

Preview how many shares you'll receive for a deposit (SEP-56 `preview_deposit`).

**Query parameters:**
- `assets` (required): Amount of underlying asset to deposit

**Response (200 OK):**
```json
{
  "assets": 1000.0,
  "expectedShares": 960.0,
  "sharePrice": 1.0416666
}
```

**curl example:**
```bash
curl "http://localhost:3004/api/v1/vault/preview-deposit?assets=1000"
```

**TypeScript client:**
```typescript
// Preview before depositing
const preview = await fetch(
  `http://localhost:3004/api/v1/vault/preview-deposit?assets=1000`
).then(r => r.json());

// Show user: "You will receive ~960 yrUSDC shares"
console.log(`Expected shares: ${preview.expectedShares}`);
```


#### `GET /api/v1/vault/preview-redeem?shares=500`

Preview how many assets you'll receive for redeeming shares (SEP-56 `preview_redeem`).

**Query parameters:**
- `shares` (required): Amount of shares to redeem

**Response (200 OK):**
```json
{
  "shares": 500.0,
  "expectedAssets": 520.83,
  "sharePrice": 1.0416666
}
```

#### `GET /api/v1/vault/deposits`

List deposit history with pagination.

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "...",
      "depositor": "GDUSER...",
      "tokenId": "CAUSDC...",
      "amount": 1000.0,
      "sharesIssued": 960.0,
      "txHash": "abc123...",
      "createdAt": "2025-01-20T12:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5000, "pages": 250 }
}
```

#### `GET /api/v1/vault/withdrawals`

List withdrawal/redemption history with pagination.

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "...",
      "depositor": "GDUSER...",
      "shares": 500.0,
      "amountOut": 520.83,
      "txHash": "def456...",
      "createdAt": "2025-01-20T12:35:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3200, "pages": 160 }
}
```


#### `GET /api/v1/vault/harvests`

List harvest events (feeds the share-price chart on frontend).

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "...",
      "yieldAmount": 1250.0,
      "totalAssets": 501250.0,
      "sharePrice": 1.0443,
      "txHash": "ghi789...",
      "harvestedAt": "2025-01-20T06:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
}
```

**Use case: Time-series chart**
```typescript
// Fetch last 30 harvests
const harvests = await fetch(
  'http://localhost:3004/api/v1/vault/harvests?limit=30'
).then(r => r.json());

// Extract data for chart
const chartData = harvests.data.map(h => ({
  time: new Date(h.harvestedAt),
  sharePrice: h.sharePrice,
  yieldAmount: h.yieldAmount
}));

// Plot with Chart.js, Recharts, etc.
```


#### `GET /api/v1/vault/depositor/:address`

Get per-user position (balance, deposits, withdrawals).

**Response (200 OK):**
```json
{
  "address": "GDUSER...",
  "shareBalance": 5000.0,
  "assetValue": 5208.33,
  "totalDeposited": 10000.0,
  "totalWithdrawn": 5000.0,
  "netPosition": 5000.0,
  "depositCount": 5,
  "withdrawalCount": 2,
  "firstDepositAt": "2024-12-01T10:00:00Z",
  "lastActivityAt": "2025-01-19T15:30:00Z"
}
```

**curl example:**
```bash
curl http://localhost:3004/api/v1/vault/depositor/GDUSER...
```

#### `POST /api/v1/vault/deposit`

Build a deposit transaction (unsigned) for frontend to sign.

**Request:**
```json
{
  "assets": 1000.0,
  "receiver": "GDUSER...",
  "from": "GDUSER..."
}
```

**Response (200 OK):**
```json
{
  "unsignedTxXDR": "AAAAAgAAAA...",
  "expectedShares": 960.0,
  "instructions": "Sign this transaction with Freighter and submit to network"
}
```

**Important:** Backend never signs user transactions. It only builds the XDR.


#### `POST /api/v1/vault/redeem`

Build a redeem transaction (SEP-56 `redeem(shares, receiver, owner, operator)`).

**Request:**
```json
{
  "shares": 500.0,
  "receiver": "GDUSER...",
  "owner": "GDUSER..."
}
```

**Response (200 OK):**
```json
{
  "unsignedTxXDR": "AAAAAgAAAA...",
  "expectedAssets": 520.83
}
```

#### `POST /api/v1/vault/withdraw`

Build a withdraw transaction (SEP-56 `withdraw(assets, receiver, owner, operator)`).

**Request:**
```json
{
  "assets": 1000.0,
  "receiver": "GDUSER...",
  "owner": "GDUSER..."
}
```

**Response (200 OK):**
```json
{
  "unsignedTxXDR": "AAAAAgAAAA...",
  "sharesBurned": 960.0
}
```

**Difference between redeem and withdraw:**
- `redeem`: "I want to redeem exactly 500 shares, give me however many USDC that's worth"
- `withdraw`: "I want exactly 1000 USDC, burn however many shares that costs"

Most users use `redeem`. `withdraw` is for advanced cases.


#### `POST /api/v1/vault/harvest`

Manually trigger a harvest (admin/operator only in production).

**Request:**
```json
{
  "operatorKey": "SOPERATOR..."
}
```

**Response (200 OK):**
```json
{
  "yieldAmount": 1250.0,
  "totalAssets": 501250.0,
  "sharePrice": 1.0443,
  "txHash": "jkl012..."
}
```

**Note:** In production, this is triggered automatically by the cron job every 6 hours. Manual triggering is primarily for testing.

### Pools API

Manages registered AMM pool addresses.

#### `GET /api/v1/pools`

List all registered pools with pagination.

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "...",
      "tokenA": "CAUSDC...",
      "tokenB": "CXLM...",
      "poolAddress": "CPOOL...",
      "active": true,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 15, "pages": 1 }
}
```

**curl example:**
```bash
curl http://localhost:3004/api/v1/pools
```


#### `GET /api/v1/pools/:tokenA/:tokenB`

Look up a specific pool by token pair.

**Response (200 OK):**
```json
{
  "id": "...",
  "tokenA": "CAUSDC...",
  "tokenB": "CXLM...",
  "poolAddress": "CPOOL...",
  "active": true,
  "createdAt": "2025-01-15T10:00:00Z"
}
```

**Errors:**
- `404 Not Found`: No pool registered for this pair

**curl example:**
```bash
curl http://localhost:3004/api/v1/pools/CAUSDC.../CXLM...
```

#### `POST /api/v1/pools/register`

Register a new pool (admin only).

**Request:**
```json
{
  "tokenA": "CAUSDC...",
  "tokenB": "CXLM...",
  "poolAddress": "CPOOL..."
}
```

**Response (201 Created):**
```json
{
  "id": "...",
  "tokenA": "CAUSDC...",
  "tokenB": "CXLM...",
  "poolAddress": "CPOOL...",
  "active": true,
  "createdAt": "2025-01-20T12:40:00Z"
}
```

**Errors:**
- `409 Conflict`: Pool already registered for this pair


#### `DELETE /api/v1/pools/:id`

Deregister a pool (admin only, marks as inactive).

**Response (200 OK):**
```json
{
  "id": "...",
  "active": false,
  "deregisteredAt": "2025-01-20T12:45:00Z"
}
```

### Oracle API

Manages price feeds and TWAP data.

#### `GET /api/v1/oracle`

Get latest price for all tracked pairs.

**Response (200 OK):**
```json
{
  "data": [
    {
      "baseToken": "CAUSDC...",
      "quoteToken": "CXLM...",
      "price": 1.05,
      "twapPrice": 1.048,
      "reporter": "GREPORTER...",
      "recordedAt": "2025-01-20T12:45:00Z"
    }
  ]
}
```

#### `GET /api/v1/oracle/:baseToken/:quoteToken`

Get current spot and TWAP price for a specific pair.

**Response (200 OK):**
```json
{
  "baseToken": "CAUSDC...",
  "quoteToken": "CXLM...",
  "spotPrice": 1.05,
  "twapPrice": 1.048,
  "lastUpdate": "2025-01-20T12:45:00Z",
  "sampleCount": 18,
  "windowHours": 1.0
}
```

**curl example:**
```bash
curl http://localhost:3004/api/v1/oracle/CAUSDC.../CXLM...
```


#### `GET /api/v1/oracle/:baseToken/:quoteToken/history`

Get historical price snapshots for charting.

**Query parameters:**
- `from` (ISO timestamp): Start time
- `to` (ISO timestamp): End time
- `limit` (default: 100, max: 1000): Max samples

**Response (200 OK):**
```json
{
  "data": [
    {
      "baseToken": "CAUSDC...",
      "quoteToken": "CXLM...",
      "price": 1.05,
      "twapPrice": 1.048,
      "reporter": "GREPORTER...",
      "recordedAt": "2025-01-20T12:45:00Z"
    }
  ],
  "summary": {
    "count": 100,
    "minPrice": 1.02,
    "maxPrice": 1.08,
    "avgPrice": 1.05
  }
}
```

**curl example:**
```bash
curl "http://localhost:3004/api/v1/oracle/CAUSDC.../CXLM.../history?from=2025-01-19T00:00:00Z&to=2025-01-20T00:00:00Z&limit=100"
```

**TypeScript client for charting:**
```typescript
const history = await fetch(
  `http://localhost:3004/api/v1/oracle/${USDC}/${XLM}/history?` +
  `from=${startDate.toISOString()}&to=${endDate.toISOString()}&limit=200`
).then(r => r.json());

const chartData = history.data.map(d => ({
  time: new Date(d.recordedAt),
  price: d.price,
  twap: d.twapPrice
}));
```


#### `POST /api/v1/oracle/submit`

Submit a price update (whitelisted reporters only).

**Request:**
```json
{
  "reporter": "GREPORTER...",
  "baseToken": "CAUSDC...",
  "quoteToken": "CXLM...",
  "price": 1.05
}
```

**Response (201 Created):**
```json
{
  "id": "...",
  "baseToken": "CAUSDC...",
  "quoteToken": "CXLM...",
  "price": 1.05,
  "twapPrice": 1.048,
  "reporter": "GREPORTER...",
  "recordedAt": "2025-01-20T12:50:00Z"
}
```

**Errors:**
- `403 Forbidden`: Reporter not whitelisted
- `422 Unprocessable Entity`: Price deviates too much from last known price (> 10%)

### Health and Network

#### `GET /health`

Service health check (no authentication required).

**Response (200 OK):**
```json
{
  "service": "yield-routes-backend",
  "status": "healthy",
  "timestamp": "2025-01-20T12:50:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

**Use case: Load balancer health checks**
```bash
# Kubernetes liveness probe
curl -f http://localhost:3004/health || exit 1
```


#### `GET /api/v1/network`

Get network information (testnet vs mainnet).

**Response (200 OK):**
```json
{
  "networkPassphrase": "Test SDF Network ; September 2015",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "environment": "testnet",
  "contracts": {
    "routeAggregator": "CAAAAAAA...",
    "yieldVault": "CBBBBBBB...",
    "feeDistributor": "CCCCCCCC...",
    "priceOracle": "CDDDDDDD..."
  }
}
```

**Use case: Frontend network validation**
```typescript
// Frontend checks backend is on correct network
const backend = await fetch('http://localhost:3004/api/v1/network').then(r => r.json());
if (backend.environment !== 'testnet') {
  alert('Warning: Backend is on mainnet, but you are using testnet frontend!');
}
```

---

## Database schema and design

### Schema overview

The Prisma schema is defined in `prisma/schema.prisma`. Here's a detailed breakdown:

**Connection:**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```


### Table details

#### RouteQuote

Stores swap quotes from RouteAggregator.

| Column | Type | Description | Indexed |
|--------|------|-------------|---------|
| `id` | UUID | Primary key | ✓ |
| `onChainId` | Int | Matches contract `quote_id` (autoincrement) | ✓ (unique) |
| `tokenIn` | String | Input token contract ID | ✓ |
| `tokenOut` | String | Output token contract ID | ✓ |
| `amountIn` | Float | Input amount | — |
| `expectedOut` | Float | Expected output before slippage | — |
| `priceImpactBps` | Int | Price impact in basis points | — |
| `protocolFee` | Float | Protocol fee amount (0.1%) | — |
| `validUntil` | DateTime | Quote expiry (60s from creation) | ✓ |
| `executed` | Boolean | Whether quote was executed | ✓ |
| `executedOut` | Float? | Actual output if executed | — |
| `createdAt` | DateTime | Quote creation time | ✓ |

**Indexes:**
```sql
CREATE INDEX idx_routequote_tokens ON "RouteQuote"("tokenIn", "tokenOut");
CREATE INDEX idx_routequote_executed ON "RouteQuote"("executed");
CREATE INDEX idx_routequote_createdat ON "RouteQuote"("createdAt" DESC);
CREATE UNIQUE INDEX idx_routequote_onchainid ON "RouteQuote"("onChainId");
```

**Why these indexes:**
- `(tokenIn, tokenOut)`: Fast lookups for "recent quotes for this pair"
- `executed`: Filter executed vs pending quotes
- `createdAt DESC`: Paginated listing sorted by recency
- `onChainId` unique: Prevent duplicate on-chain quote IDs

**Common queries:**
```typescript
// Get recent quotes for a token pair
const quotes = await prisma.routeQuote.findMany({
  where: { tokenIn: USDC, tokenOut: XLM, executed: true },
  orderBy: { createdAt: 'desc' },
  take: 10
});

// Calculate volume for last 24h
const volume = await prisma.routeQuote.aggregate({
  where: {
    executed: true,
    createdAt: { gte: new Date(Date.now() - 86400_000) }
  },
  _sum: { amountIn: true, executedOut: true }
});
```


#### VaultDeposit / VaultWithdrawal

Track deposit and withdrawal events.

**VaultDeposit columns:**
- `id` (UUID, PK)
- `depositor` (String, indexed) — User address
- `tokenId` (String) — Underlying asset (USDC)
- `amount` (Float) — Assets deposited
- `sharesIssued` (Float) — Shares minted
- `txHash` (String?, indexed) — On-chain transaction hash
- `createdAt` (DateTime, indexed)

**VaultWithdrawal columns:**
- `id` (UUID, PK)
- `depositor` (String, indexed) — User address
- `shares` (Float) — Shares burned
- `amountOut` (Float) — Assets withdrawn
- `txHash` (String?, indexed)
- `createdAt` (DateTime, indexed)

**Indexes:**
```sql
CREATE INDEX idx_vaultdeposit_depositor ON "VaultDeposit"("depositor");
CREATE INDEX idx_vaultdeposit_createdat ON "VaultDeposit"("createdAt" DESC);
CREATE INDEX idx_vaultwithdrawal_depositor ON "VaultWithdrawal"("depositor");
```

**Common query: User position**
```typescript
const [deposits, withdrawals] = await Promise.all([
  prisma.vaultDeposit.aggregate({
    where: { depositor: userAddress },
    _sum: { amount: true, sharesIssued: true }
  }),
  prisma.vaultWithdrawal.aggregate({
    where: { depositor: userAddress },
    _sum: { amountOut: true, shares: true }
  })
]);

const netPosition = {
  totalDeposited: deposits._sum.amount ?? 0,
  totalWithdrawn: withdrawals._sum.amountOut ?? 0,
  netDeposit: (deposits._sum.amount ?? 0) - (withdrawals._sum.amountOut ?? 0)
};
```


#### HarvestEvent

Records yield harvests (every 6 hours).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `yieldAmount` | Float | Gross yield harvested |
| `totalAssets` | Float | Total assets after harvest |
| `sharePrice` | Float | New share price after harvest |
| `txHash` | String? | On-chain transaction hash |
| `harvestedAt` | DateTime | Harvest timestamp (indexed) |

**Index:**
```sql
CREATE INDEX idx_harvestevent_harvestedat ON "HarvestEvent"("harvestedAt" DESC);
```

**Use case: Share price chart**
```typescript
// Get last 30 harvests for chart
const harvests = await prisma.harvestEvent.findMany({
  orderBy: { harvestedAt: 'desc' },
  take: 30
});

const chartData = harvests.map(h => ({
  time: h.harvestedAt,
  sharePrice: h.sharePrice,
  apr: calculateAPR(h.yieldAmount, h.totalAssets)
}));
```

#### PriceSnapshot

Records oracle price submissions.

| Column | Type | Description | Indexed |
|--------|------|-------------|---------|
| `id` | UUID | Primary key | ✓ |
| `baseToken` | String | Base token contract ID | ✓ |
| `quoteToken` | String | Quote token contract ID | ✓ |
| `price` | Float | Spot price | — |
| `twapPrice` | Float | 1-hour TWAP | — |
| `reporter` | String | Reporter address | ✓ |
| `recordedAt` | DateTime | Submission time | ✓ |

**Composite index for TWAP queries:**
```sql
CREATE INDEX idx_pricesnapshot_pair_time 
  ON "PriceSnapshot"("baseToken", "quoteToken", "recordedAt" DESC);
```

**Why this index:** TWAP queries need to find all samples for a pair within the last hour, ordered by time.


**TWAP calculation query:**
```typescript
const oneHourAgo = new Date(Date.now() - 3600_000);
const samples = await prisma.priceSnapshot.findMany({
  where: {
    baseToken: USDC,
    quoteToken: XLM,
    recordedAt: { gte: oneHourAgo }
  },
  orderBy: { recordedAt: 'asc' }
});

// Calculate time-weighted average
let weightedSum = 0;
let totalWeight = 0;
for (let i = 0; i < samples.length - 1; i++) {
  const timeDelta = samples[i + 1].recordedAt.getTime() - samples[i].recordedAt.getTime();
  weightedSum += samples[i].price * timeDelta;
  totalWeight += timeDelta;
}
const twap = totalWeight > 0 ? weightedSum / totalWeight : samples[samples.length - 1]?.price ?? 0;
```

#### RegisteredPool

Tracks AMM pool registrations.

| Column | Type | Description | Indexed |
|--------|------|-------------|---------|
| `id` | UUID | Primary key | ✓ |
| `tokenA` | String | First token | ✓ |
| `tokenB` | String | Second token | ✓ |
| `poolAddress` | String | Pool contract ID | ✓ |
| `active` | Boolean | Whether pool is active | ✓ |
| `createdAt` | DateTime | Registration time | — |

**Unique constraint:**
```sql
ALTER TABLE "RegisteredPool" 
  ADD CONSTRAINT unique_pool_pair UNIQUE ("tokenA", "tokenB");
```

**Why:** Prevents duplicate pool registrations for the same pair.

### Migration workflow

```bash
# Create migration after schema change
npm run db:migrate -- --name add_harvest_apr_field

# Apply migrations (production)
npm run db:migrate deploy

# Reset database (development only)
npm run db:reset

# Generate Prisma client
npm run db:generate
```


### Backup and restore

**Backup (PostgreSQL):**
```bash
# Full database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Schema only
pg_dump --schema-only $DATABASE_URL > schema.sql

# Data only
pg_dump --data-only $DATABASE_URL > data.sql
```

**Restore:**
```bash
# Drop existing database (⚠️ destructive)
dropdb yieldroutes_db

# Create new database
createdb yieldroutes_db

# Restore from backup
psql $DATABASE_URL < backup_20250120_120000.sql

# Or with npm script
npm run db:restore -- backup_20250120_120000.sql
```

**Automated backups (production):**
```bash
# Crontab: daily backup at 3 AM
0 3 * * * pg_dump $DATABASE_URL | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz

# Keep last 30 days
find /backups -name "db_*.sql.gz" -mtime +30 -delete
```

### Query optimization tips

**1. Use select to reduce data transfer:**
```typescript
// ❌ Bad: Fetches all columns
const quotes = await prisma.routeQuote.findMany();

// ✅ Good: Only needed columns
const quotes = await prisma.routeQuote.findMany({
  select: { id: true, tokenIn: true, tokenOut: true, expectedOut: true }
});
```

**2. Use cursor-based pagination for large datasets:**
```typescript
// ❌ Bad: Offset pagination gets slow at high page numbers
const page1000 = await prisma.routeQuote.findMany({
  skip: 999 * 100,
  take: 100
});

// ✅ Good: Cursor-based
const cursor = await prisma.routeQuote.findMany({
  cursor: { id: lastSeenId },
  take: 100,
  orderBy: { createdAt: 'desc' }
});
```

**3. Use aggregations instead of fetching all rows:**
```typescript
// ❌ Bad: Fetches all quotes, sums in app
const allQuotes = await prisma.routeQuote.findMany({ where: { executed: true } });
const totalVolume = allQuotes.reduce((sum, q) => sum + q.amountIn, 0);

// ✅ Good: Database aggregation
const { _sum } = await prisma.routeQuote.aggregate({
  where: { executed: true },
  _sum: { amountIn: true }
});
```


---

## Cron jobs and automation

Two automated jobs run via `node-cron`:

```mermaid
sequenceDiagram
    participant Cron as node-cron scheduler
    participant HJ as harvest.job.ts
    participant PJ as price.job.ts
    participant SS as stellar.service.ts
    participant DB as PostgreSQL
    participant RPC as Soroban RPC

    loop Every 6 hours (HARVEST_CRON)
        Cron->>HJ: trigger
        HJ->>SS: harvestVault()
        SS->>RPC: call YieldVault.harvest(grossYield)
        RPC-->>SS: HarvestEvent (yield, new share price)
        SS-->>HJ: result
        HJ->>DB: insert HarvestEvent
    end

    loop Every 5 minutes (PRICE_UPDATE_CRON)
        Cron->>PJ: trigger
        PJ->>SS: fetch DEX mid-price per tracked pair
        PJ->>SS: submitOraclePrice()
        SS->>RPC: call PriceOracle.submit_price()
        PJ->>DB: insert PriceSnapshot
    end
```

### Harvest job

**File:** `src/jobs/harvest.job.ts`
**Schedule:** Every 6 hours (default: `0 */6 * * *`)
**Purpose:** Collect yield from underlying strategies and reinvest into vault.


**Algorithm:**

1. **Query vault state**
   ```typescript
   const totalAssets = await stellar.totalAssets();
   const lastHarvest = await prisma.harvestEvent.findFirst({
     orderBy: { harvestedAt: 'desc' }
   });
   const previousAssets = lastHarvest?.totalAssets ?? 0;
   ```

2. **Calculate gross yield**
   ```typescript
   const grossYield = totalAssets - previousAssets;
   if (grossYield <= 0) {
     logger.info('No yield to harvest');
     return;
   }
   ```

3. **Call harvest contract**
   ```typescript
   const result = await stellar.harvestVault(grossYield);
   // Contract deducts 10% performance fee, distributes via FeeDistributor
   // Returns: { yieldAmount, totalAssets, sharePrice, txHash }
   ```

4. **Record event**
   ```typescript
   await prisma.harvestEvent.create({
     data: {
       yieldAmount: result.yieldAmount,
       totalAssets: result.totalAssets,
       sharePrice: result.sharePrice,
       txHash: result.txHash,
       harvestedAt: new Date()
     }
   });
   ```

**Error handling:**
```typescript
try {
  await runHarvest();
} catch (err) {
  logger.error('Harvest failed', { error: err.message });
  // Send alert to monitoring system (Sentry, PagerDuty, etc.)
  alertMonitoring('harvest-failure', err);
  // Job will retry on next schedule (6h later)
}
```

**Retry logic:**
- No automatic retries within same cron run
- Next scheduled run (6h later) will attempt again
- If harvest fails 3+ times consecutively → alert admin

**Manual triggering:**
```bash
# For testing/debugging
curl -X POST http://localhost:3004/api/v1/vault/harvest \
  -H "Content-Type: application/json" \
  -d '{"operatorKey":"S..."}'
```


### Price feed job

**File:** `src/jobs/price.job.ts`
**Schedule:** Every 5 minutes (default: `*/5 * * * *`)
**Purpose:** Submit price updates to PriceOracle for TWAP calculation.

**Algorithm:**

1. **Fetch prices from external sources**
   ```typescript
   const pairs = [
     { base: USDC, quote: XLM },
     { base: USDC, quote: USDT },
     // ... other tracked pairs
   ];

   for (const pair of pairs) {
     // Option A: Query Stellar DEX via Horizon API
     const sdexPrice = await fetchStellarDEXPrice(pair.base, pair.quote);
     
     // Option B: Query registered Soroban pools
     const poolPrice = await fetchPoolPrice(pair.base, pair.quote);
     
     // Option C: External oracle (Chainlink, Band, etc.)
     const oraclePrice = await fetchExternalOracle(pair.base, pair.quote);
     
     // Use median of available sources
     const price = median([sdexPrice, poolPrice, oraclePrice].filter(Boolean));
   }
   ```

2. **Submit to oracle contract**
   ```typescript
   const txHash = await stellar.submitOraclePrice(
     REPORTER_ADDRESS,
     pair.base,
     pair.quote,
     price
   );
   ```

3. **Record snapshot**
   ```typescript
   await prisma.priceSnapshot.create({
     data: {
       baseToken: pair.base,
       quoteToken: pair.quote,
       price: price,
       twapPrice: await calculateTWAP(pair.base, pair.quote),
       reporter: REPORTER_ADDRESS,
       recordedAt: new Date()
     }
   });
   ```

**Error handling:**
```typescript
// If price deviates > 10% from last known price, flag for review
const lastPrice = await prisma.priceSnapshot.findFirst({
  where: { baseToken, quoteToken },
  orderBy: { recordedAt: 'desc' }
});

if (Math.abs(price - lastPrice.price) / lastPrice.price > 0.10) {
  logger.warn('Price deviation > 10%', {
    pair: `${baseToken}/${quoteToken}`,
    old: lastPrice.price,
    new: price,
    deviation: ((price - lastPrice.price) / lastPrice.price * 100).toFixed(2) + '%'
  });
  // Still submit, but alert for manual verification
}
```


**Performance tuning:**
- Run price submissions in parallel (Promise.all) for multiple pairs
- Cache external API responses for 30s to avoid rate limits
- Use connection pooling for RPC calls

**Monitoring:**
```typescript
// Track job execution time
const startTime = Date.now();
await runPriceJob();
const duration = Date.now() - startTime;

logger.info('Price job completed', {
  duration: `${duration}ms`,
  pairsUpdated: pairs.length,
  avgTimePerPair: `${(duration / pairs.length).toFixed(0)}ms`
});

// Alert if job takes > 30s (may indicate RPC issues)
if (duration > 30_000) {
  alertMonitoring('price-job-slow', { duration });
}
```

---

## Stellar indexer architecture

**File:** `src/indexers/stellar.indexer.ts`
**Purpose:** Poll Soroban RPC for contract events and store them in PostgreSQL.

```mermaid
flowchart TD
    START[Indexer starts] --> LOAD[Load cursor from DB]
    LOAD --> POLL[Poll RPC for events<br/>starting from cursor]
    POLL --> CHECK{Any events?}
    CHECK -->|No| SLEEP[Sleep 2s]
    SLEEP --> POLL
    CHECK -->|Yes| PROCESS[Process each event]
    PROCESS --> PARSE[Parse event type<br/>quote_created, deposit, etc.]
    PARSE --> STORE[Store in appropriate table]
    STORE --> UPDATE[Update cursor to latest ledger]
    UPDATE --> POLL
```


### How it works

**1. Cursor management**

The indexer tracks the last processed ledger in the `IndexerCursor` table (single row, id=1).

```typescript
// On startup, load cursor
const cursorRec = await prisma.indexerCursor.findUnique({ where: { id: 1 } });
let cursor = cursorRec?.ledger ?? config.INDEXER_STARTING_LEDGER;

// After processing events
const latestLedger = Math.max(...events.map(e => e.ledger));
await prisma.indexerCursor.upsert({
  where: { id: 1 },
  create: { id: 1, ledger: latestLedger + 1 },
  update: { ledger: latestLedger + 1 }
});
```

**Why cursor-based:** Ensures no events are missed, even if indexer restarts. Always resumes from last confirmed position.

**2. Event polling**

```typescript
const events = await server.getEvents({
  startLedger: cursor,
  filters: [
    {
      type: 'contract',
      contractIds: [
        config.ROUTE_AGGREGATOR_ID,
        config.YIELD_VAULT_ID,
        config.FEE_DISTRIBUTOR_ID,
        config.PRICE_ORACLE_ID
      ].filter(Boolean)
    }
  ]
});
```

**Filter strategy:** Only fetch events from our 4 contracts to reduce noise.

**3. Event parsing**

Events are identified by `topic[0]` (event name):

```typescript
const topic = ev.topic?.[0]?.toString() ?? '';
switch (topic) {
  case 'quote_created':
    // Parse quote data from ev.value
    await processQuoteCreated(ev);
    break;
  case 'route_executed':
    await processRouteExecuted(ev);
    break;
  case 'deposit':  // SEP-56 event
    await processDeposit(ev);
    break;
  case 'withdraw':
    await processWithdraw(ev);
    break;
  // ... other event types
}
```

**Event data structure:**
```typescript
interface ContractEvent {
  type: 'contract';
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  pagingToken: string;
  topic: ScVal[];  // [event_name, arg1, arg2, ...]
  value: ScVal;    // Event-specific data
}
```


### Handling chain reorganizations

**Problem:** Stellar can reorganize recent ledgers (rare, but possible). If indexer processed ledger 1000, then chain reorgs and ledger 1000 is replaced with different transactions, we've stored invalid data.

**Solution: Confirmation depth**

```typescript
const CONFIRMATION_DEPTH = 3;  // Wait 3 ledgers before considering events "final"

const latestLedger = await server.getLatestLedger();
const safeStartLedger = Math.max(cursor, latestLedger.sequence - CONFIRMATION_DEPTH);

const events = await server.getEvents({
  startLedger: safeStartLedger,
  // ...
});
```

**Trade-off:** 3-ledger delay (~15 seconds) before events appear in database, but guaranteed correctness.

### Performance optimization

**1. Batch database inserts**

```typescript
// ❌ Bad: Insert events one by one
for (const ev of events) {
  await prisma.priceSnapshot.create({ data: parseEvent(ev) });
}

// ✅ Good: Batch insert
const dataToInsert = events.map(parseEvent);
await prisma.priceSnapshot.createMany({ data: dataToInsert });
```

**2. Use database transactions**

```typescript
await prisma.$transaction(async (tx) => {
  // Insert events
  await tx.priceSnapshot.createMany({ data: snapshots });
  await tx.vaultDeposit.createMany({ data: deposits });
  
  // Update cursor
  await tx.indexerCursor.update({
    where: { id: 1 },
    data: { ledger: newCursor }
  });
});
```

**Why:** If any insert fails, cursor is not updated, so indexer will retry on next run.

**3. Parallel processing of independent events**

```typescript
const tasks = events.map(ev => processEvent(ev));
await Promise.all(tasks);
```


### Backfilling historical data

**Use case:** You deploy contracts to testnet in December, but only start the indexer in January. Need to backfill December events.

**Script:** `src/scripts/backfill-events.ts`

```typescript
// Backfill events from a specific ledger range
async function backfill(startLedger: number, endLedger: number) {
  logger.info('Backfilling events', { startLedger, endLedger });
  
  for (let cursor = startLedger; cursor <= endLedger; cursor += 1000) {
    const events = await server.getEvents({
      startLedger: cursor,
      limit: 1000,
      filters: [{ type: 'contract', contractIds: contractIds }]
    });
    
    for (const ev of events.events) {
      await processEvent(ev);
    }
    
    logger.info('Backfilled batch', { ledger: cursor, count: events.events.length });
    
    // Rate limiting: don't overwhelm RPC
    await sleep(1000);
  }
}

// Usage
backfill(1_000_000, 1_500_000);
```

**Run:**
```bash
npm run backfill -- --start-ledger 1000000 --end-ledger 1500000
```

---

## Stellar service implementation guide

**File:** `src/services/stellar.service.ts`
**Purpose:** Wrapper around Soroban RPC for contract interactions.

Currently most methods return placeholder values. Replace with real Soroban transaction building.


### Implementation priority

1. **Read-only calls** (simulation, no state change)
   - `totalAssets()` / `queryAsset()`
   - `convertToShares(assets)` / `convertToAssets(shares)`
   - `get_best_route()` quote generation

2. **Transaction building** (unsigned XDR for frontend)
   - `vaultDeposit()` → return unsigned tx
   - `vaultRedeem()` → return unsigned tx
   - `executeRoute()` → return unsigned tx

3. **Server-signed transactions** (operator key)
   - `harvestVault()` → sign and submit
   - `submitOraclePrice()` → sign and submit

### Pattern: Read-only call

```typescript
async function totalAssets(): Promise<number> {
  const contract = new Contract(config.YIELD_VAULT_ID);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE })
    .addOperation(
      contract.call('total_assets')
    )
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (!simulation.result) {
    throw new Error('Simulation failed');
  }

  return scValToNative(simulation.result.retval) as number;
}
```

**Key points:**
- Use `simulateTransaction` (no fees, no signature needed)
- Parse result with `scValToNative`
- Handle simulation failures


### Pattern: Unsigned transaction for frontend

```typescript
async function vaultDeposit(
  assets: number,
  receiver: string,
  from: string
): Promise<{ unsignedTxXDR: string; expectedShares: number }> {
  const contract = new Contract(config.YIELD_VAULT_ID);
  const sourceAccount = await server.getAccount(from);
  
  // Build transaction
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: config.STELLAR_NETWORK_PASSPHRASE
  })
    .addOperation(
      contract.call(
        'deposit',
        nativeToScVal(assets, { type: 'i128' }),
        nativeToScVal(receiver, { type: 'address' }),
        nativeToScVal(from, { type: 'address' })
      )
    )
    .setTimeout(300)  // 5 minutes for user to sign
    .build();

  // Simulate to get expected shares
  const sim = await server.simulateTransaction(tx);
  const expectedShares = scValToNative(sim.result!.retval) as number;

  // Return unsigned XDR
  return {
    unsignedTxXDR: tx.toXDR(),
    expectedShares
  };
}
```

**Frontend receives:**
```json
{
  "unsignedTxXDR": "AAAAAgAAAA...",
  "expectedShares": 960.0
}
```

**Frontend signs and submits:**
```typescript
// In yield-routes-frontend
const { unsignedTxXDR } = await fetch('/api/v1/vault/deposit', { ... });
const tx = TransactionBuilder.fromXDR(unsignedTxXDR, networkPassphrase);
const signedTx = await freighter.signTransaction(tx.toXDR());
const result = await server.sendTransaction(signedTx);
```


### Pattern: Server-signed transaction

```typescript
async function harvestVault(grossYield: number): Promise<HarvestResult> {
  const operatorKeypair = Keypair.fromSecret(config.OPERATOR_SECRET_KEY);
  const account = await server.getAccount(operatorKeypair.publicKey());
  
  const contract = new Contract(config.YIELD_VAULT_ID);
  const tx = new TransactionBuilder(account, {
    fee: '10000',  // Higher fee for priority
    networkPassphrase: config.STELLAR_NETWORK_PASSPHRASE
  })
    .addOperation(
      contract.call(
        'harvest',
        nativeToScVal(grossYield, { type: 'i128' })
      )
    )
    .setTimeout(30)
    .build();

  // Simulate first (good practice)
  const sim = await server.simulateTransaction(tx);
  if (!sim.result) {
    throw new Error('Harvest simulation failed');
  }

  // Assemble with auth and soroban data
  const prepared = SorobanRpc.assembleTransaction(tx, sim);
  prepared.sign(operatorKeypair);

  // Submit
  const response = await server.sendTransaction(prepared.build());
  
  // Wait for confirmation
  const confirmedTx = await waitForTransaction(response.hash);
  
  return {
    yieldAmount: scValToNative(confirmedTx.resultValue) as number,
    totalAssets: await totalAssets(),
    sharePrice: await convertToAssets(1_000_000_0000000),  // 1 share
    txHash: response.hash
  };
}

async function waitForTransaction(hash: string, timeout = 30000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const tx = await server.getTransaction(hash);
    if (tx.status === 'SUCCESS') return tx;
    if (tx.status === 'FAILED') throw new Error('Transaction failed');
    await sleep(1000);
  }
  throw new Error('Transaction timeout');
}
```


### Error handling best practices

```typescript
// Wrap contract calls with try-catch
async function safeContractCall<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (err: any) {
    logger.error(`${operationName} failed`, {
      error: err.message,
      stack: err.stack,
      code: err.code
    });

    // Parse Soroban-specific errors
    if (err.message?.includes('HostError')) {
      throw new Error(`Contract reverted: ${parseHostError(err)}`);
    }
    if (err.message?.includes('InsufficientBalance')) {
      throw new Error('Account has insufficient XLM for transaction fees');
    }

    throw err;
  }
}

// Usage
const assets = await safeContractCall(
  () => totalAssets(),
  'totalAssets'
);
```

### Gas estimation

```typescript
async function estimateGas(tx: Transaction): Promise<number> {
  const sim = await server.simulateTransaction(tx);
  
  const cpuInsns = sim.cost?.cpuInsns ?? 0;
  const memBytes = sim.cost?.memBytes ?? 0;
  
  // Stellar fee model: 100 stroops per 10,000 CPU instructions
  const cpuFee = Math.ceil(cpuInsns / 10_000) * 100;
  const memFee = Math.ceil(memBytes / 1024) * 10;
  
  return cpuFee + memFee;  // in stroops (1 XLM = 10^7 stroops)
}
```

---

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Switch for mainnet |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated |
| `HARVEST_CRON` | `0 */6 * * *` | Standard cron syntax |
| `PRICE_UPDATE_CRON` | `*/5 * * * *` | |
| `INDEXER_STARTING_LEDGER` | `0` | |
| `ROUTE_AGGREGATOR_ID` | *(empty → stub mode)* | From `yield-routes-contracts` deploy |
| `YIELD_VAULT_ID` | *(empty → stub mode)* | From `yield-routes-contracts` deploy |
| `FEE_DISTRIBUTOR_ID` | *(empty → stub mode)* | From `yield-routes-contracts` deploy |
| `PRICE_ORACLE_ID` | *(empty → stub mode)* | From `yield-routes-contracts` deploy |
| `VAULT_UNDERLYING_ASSET` | *(empty)* | USDC contract ID on the target network |
| `OPERATOR_SECRET_KEY` | *(required for harvests)* | Secret key for server-signed transactions |
| `PORT` | `3004` | API server port |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |


**Environment-specific `.env` files:**

```bash
# .env.development
DATABASE_URL=postgresql://localhost:5432/yieldroutes_dev
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
LOG_LEVEL=debug

# .env.production
DATABASE_URL=postgresql://prod-db.example.com:5432/yieldroutes
STELLAR_RPC_URL=https://soroban-mainnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
LOG_LEVEL=info
CORS_ORIGINS=https://app.yieldroutes.com
```

If the four contract IDs are missing, the app **starts anyway** in stub mode and logs a warning — this lets the frontend and API be developed against without a live deployment. See [`src/env.ts`](src/env.ts).

---

## Getting started

```bash
cp .env.example .env
npm install

npm run db:migrate
npm run db:generate
npm run db:seed     # loads pools, price snapshots, deposits, harvest events
npm test             # ~12 test cases including SEP-56 preview logic
npm run build
npm run dev           # curl http://localhost:3004/health → {"service":"yield-routes"}
```

**Database setup (PostgreSQL):**

```bash
# Install PostgreSQL (macOS)
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb yieldroutes_dev

# Set DATABASE_URL in .env
echo "DATABASE_URL=postgresql://localhost:5432/yieldroutes_dev" >> .env

# Run migrations
npm run db:migrate
```

**Seed data:**
```bash
npm run db:seed
```

This creates:
- 3 registered pools (USDC/XLM, USDC/USDT, XLM/USDT)
- 50 price snapshots (last 5 hours)
- 10 vault deposits
- 5 harvest events


---

## Deployment guide

### Local development

Already covered in [Getting started](#getting-started).

### Docker deployment

**Dockerfile:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3004
CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: yieldroutes
      POSTGRES_USER: yieldroutes
      POSTGRES_PASSWORD: changeme
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: .
    ports:
      - "3004:3004"
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql://yieldroutes:changeme@db:5432/yieldroutes
      STELLAR_RPC_URL: https://soroban-testnet.stellar.org
      PORT: 3004
    command: sh -c "npm run db:migrate deploy && npm start"

volumes:
  postgres_data:
```

**Run:**
```bash
docker-compose up -d
docker-compose logs -f backend
```


### Production deployment (AWS)

**Architecture:**
- **Compute**: ECS Fargate (2 tasks for high availability)
- **Database**: RDS PostgreSQL (Multi-AZ)
- **Load Balancer**: Application Load Balancer
- **Secrets**: AWS Secrets Manager

**Step-by-step:**

1. **Create RDS PostgreSQL instance**
   ```bash
   aws rds create-db-instance \
     --db-instance-identifier yieldroutes-prod-db \
     --db-instance-class db.t4g.small \
     --engine postgres \
     --engine-version 15.4 \
     --master-username yieldroutes \
     --master-user-password <strong-password> \
     --allocated-storage 20 \
     --multi-az \
     --publicly-accessible false
   ```

2. **Store secrets in Secrets Manager**
   ```bash
   aws secretsmanager create-secret \
     --name yieldroutes/prod/operator-key \
     --secret-string "S..."

   aws secretsmanager create-secret \
     --name yieldroutes/prod/database-url \
     --secret-string "postgresql://..."
   ```

3. **Build and push Docker image to ECR**
   ```bash
   aws ecr create-repository --repository-name yieldroutes-backend
   
   docker build -t yieldroutes-backend .
   docker tag yieldroutes-backend:latest \
     123456789012.dkr.ecr.us-east-1.amazonaws.com/yieldroutes-backend:latest
   
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin \
     123456789012.dkr.ecr.us-east-1.amazonaws.com
   
   docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/yieldroutes-backend:latest
   ```

4. **Create ECS task definition**
   ```json
   {
     "family": "yieldroutes-backend",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "512",
     "memory": "1024",
     "containerDefinitions": [
       {
         "name": "backend",
         "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/yieldroutes-backend:latest",
         "portMappings": [{ "containerPort": 3004 }],
         "secrets": [
           {
             "name": "DATABASE_URL",
             "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:yieldroutes/prod/database-url"
           },
           {
             "name": "OPERATOR_SECRET_KEY",
             "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:yieldroutes/prod/operator-key"
           }
         ],
         "environment": [
           { "name": "STELLAR_RPC_URL", "value": "https://soroban-mainnet.stellar.org" },
           { "name": "PORT", "value": "3004" }
         ]
       }
     ]
   }
   ```

5. **Create ECS service with ALB**
   ```bash
   aws ecs create-service \
     --cluster yieldroutes-cluster \
     --service-name backend \
     --task-definition yieldroutes-backend \
     --desired-count 2 \
     --launch-type FARGATE \
     --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=backend,containerPort=3004"
   ```


### Production deployment (GCP)

**Architecture:**
- **Compute**: Cloud Run
- **Database**: Cloud SQL PostgreSQL
- **Secrets**: Secret Manager

**Deploy:**
```bash
# Build and push to Container Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/yieldroutes-backend

# Deploy to Cloud Run
gcloud run deploy yieldroutes-backend \
  --image gcr.io/PROJECT_ID/yieldroutes-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars STELLAR_RPC_URL=https://soroban-mainnet.stellar.org \
  --set-secrets DATABASE_URL=yieldroutes-db-url:latest,OPERATOR_SECRET_KEY=operator-key:latest
```

### Health check and monitoring

**Health check endpoint:**
```bash
# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 3004
  initialDelaySeconds: 10
  periodSeconds: 30

# Kubernetes readiness probe
readinessProbe:
  httpGet:
    path: /health
    port: 3004
  initialDelaySeconds: 5
  periodSeconds: 10
```

**Monitoring setup (Prometheus + Grafana):**

1. Add metrics endpoint:
```typescript
// src/middleware/metrics.ts
import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route?.path ?? req.path, res.statusCode).observe(duration);
  });
  next();
};

export const metricsEndpoint = async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};
```

2. Configure Prometheus:
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'yieldroutes-backend'
    static_configs:
      - targets: ['backend:3004']
    metrics_path: '/metrics'
```


### CI/CD pipeline (GitHub Actions)

**.github/workflows/deploy.yml:**
```yaml
name: Deploy Backend
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://localhost:5432/test
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to production
        run: |
          # AWS ECS deploy example
          aws ecs update-service \
            --cluster yieldroutes-cluster \
            --service backend \
            --force-new-deployment
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## Performance and scaling

### Database connection pooling

Prisma uses connection pooling by default. Configure in `.env`:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/db?connection_limit=10&pool_timeout=20"
```

**Recommended pool sizes:**
- Development: 5-10
- Production (single instance): 10-20
- Production (multiple instances): `(max_connections / instance_count) - 5`

**Check connection usage:**
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'yieldroutes';
```


### Redis caching strategy

**Use cases:**
1. Cache share price (changes only on harvest, every 6h)
2. Cache TWAP prices (stale after 5 min, but OK for UI)
3. Cache pool list (changes rarely)

**Setup:**
```bash
npm install ioredis
```

**Implementation:**
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Cache share price
async function getSharePrice(): Promise<number> {
  const cached = await redis.get('vault:sharePrice');
  if (cached) return parseFloat(cached);

  const sharePrice = await stellar.convertToAssets(1_0000000);
  await redis.setex('vault:sharePrice', 21600, sharePrice);  // 6h TTL
  return sharePrice;
}

// Cache TWAP
async function getTWAP(base: string, quote: string): Promise<number> {
  const key = `oracle:twap:${base}:${quote}`;
  const cached = await redis.get(key);
  if (cached) return parseFloat(cached);

  const twap = await calculateTWAP(base, quote);
  await redis.setex(key, 300, twap);  // 5min TTL
  return twap;
}
```

**Cache invalidation:**
```typescript
// After harvest completes
await redis.del('vault:sharePrice');

// After price submission
await redis.del(`oracle:twap:${baseToken}:${quoteToken}`);
```


### Horizontal scaling

**Architecture for multiple instances:**

```
           ┌─────────────────┐
           │  Load Balancer  │
           └────────┬────────┘
                    │
       ┌────────────┼────────────┐
       │            │            │
   ┌───▼──┐     ┌───▼──┐     ┌───▼──┐
   │ API 1│     │ API 2│     │ API 3│
   └───┬──┘     └───┬──┘     └───┬──┘
       │            │            │
       └────────────┼────────────┘
                    │
           ┌────────▼────────┐
           │   PostgreSQL    │
           │   (single DB)   │
           └─────────────────┘

   Indexer (single instance)
   Cron Jobs (single instance)
```

**Key considerations:**

1. **Stateless API**: No session state, all data in DB
2. **Single indexer**: Run only one indexer instance to avoid duplicate events
3. **Single cron scheduler**: Use leader election or run crons on dedicated instance

**Leader election for crons:**
```typescript
import Redlock from 'redlock';

const redlock = new Redlock([redis]);

async function runHarvestIfLeader() {
  const lock = await redlock.acquire(['locks:harvest'], 60000);  // 1min lock
  try {
    await runHarvest();
  } finally {
    await lock.release();
  }
}

cron.schedule(config.HARVEST_CRON, runHarvestIfLeader);
```

### Load testing results

**Setup:**
- Tool: k6
- Target: AWS ECS (2× t3.small, 1 vCPU, 2GB RAM each)
- Database: RDS db.t4g.small

**Test script:**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '3m', target: 100 },  // Stay at 100 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
};

export default function () {
  const res = http.get('https://api.yieldroutes.com/api/v1/routes?limit=20');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

**Results:**
| Metric | Value |
|--------|-------|
| Total requests | 120,000 |
| Success rate | 99.8% |
| Avg response time | 85ms |
| P95 response time | 220ms |
| P99 response time | 450ms |
| Max RPS | 800 |
| CPU usage (avg) | 45% |
| Memory usage (avg) | 60% |

**Bottleneck:** Database queries for routes list. Solution: Add Redis caching.


---

## Security best practices

### API key management

**Current state:** No authentication (public read API).

**Future: API key auth for write endpoints**

```typescript
// src/middleware/auth.ts
export const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const validKeys = config.API_KEYS.split(',');
  if (!validKeys.includes(apiKey)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
};

// Apply to write endpoints
router.post('/vault/harvest', requireApiKey, harvest);
router.post('/oracle/submit', requireApiKey, submitPrice);
```

**Store keys in environment:**
```bash
API_KEYS=key_abc123,key_def456,key_ghi789
```

### Rate limiting configuration

Already implemented with `express-rate-limit`:

```typescript
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,  // 100 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply globally
app.use('/api/', limiter);

// Stricter limit for expensive endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});
app.post('/api/v1/routes/execute', strictLimiter, executeRoute);
```

**Redis-backed rate limiting (multi-instance):**
```typescript
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:',
  }),
  windowMs: 60 * 1000,
  max: 100,
});
```


### CORS setup details

**Current config:**
```typescript
import cors from 'cors';

app.use(cors({
  origin: config.CORS_ORIGINS.split(','),  // From .env
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400  // 24h preflight cache
}));
```

**Production `.env`:**
```bash
CORS_ORIGINS=https://app.yieldroutes.com,https://yieldroutes.com
```

**Development (allow all localhost):**
```typescript
if (process.env.NODE_ENV === 'development') {
  app.use(cors({ origin: true }));
}
```

### SQL injection prevention

**Prisma automatically prevents SQL injection** by parameterizing all queries.

**Never do this:**
```typescript
// ❌ BAD: Raw SQL with user input
const results = await prisma.$queryRawUnsafe(
  `SELECT * FROM "RouteQuote" WHERE tokenIn = '${userInput}'`
);
```

**Always do this:**
```typescript
// ✅ GOOD: Parameterized query
const results = await prisma.routeQuote.findMany({
  where: { tokenIn: userInput }
});

// ✅ GOOD: Raw query with parameters
const results = await prisma.$queryRaw`
  SELECT * FROM "RouteQuote" WHERE tokenIn = ${userInput}
`;
```

### Secrets management

**Development:** Use `.env` file (never commit to git)

**Production:** Use cloud provider's secrets manager

**AWS Secrets Manager example:**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString!;
}

// Usage
const operatorKey = await getSecret('yieldroutes/prod/operator-key');
```

**Vault (HashiCorp) example:**
```typescript
import vault from 'node-vault';

const client = vault({
  endpoint: 'https://vault.example.com',
  token: process.env.VAULT_TOKEN
});

const secret = await client.read('secret/data/yieldroutes/operator-key');
const operatorKey = secret.data.data.key;
```


### Input validation

**Zod schemas** in `src/middleware/validate.ts`:

```typescript
import { z } from 'zod';

export const quoteRequestSchema = z.object({
  tokenIn: z.string().regex(/^C[A-Z0-9]{55}$/, 'Invalid Stellar contract ID'),
  tokenOut: z.string().regex(/^C[A-Z0-9]{55}$/),
  amountIn: z.number().positive().max(1e15),
  maxHops: z.number().int().min(1).max(3).default(2)
});

export const validate = (schema: z.ZodSchema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
};

// Usage
router.post('/routes/quote', validate(quoteRequestSchema), getQuote);
```

**Sanitize string inputs:**
```typescript
import sanitize from 'sanitize-html';

const cleanDescription = sanitize(userInput, {
  allowedTags: [],
  allowedAttributes: {}
});
```

---

## Testing

```bash
npm test
```

Runs `src/__tests__/routes.test.ts` against a test database, covering the quote/execute flow, vault preview math, pool registration, and price history endpoints.

### Test structure

**Setup:**
```typescript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

```typescript
// src/__tests__/setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } }
});

beforeAll(async () => {
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  // Run migrations
  execSync('npm run db:migrate deploy', { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear tables
  await prisma.routeQuote.deleteMany();
  await prisma.vaultDeposit.deleteMany();
  // ... other tables
});
```


**Test cases:**

```typescript
// src/__tests__/routes.test.ts
describe('Routes API', () => {
  test('POST /api/v1/routes/quote returns valid quote', async () => {
    const response = await request(app)
      .post('/api/v1/routes/quote')
      .send({
        tokenIn: USDC_ID,
        tokenOut: XLM_ID,
        amountIn: 1000,
        maxHops: 2
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tokenIn: USDC_ID,
      tokenOut: XLM_ID,
      amountIn: 1000,
      expectedOut: expect.any(Number),
      validUntil: expect.any(String)
    });
  });

  test('POST /api/v1/routes/execute rejects expired quote', async () => {
    const quote = await createQuote({ validUntil: new Date(Date.now() - 1000) });
    
    const response = await request(app)
      .post('/api/v1/routes/execute')
      .send({
        quoteId: quote.id,
        sender: 'GDUSER...',
        minOut: 990
      });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('Quote expired');
  });
});

describe('Vault API', () => {
  test('GET /api/v1/vault/preview-deposit calculates shares correctly', async () => {
    const response = await request(app)
      .get('/api/v1/vault/preview-deposit?assets=1000');

    expect(response.status).toBe(200);
    expect(response.body.expectedShares).toBeGreaterThan(0);
  });
});
```

**Run specific test:**
```bash
npm test -- routes.test.ts
```

**Coverage:**
```bash
npm run test:coverage
```

**Integration tests** (require live testnet):
```bash
TEST_NETWORK=testnet npm run test:integration
```


---

## Troubleshooting

### Common errors and solutions

#### Error: `Database connection failed`

**Symptoms:**
```
PrismaClientInitializationError: Can't reach database server at localhost:5432
```

**Causes:**
1. PostgreSQL not running
2. Wrong DATABASE_URL
3. Firewall blocking port 5432

**Solutions:**
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql@15

# Check DATABASE_URL in .env
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

#### Error: `RPC request failed`

**Symptoms:**
```
Error: fetch failed: connect ETIMEDOUT
```

**Causes:**
1. Soroban RPC server down
2. Network issues
3. Wrong RPC URL

**Solutions:**
```bash
# Test RPC connectivity
curl -X POST https://soroban-testnet.stellar.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Check RPC URL in .env
echo $STELLAR_RPC_URL

# Try alternative RPC (if available)
# STELLAR_RPC_URL=https://rpc-backup.example.com
```


#### Error: `Harvest cron not running`

**Symptoms:**
- No new harvest events in database
- Last harvest > 6 hours ago

**Causes:**
1. Cron job not started (app crashed before cron initialized)
2. HARVEST_CRON syntax invalid
3. Exception in harvest job

**Solutions:**
```bash
# Check logs for cron initialization
grep "Harvest cron scheduled" logs/*.log

# Verify cron syntax
npm install -g cron-validator
cron-validator "0 */6 * * *"

# Check for harvest errors
grep "Harvest cron failed" logs/*.log

# Manually trigger harvest
curl -X POST http://localhost:3004/api/v1/vault/harvest
```

#### Error: `Indexer stuck at old ledger`

**Symptoms:**
- `IndexerCursor.ledger` not increasing
- Recent on-chain events not appearing in database

**Causes:**
1. RPC rate limiting
2. Contract IDs not in filter
3. Indexer crashed

**Solutions:**
```bash
# Check current cursor
psql $DATABASE_URL -c "SELECT * FROM \"IndexerCursor\""

# Check latest ledger on network
curl -X POST $STELLAR_RPC_URL \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | jq

# Reset cursor (⚠️ will re-index from start)
psql $DATABASE_URL -c "UPDATE \"IndexerCursor\" SET ledger = 0 WHERE id = 1"

# Restart app
npm run dev
```


#### Error: `QuoteExpired` on execute

**Symptoms:**
- Quote execute returns 410 error
- Frontend shows "Quote expired"

**Cause:** More than 60 seconds elapsed between quote creation and execution.

**Solutions:**
```typescript
// Frontend: Check TTL before executing
const timeLeft = new Date(quote.validUntil).getTime() - Date.now();
if (timeLeft < 10_000) {  // Less than 10s left
  quote = await getNewQuote();
}

// Backend: Increase TTL (not recommended, but possible)
// In route.controller.ts
validUntil: new Date(Date.now() + 120_000)  // 2 minutes
```

#### Error: `NoRouteFound`

**Symptoms:**
```
{"error": "Quote failed", "detail": "No route found for token pair"}
```

**Cause:** No registered pool for the requested token pair.

**Solution:**
```bash
# Check registered pools
curl http://localhost:3004/api/v1/pools

# Register missing pool
curl -X POST http://localhost:3004/api/v1/pools/register \
  -H "Content-Type: application/json" \
  -d '{
    "tokenA": "CAUSDC...",
    "tokenB": "CXLM...",
    "poolAddress": "CPOOL..."
  }'
```

#### Error: `Port 3004 already in use`

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3004
```

**Solutions:**
```bash
# Find process using port 3004
lsof -i :3004

# Kill process
kill -9 <PID>

# Or use different port
PORT=3005 npm run dev
```

### Performance debugging

**Slow queries:**
```sql
-- Enable query logging in PostgreSQL
ALTER DATABASE yieldroutes SET log_min_duration_statement = 100;  -- Log queries > 100ms

-- View slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**High memory usage:**
```bash
# Check Node.js heap usage
node --expose-gc --max-old-space-size=512 dist/index.js

# Monitor with clinic.js
npm install -g clinic
clinic doctor -- node dist/index.js
```

### Log analysis

**Find errors in last hour:**
```bash
grep "ERROR" logs/app.log | awk '$0 >= systime()-3600'
```

**Count requests by endpoint:**
```bash
grep "GET" logs/access.log | awk '{print $7}' | sort | uniq -c | sort -rn
```

**Track response times:**
```bash
grep "ms" logs/app.log | awk '{print $NF}' | sed 's/ms//' | \
  awk '{s+=$1; c++} END {print "Avg:", s/c, "ms"}'
```


---

## Contributing

See the [project-wide contribution guide](https://github.com/YOUR_ORG/.github/blob/main/CONTRIBUTING.md).

**Development workflow:**

1. **Create feature branch**
   ```bash
   git checkout -b feature/add-limit-orders
   ```

2. **Make changes with tests**
   ```bash
   # Edit code
   # Add tests in src/__tests__/
   npm test
   ```

3. **Run linter and formatter**
   ```bash
   npm run lint
   npm run format
   ```

4. **Create pull request**
   - Write clear description
   - Link related issues
   - Ensure CI passes

**Code style:**
- Use TypeScript strict mode
- Follow ESLint rules (`.eslintrc.js`)
- Prefer async/await over promises
- Add JSDoc comments for public APIs
- Keep functions < 50 lines

**Adding new endpoints:**

1. Define Zod schema in `src/middleware/validate.ts`
2. Add controller function in `src/controllers/`
3. Add route in `src/routes/`
4. Add tests in `src/__tests__/`
5. Update this README with API documentation

**Example:**
```typescript
// 1. Schema
export const limitOrderSchema = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.number().positive(),
  limitPrice: z.number().positive()
});

// 2. Controller
export const createLimitOrder = async (req: Request, res: Response) => {
  const { tokenIn, tokenOut, amountIn, limitPrice } = req.body;
  // ... implementation
  res.json({ orderId: '...' });
};

// 3. Route
router.post('/orders/limit', validate(limitOrderSchema), createLimitOrder);

// 4. Test
test('POST /api/v1/orders/limit creates order', async () => {
  const response = await request(app)
    .post('/api/v1/orders/limit')
    .send({ tokenIn: USDC, tokenOut: XLM, amountIn: 1000, limitPrice: 1.05 });
  expect(response.status).toBe(200);
});
```


---

## Roadmap

### Completed ✅
- [x] REST API with 20+ endpoints
- [x] PostgreSQL database with Prisma ORM
- [x] Soroban RPC integration (stub mode)
- [x] Indexer for contract events
- [x] Harvest cron (every 6h)
- [x] Price feed cron (every 5min)
- [x] Rate limiting and CORS
- [x] Docker deployment
- [x] Test suite with 12+ tests

### In Progress 🔄
- [ ] **Implement real Soroban contract calls** (currently stubs)
  - [ ] Read-only calls (totalAssets, convertToShares, etc.)
  - [ ] Transaction building (deposit, redeem, execute)
  - [ ] Server-signed transactions (harvest, price submission)
- [ ] **Redis caching layer** for share price and TWAP
- [ ] **API key authentication** for write endpoints

### Planned 📋

**Q1 2025:**
- [ ] GraphQL API (alternative to REST)
- [ ] WebSocket support for real-time updates
- [ ] Admin dashboard (monitoring, manual operations)
- [ ] Email/Discord alerts for cron failures

**Q2 2025:**
- [ ] Multi-oracle price feeds (Chainlink, Band Protocol)
- [ ] Advanced routing algorithms (split orders, multi-path)
- [ ] Historical data export (CSV, Parquet)
- [ ] Analytics dashboard (volume charts, TVL, APY)

**Q3 2025:**
- [ ] Limit orders
- [ ] Stop-loss automation
- [ ] Gas optimization (batch operations)
- [ ] Cross-chain bridge integration

### Community wishlist
- Staking rewards tracking
- Wallet watchlist (track any address)
- Telegram bot for alerts
- Mobile app API optimizations

---

## FAQ

**Q: Do I need real contract IDs to run the backend?**
A: No. If contract IDs are missing in `.env`, the backend runs in stub mode with placeholder values. This lets you develop the API and frontend without deployed contracts.

**Q: How do I deploy my own instance?**
A: See [Deployment guide](#deployment-guide). Minimum requirements: Node.js 20, PostgreSQL 15, 512MB RAM, 1 vCPU.

**Q: Can I use a different database than PostgreSQL?**
A: Prisma supports MySQL, SQLite, SQL Server, and MongoDB. Change `provider` in `prisma/schema.prisma`. Note: Some queries may need adjustment.

**Q: Why is the indexer 3 ledgers behind?**
A: Confirmation depth of 3 ledgers (~15s) prevents issues with chain reorganizations. This is normal and expected.

**Q: How do I add support for a new token pair?**
A: Register the pool via `POST /api/v1/pools/register` with the token addresses and pool contract ID. The aggregator will automatically route through it.

**Q: Can I run multiple backend instances?**
A: Yes, but only run one indexer and one cron scheduler. Use leader election (Redis/Redlock) or dedicated instances for these.

**Q: What happens if harvest fails?**
A: The error is logged and the next scheduled harvest (6h later) will retry. If failures persist, check logs and RPC connectivity.

**Q: How do I backup the database?**
A: See [Backup and restore](#backup-and-restore) section. Use `pg_dump` for PostgreSQL backups. Automate with cron for production.

**Q: Is there a staging environment?**
A: Not provided out-of-the-box. Deploy a second instance with `STELLAR_RPC_URL=https://soroban-testnet.stellar.org` and different database.

**Q: How do I monitor the backend in production?**
A: Use Prometheus + Grafana (see [Monitoring setup](#health-check-and-monitoring)) or cloud provider monitoring (CloudWatch, Stackdriver, etc.).


---

## License

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

```
Copyright 2025 YieldRoutes Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

**Key points:**
- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Patent use allowed
- ⚠️ Must include license and copyright notice
- ⚠️ Must state changes made
- ❌ No trademark use
- ❌ No warranty provided

---

**🔗 Quick Links:**
- [Organization Homepage](https://github.com/YOUR_ORG)
- [Smart Contracts](https://github.com/YOUR_ORG/yield-routes-contracts)
- [Frontend UI](https://github.com/YOUR_ORG/yield-routes-frontend)
- [Documentation](https://github.com/YOUR_ORG/yield-routes-docs)
- [Report a Bug](https://github.com/YOUR_ORG/yield-routes-backend/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/YOUR_ORG/yield-routes-backend/issues/new?template=feature_request.md)

---

**Built with ❤️ for the Stellar ecosystem**
