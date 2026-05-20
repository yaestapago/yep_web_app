# API Contracts

Este archivo resume los contratos publicos del backend. Para integraciones automaticas, generacion de clientes o agentes de IA, usa `openapi.yaml` como fuente principal.

## Source Of Truth

- Machine-readable contract: `openapi.yaml`
- Human/agent guide: `API_CONTRACTS.md`
- Postman collection: `postman/yep_api_core.postman_collection.json`

Published HTTP endpoints:

```txt
GET /
GET /contracts
GET /openapi.yaml
GET /API_CONTRACTS.md
GET /api-contracts.md
GET /postman/yep_api_core.postman_collection.json
```

## Base URLs

Local:

```txt
http://localhost:3000
```

AWS Elastic Beanstalk:

```txt
http://yep-api-core-env.eba-535xtwxk.us-east-1.elasticbeanstalk.com
```

## Auth Rules

Endpoints publicos:

```txt
GET /health
POST /auth/register
POST /auth/login
```

Endpoints protegidos:

```txt
GET /auth/me
POST /notifications/receive
GET /notifications
GET /notifications/:id
```

Header requerido:

```txt
Authorization: Bearer <accessToken>
```

El JWT contiene:

```json
{
  "sub": "userId",
  "userId": "userId",
  "accountId": "accountId",
  "email": "user@example.com",
  "role": "owner"
}
```

## Account Isolation

Las aplicaciones cliente no deben enviar `accountId` al crear notificaciones.

El backend obtiene `accountId` desde el JWT y lo usa para:

- Crear notificaciones.
- Listar solo notificaciones de la cuenta autenticada.
- Consultar solo notificaciones de la cuenta autenticada.

## Auth Contracts

### POST /auth/register

Request:

```json
{
  "accountName": "Tienda Don Pedro",
  "firstName": "Pedro",
  "lastName": "Ramirez",
  "email": "pedro@example.com",
  "password": "secret123"
}
```

Response `201`:

```json
{
  "accessToken": "jwt...",
  "user": {
    "id": "userId",
    "accountId": "accountId",
    "firstName": "Pedro",
    "lastName": "Ramirez",
    "email": "pedro@example.com",
    "role": "owner"
  }
}
```

### POST /auth/login

Request:

```json
{
  "email": "pedro@example.com",
  "password": "secret123"
}
```

Response `200`: same shape as register.

### GET /auth/me

Response `200`:

```json
{
  "user": {
    "id": "userId",
    "accountId": "accountId",
    "firstName": "Pedro",
    "lastName": "Ramirez",
    "email": "pedro@example.com",
    "role": "owner"
  }
}
```

## Notification Contracts

### POST /notifications/receive

Request:

```json
{
  "id": 1,
  "notification": {
    "title": "Pago recibido",
    "message": "Transferencia por $50.000",
    "source": "mobile"
  }
}
```

Valid `source` values:

```txt
web
mobile
whatsapp
api
```

Response `201`:

```json
{
  "received": true,
  "id": "notificationId",
  "externalId": "1",
  "status": "received",
  "timestamp": "2026-05-20T13:35:51.000Z"
}
```

### GET /notifications

Response `200`:

```json
{
  "notifications": [
    {
      "id": "notificationId",
      "accountId": "accountId",
      "source": "mobile",
      "externalId": "1",
      "rawPayload": {
        "id": 1,
        "notification": {
          "title": "Pago recibido",
          "message": "Transferencia por $50.000",
          "source": "mobile"
        }
      },
      "status": "received",
      "createdAt": "2026-05-20T13:35:51.000Z",
      "updatedAt": "2026-05-20T13:35:51.000Z"
    }
  ]
}
```

### GET /notifications/:id

Response `200`:

```json
{
  "notification": {
    "id": "notificationId",
    "accountId": "accountId",
    "source": "mobile",
    "externalId": "1",
    "rawPayload": {},
    "status": "received",
    "createdAt": "2026-05-20T13:35:51.000Z",
    "updatedAt": "2026-05-20T13:35:51.000Z"
  }
}
```

## Common Errors

Invalid or missing token:

```json
{
  "message": "Token de autenticacion requerido",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Database unavailable:

```json
{
  "statusCode": 503,
  "message": "La base de datos no esta disponible. Revisa el acceso de red de MongoDB Atlas para AWS Elastic Beanstalk."
}
```

Validation errors use NestJS `ValidationPipe` and return `400`.

## Guidance For AI Agents

When building another app against this API:

1. Read `openapi.yaml` first.
2. Do not invent request fields that are not in the OpenAPI schema.
3. Never send `accountId` in notification creation.
4. Store and reuse `accessToken` after register/login.
5. Treat notification payload contents as source-specific raw data, but keep `notification.source` as one of the enum values.
6. For generated SDKs, prefer the OpenAPI operation paths and schema names as identifiers.