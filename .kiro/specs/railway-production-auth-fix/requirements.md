# Requirements Document

## Introduction

The QWISO app is broken in production on Railway. Every request to a protected API route returns 401 Unauthorized because the `session_token` cookie is dropped by the browser after Railway's HTTPS reverse-proxy redirect chain. The root cause is `sameSite: 'strict'` on the cookie — strict-mode cookies are not forwarded after a redirect hop. A secondary issue is that `NumberList.tsx` makes a raw `fetch()` call to a protected endpoint without `credentials: 'include'`, so the cookie is never sent for that call even when it exists.

These requirements cover the minimal set of changes needed to restore production auth without altering local dev behaviour or refactoring unrelated code.

---

## Requirements

### Requirement 1: Fix Session Cookie SameSite Attribute

**User Story:** As a user of the deployed Railway app, I want my session to persist after login so that I can access protected pages without being immediately logged out.

#### Acceptance Criteria

1.1. The `session_token` cookie set on `POST /api/auth/login` MUST use `sameSite: 'lax'` (not `'strict'`).

1.2. The `secure` flag on the cookie MUST remain `process.env.NODE_ENV === 'production'` — unchanged from current behaviour.

1.3. The `httpOnly: true` flag MUST remain unchanged.

1.4. The `res.clearCookie('session_token')` call on `POST /api/auth/logout` MUST include `{ sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }` so the browser honours the clear directive.

1.5. Local development behaviour MUST NOT change — `secure: false` in dev, cookie still set and cleared correctly.

1.6. After the fix is deployed, a user who logs in on Railway MUST be able to navigate to `/datasets` and receive a 200 response (not 401).

---

### Requirement 2: Add Missing `credentials: 'include'` to NumberList Fetch

**User Story:** As a user viewing a dataset's number list, I want the numbers to load correctly in production so that I can see validation results.

#### Acceptance Criteria

2.1. The `fetch()` call in `frontend/src/components/NumberList.tsx` that requests `/api/datasets/:id/numbers` MUST include `credentials: 'include'` in its options.

2.2. The fix MUST NOT change any other logic in `NumberList.tsx` — only add the missing option to the existing `fetch` call.

2.3. After the fix, clicking "View" on a dataset in production MUST load the number list without a 401 error.

---

### Requirement 3: Confirm No Other Raw Fetch Calls Are Missing Credentials

**User Story:** As a developer deploying to Railway, I want confidence that all protected API calls send the session cookie so that no other page silently breaks in production.

#### Acceptance Criteria

3.1. All raw `fetch()` calls to `/api/*` endpoints in the frontend MUST include `credentials: 'include'`.

3.2. The following files have been audited and confirmed safe (no changes needed):
- `frontend/src/components/ValidationPanel.tsx` — both fetch calls already have `credentials: 'include'`
- `frontend/src/components/GeneratorPanel.tsx` — both fetch calls already have `credentials: 'include'`
- `frontend/src/pages/Datasets.tsx` (`exportValidNumbers`) — has `credentials: 'include'`, checks `res.ok` before `res.text()`, no `.json()` on error responses
- `frontend/src/pages/Campaigns.tsx` (`handleStart`, `handlePause`) — both have `credentials: 'include'`
- `frontend/src/components/PipelineWizard.tsx` — CSV export fetch has `credentials: 'include'`; validate call uses `apiFetch`

3.3. All WhatsApp-related API calls in `frontend/src/components/WhatsappPanel.tsx` use `apiFetch` (which always sends `credentials: 'include'`). No raw `fetch` calls exist in WhatsApp components.

---

### Requirement 4: Document Required Railway Environment Variables

**User Story:** As a developer deploying QWISO to Railway, I want clear documentation of the required environment variables so that the app starts correctly and auth works in production.

#### Acceptance Criteria

4.1. The `backend/.env.example` file MUST document the following variables with production-appropriate comments:
- `NODE_ENV=production`
- `SESSION_SECRET=<strong random value, min 32 chars>`
- `APP_PASSWORD=<your chosen password>`
- `PORT` — note that Railway sets this automatically
- `CORS_ORIGIN` — note that this is only needed if the frontend is on a different origin than the backend (not needed for same-origin Railway deployments)

4.2. The documentation MUST clarify that `CORS_ORIGIN` is NOT required for the standard Railway deployment where Express serves both the API and the Vite-built frontend from the same origin.

4.3. The existing development-only variables (`DB_PATH`, `WA_AUTH_PATH`, `WA_HEADLESS`, etc.) MUST remain in `.env.example` with their current values.

---

### Requirement 5: No Regressions

**User Story:** As a developer, I want the production fix to not break local development or any unrelated functionality.

#### Acceptance Criteria

5.1. The `sameSite: 'lax'` change MUST NOT affect local development — the cookie still works on `localhost` with `sameSite: 'lax'`.

5.2. No routes, middleware, database queries, or business logic outside of `backend/src/routes/auth.ts` and `frontend/src/components/NumberList.tsx` MUST be modified.

5.3. The `apiFetch` wrapper in `frontend/src/utils/api.ts` MUST NOT be modified.

5.4. The session middleware in `backend/src/auth/session.ts` MUST NOT be modified.

5.5. The `useAuthStore` in `frontend/src/stores/auth.ts` MUST NOT be modified.


---

## Glossary

- **sameSite**: A cookie attribute controlling when the browser sends the cookie on cross-site requests. `strict` = never on cross-site; `lax` = on top-level GET navigations; `none` = always (requires Secure).
- **Railway**: The cloud hosting platform where QWISO is deployed. It terminates TLS and proxies requests to the Express server, introducing a redirect hop that causes `sameSite: 'strict'` cookies to be dropped.
- **session_token**: The HttpOnly cookie set by Express on login that identifies the user's server-side session stored in SQLite.
- **requireSession**: Express middleware in `backend/src/auth/session.ts` that reads and validates the `session_token` cookie. Returns 401 if the cookie is absent or invalid.
- **apiFetch**: The centralised fetch wrapper in `frontend/src/utils/api.ts` that always sends `credentials: 'include'`, checks Content-Type before parsing JSON, and handles 401 globally by triggering logout.
- **credentials: 'include'**: The `fetch()` option that instructs the browser to send cookies (including `session_token`) with the request. Without this, the browser omits cookies on same-origin requests in some contexts.
