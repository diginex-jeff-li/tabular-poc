# Architecture

## System Overview

```mermaid
graph TB
    subgraph "sc-boilerplate monorepo"
        Contracts["bp-contracts<br/>oRPC + Zod<br/>Shared API contracts"]
        Backend["bp-backend<br/>NestJS 11 + TypeORM<br/>PostgreSQL + Redis"]
        Frontend["bp-frontend<br/>Vue 3.5 + TSX<br/>Nuxt UI + Pinia Colada"]
    end

    Contracts -->|"dist/esm + dist/types"| Backend
    Contracts -->|"dist/esm + dist/types"| Frontend
    Backend -->|"RESTful routes<br/>(OpenAPILink)" Frontend

    subgraph "Infrastructure"
        PG[("PostgreSQL 17")]
        Redis[("Redis 7")]
    end

    Backend --> PG
    Backend --> Redis
```

## Contract-First Flow

```mermaid
graph LR
    subgraph "bp-contracts"
        Schemas["Zod Schemas<br/>ItemSchema, enums"]
        Requests["Request Schemas<br/>ListItems, CreateItem, ..."]
        Responses["Response Schemas<br/>ListItemsResponse, ..."]
        Routes["oRPC Routes<br/>oc.route().input().output()"]
    end

    Schemas --> Requests
    Schemas --> Responses
    Requests --> Routes
    Responses --> Routes
    Routes -->|"contract object"| Backend["bp-backend<br/>@Implement(route)"]
    Routes -->|"contract object"| Frontend["bp-frontend<br/>OpenAPILink(contract)"]

    style Schemas fill:#755DCB,color:#fff
    style Routes fill:#755DCB,color:#fff
```

## Data Flow

```mermaid
sequenceDiagram
    participant UI as Frontend Page
    participant API as apis/item.ts
    participant ORPC as oRPC Client
    participant Nest as NestJS Controller
    participant Svc as ItemService
    participant Repo as TypeORM Repository
    participant DB as PostgreSQL

    UI->>API: listItems()
    API->>ORPC: orpc.item.listItems.queryOptions()
    ORPC->>Nest: GET /api/items?page=1&perPage=20
    Nest->>Svc: listItems(input)
    Svc->>Repo: findAndCount()
    Repo->>DB: SELECT * FROM "Item"
    DB-->>Repo: rows
    Repo-->>Svc: entities
    Svc-->>Nest: serialized response
    Nest-->>ORPC: JSON response
    ORPC-->>API: query result
    API-->>UI: reactive data
```

## Testing Strategy

```mermaid
graph TB
    subgraph "Layered Quality Pipeline"
        L1["1. Type Safety<br/>tsc --noEmit<br/>~0.5s"]
        L2["2. Lint<br/>oxlint --fix<br/>milliseconds"]
        L3["3. Backend E2e<br/>vitest + supertest<br/>real PostgreSQL<br/>~15s"]
        L4["4. Frontend Components<br/>vitest + @vue/test-utils<br/>happy-dom<br/>mocked API"]
    end

    L1 --> L2 --> L3 --> L4

    subgraph "Backend E2e Details"
        E1["fileParallelism: false<br/>avoids DB contention"]
        E2["Tests at oRPC route boundary<br/>GET /api/items, POST /api/items, ..."]
        E3["Real PostgreSQL + Redis<br/>not mocked"]
        E4["Cleanup between tests<br/>flushdb + delete rows"]
    end

    L3 --> E1
    L3 --> E2
    L3 --> E3
    L3 --> E4

    style L1 fill:#007F45,color:#fff
    style L2 fill:#155DFC,color:#fff
    style L3 fill:#755DCB,color:#fff
    style L4 fill:#A65F00,color:#fff
```
