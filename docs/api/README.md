# Andemta API Documentation

## Overview

The Andemta backend API is built using **NestJS** and provides RESTful endpoints for the marketplace frontend and external integrations.

- **Base URL (Local Development):** `http://localhost:4000/api/v1`
- **Global Prefix:** `/api/v1`
- **Content Type:** `application/json`

---

## Standard Health Endpoint

### `GET /api/v1/health`

Verifies that the backend process is running and reachable.

#### Request
```http
GET /api/v1/health HTTP/1.1
Host: localhost:4000
Accept: application/json
```

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "timestamp": "2026-11-02T08:15:00.000Z",
  "service": "andemta-api",
  "version": "0.1.0",
  "uptime": 128,
  "environment": "development"
}
```

---

## Response Envelope Conventions

Standard API responses in subsequent phases follow the common structure defined in `@andemta/shared`:

```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}
```

---

## Error Handling

All error responses return standardized HTTP status codes and JSON envelopes:
- `400 Bad Request`: Validation failure or malformed input.
- `401 Unauthorized`: Missing or expired access token.
- `403 Forbidden`: Insufficient role or permission.
- `404 Not Found`: Target resource does not exist.
- `500 Internal Server Error`: Unhandled application error.

