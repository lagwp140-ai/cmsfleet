# API Standardization

The backend API now follows a shared transport contract for all JSON endpoints.

## Response envelopes

Successful JSON responses:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req-123",
    "timestamp": "2026-03-19T12:00:00.000Z",
    "method": "GET",
    "path": "/api/admin/dashboard",
    "statusCode": 200
  }
}
```

Error JSON responses:

```json
{
  "success": false,
  "error": {
    "code": "validation_error",
    "message": "The request failed validation.",
    "details": []
  },
  "meta": {
    "requestId": "req-124",
    "timestamp": "2026-03-19T12:00:01.000Z",
    "method": "POST",
    "path": "/api/auth/login",
    "statusCode": 400
  }
}
```

## Error code strategy

- `bad_request`: malformed parameters or payloads
- `unauthorized`: missing or expired authentication
- `forbidden`: permission denied
- `not_found`: unknown route or resource
- `conflict`: duplicate or state conflict
- `validation_error`: schema or request validation failure
- `internal_error`: unexpected backend failure

## Documentation

- OpenAPI JSON: `/api/openapi.json`
- Human-readable API docs: `/api/docs`

## Frontend contract

The frontend now uses a single request helper that unwraps `data` from successful envelopes and converts structured error envelopes into `ApiError` instances. This keeps the console clients aligned with the backend contract and makes future integrations easier to standardize.
