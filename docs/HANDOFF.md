# Integration handoff

## Contract baseline — 2026-11-06

The [contract package baseline](../packages/contracts/README.md) now defines the planned HTTP/internal/event surface, runtime validation and generated OpenAPI. Its explicit policies supersede the older contract proposals below: public signup is STUDENT only (Admin provisions Instructor), Course publishing requires Admin review, new result APIs separate attempt/grading state, and versioned enrollment/graded events pin requirements/assessment snapshots. Existing v1 event types and legacy result types remain available. No business endpoints, mock dataset or seed are implemented by this contract change; producer/consumer review and external Function List reconciliation remain required.

## Local verification — 2026-11-05

Verified on Windows with Node v24.21.0 and npm 11.21.0:

| Check | Result |
|---|---|
| `npm ci` | Passed; 711 packages installed |
| `npm run build` | Passed: contracts, auth and all five Nest applications |
| `npm run typecheck` | Passed; only contracts/auth currently expose this script |
| `npm test` | Passed: five scaffold Jest tests and four mock auth tests |
| `git diff --check` | Passed |
| Quiz scaffold startup and HTTP GET `/` | Passed: 200, `Hello World!`; temporary process stopped |

Install reported 26 dependency vulnerabilities (5 low, 19 moderate, 2 high). Dependency remediation needs a separate compatibility review. This run did not exercise registration, JWT verification, database seeds, RabbitMQ or a cross-service business flow. The new CI workflow has not yet run on GitHub, and branch protection has not been verified or enabled. Onboarding was tested from a clean dependency install in the existing checkout, not a fresh clone.

## Authentication contract

Public registration creates `STUDENT` only; an optional role must also be `STUDENT`. Admin provisions Instructor through the administrative role endpoint. Identity must validate the HTTP body at runtime, reject `ADMIN`, `INSTRUCTOR` and unknown roles with `400 VALIDATION_ERROR`, and never spread the request body into a user entity. The registration endpoint is still unimplemented; consumers must explicitly call the shared runtime parser and enforce authorization in the service.

Identity issues the existing `JwtClaims` (`sub`, `email`, `role`, `iss`, `iat`, `exp`). Proposed verification baseline: RS256, issuer `identity-service`, explicit algorithm allowlist, signature and expiry verification at Gateway and each service, with the original Bearer token forwarded internally. Validate claim shapes; missing/invalid credentials return 401, role or ownership failures return 403. Never trust client `X-User-Id`/`X-Role` headers. Internal service calls need a separate service credential policy before deployment; a user token is not service authentication.

Services derive `AuthUser` from verified identity and enforce ownership using their own data. Mock auth is opt-in for development/test only; see [mock auth](../packages/auth/README.md). It must never serve as a fallback after JWT verification fails. JWT implementation, key rotation and service credentials remain owner review items.

## Course approval proposal — requires Course/Admin consumer review

`DRAFT -> IN_REVIEW -> PUBLISHED | REJECTED`; an owner Instructor may revise a rejected course and resubmit (`REJECTED -> IN_REVIEW`). Only an Admin can approve/reject an `IN_REVIEW` course. Invalid transitions return `409 INVALID_COURSE_TRANSITION`; role/ownership failures return 403. Rejection requires a nonblank reason. Persist reviewer ID, server review timestamp and rejection reason; retain review history when resubmitting. The client cannot choose reviewer identity or review time. Enrollment remains restricted to `PUBLISHED` courses. Agree endpoint paths and concurrency/version handling before implementing this proposal.

## Fixtures and seed strategy

[IDs](../packages/contracts/fixtures/ids.json) are stable shared identifiers, not seeded records. Each service owns its migrations and idempotent development/test seed; no cross-database foreign keys. Seeds must refuse production, upsert by fixture ID and never overwrite unrelated records. Use synthetic credentials created at seed time, never stored plaintext in fixtures.

Baseline scenario to encode in seed/mock data: instructorA owns nestjsBasics; chapter1 and lesson1 belong to it; quiz1 belongs to lesson1; studentBEnrollment links studentB to nestjsBasics; submittedAttempt links studentB and quiz1; gradedEvent references that attempt. draftCourse must remain unavailable for enrollment. Publish a relationship manifest and verify these relations before claiming seed readiness. IDs alone do not establish these relationships. No database seed command exists yet.

Enrollment checks, quiz results and v1 event types already live in [contracts](../packages/contracts/src/index.ts). Consumers validate runtime payloads, handle duplicate `eventId` idempotently, and treat unavailable enrollment checks as 503/504 rather than authorization success. Breaking event changes require a new routing key/version. Review schema/error changes with producer and consumer owners.

## Configuration and onboarding

Each app/service has an `.env.example` describing planned integration settings. Current scaffolds read `PORT` from the process environment; copying a template does not load it or connect integrations. Export variables in the shell until the service adds and documents its config loader. Keep mock auth disabled by default. Do not commit real keys or database URLs.

From a clean checkout: `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, `git diff --check`. Start a built scaffold using `node services/quiz-service/dist/main.js` and confirm `GET http://127.0.0.1:3003/` returns `Hello World!`. This checks scaffold onboarding only, not database or cross-service readiness.

## Ownership and merge requirements

Service owners are still unassigned except Gateway in the [README](../README.md); the team must supply names. Shared-contract PRs require producer and consumer review. Definition of Done: validation and negative authorization cases, documented API/errors, migrations/seed if applicable, environment template updates, passing relevant tests and CI, and explicit integration limitations. Never claim a scaffold test proves a business flow.

Repository administrators should require pull requests, one approving review and the `verify` CI status on `main`, block force pushes and deletion, and apply rules to administrators where supported. Adding a workflow does not enable branch protection; verify this in GitHub repository settings.
