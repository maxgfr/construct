# Data model

_Seeded by inference from the brief — verify each entity and extend attributes during authoring._

## Article

| Attribute | Type |
|---|---|
| id | uuid |
| url | text |
| title | text |
| author | text |
| body | text |
| excerpt | text |
| savedAt | timestamptz |
| readPosition | float |
| syncedAt | timestamptz |

_Referenced by: FR-001, FR-002, FR-003, FR-004, FR-005_

## Tag

| Attribute | Type |
|---|---|
| id | uuid |
| name | text |
| createdAt | timestamptz |

_Referenced by: FR-003, FR-004_

## ImportJob

| Attribute | Type |
|---|---|
| id | uuid |
| source | text |
| totalEntries | int |
| committedEntries | int |
| failures | jsonb |
| startedAt | timestamptz |
| finishedAt | timestamptz |

_Referenced by: FR-004_
