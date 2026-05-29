# Implementation Plan: Railway Production Auth Fix

## Overview

Three files need changes. The fix is surgical: one cookie attribute, one missing fetch option, and one documentation update. Build verification confirms no TypeScript regressions.

## Tasks

- [x] 1. Fix `sameSite: 'strict'` → `sameSite: 'lax'` in `backend/src/routes/auth.ts`
  - [x] 1.1 Change `sameSite: 'strict'` to `sameSite: 'lax'` in the `res.cookie()` call inside `POST /api/auth/login`
  - [x] 1.2 Update `res.clearCookie('session_token')` in `POST /api/auth/logout` to pass `{ sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }` so the browser honours the clear directive
  - [x] 1.3 Verify `httpOnly: true` and `secure: process.env.NODE_ENV === 'production'` are unchanged
  - **Files**: `backend/src/routes/auth.ts`
  - **Acceptance criteria**: 1.1, 1.2, 1.3, 1.4, 1.5

- [x] 2. Add `credentials: 'include'` to the missing `fetch` call in `NumberList.tsx`
  - [x] 2.1 In `frontend/src/components/NumberList.tsx`, add `{ credentials: 'include' }` as the second argument to the `fetch(apiUrl(...))` call that requests `/api/datasets/:id/numbers`
  - [x] 2.2 Confirm no other logic in the file is changed
  - **Files**: `frontend/src/components/NumberList.tsx`
  - **Acceptance criteria**: 2.1, 2.2, 2.3

- [x] 3. Audit and confirm all other raw `fetch` calls are safe
  - [x] 3.1 Grep the frontend for all `fetch(` calls and verify each one either uses `apiFetch` or includes `credentials: 'include'`
  - [x] 3.2 Confirm `ValidationPanel.tsx`, `GeneratorPanel.tsx`, `Datasets.tsx`, `Campaigns.tsx`, `PipelineWizard.tsx` all have `credentials: 'include'` on their raw fetch calls
  - [x] 3.3 Confirm `WhatsappPanel.tsx` and `WhatsappLauncher.tsx` use only `apiFetch` (no raw fetch to `/api/*`)
  - **Files**: Read-only audit — no changes expected
  - **Acceptance criteria**: 3.1, 3.2, 3.3

- [x] 4. Update `backend/.env.example` with Railway production variable documentation
  - [x] 4.1 Add `NODE_ENV=production` with a comment explaining it must be set on Railway
  - [x] 4.2 Add a comment to `SESSION_SECRET` specifying minimum 32 random characters
  - [x] 4.3 Add a comment to `CORS_ORIGIN` clarifying it is only needed when the frontend is on a different origin (not needed for same-origin Railway deployments where Express serves the Vite build)
  - [x] 4.4 Add a comment noting that `PORT` is set automatically by Railway and does not need to be configured manually
  - [x] 4.5 Preserve all existing development variables unchanged
  - **Files**: `backend/.env.example`
  - **Acceptance criteria**: 4.1, 4.2, 4.3

- [x] 5. Build verification
  - [x] 5.1 Run `cd backend && npm run build` and confirm it exits with code 0 (no TypeScript errors)
  - [x] 5.2 Run `cd frontend && npm run build` and confirm it exits with code 0 (no TypeScript/Vite errors)
  - [x] 5.3 Confirm only `backend/src/routes/auth.ts`, `frontend/src/components/NumberList.tsx`, and `backend/.env.example` have been modified
  - **Acceptance criteria**: 5.1, 5.2, 5.3, 5.4, 5.5

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2", "3", "4"],
      "description": "Independent changes — cookie fix, fetch fix, audit, and docs can be done in any order"
    },
    {
      "wave": 2,
      "tasks": ["5"],
      "description": "Build verification — depends on tasks 1 and 2 being complete"
    }
  ]
}
```

## Notes

- Task 3 is a read-only audit. Based on the pre-implementation code review, no changes are expected. If a raw `fetch` call without `credentials: 'include'` is found in a file not listed above, add the option following the same pattern as task 2.
- The `sameSite: 'lax'` change is safe for local development — `lax` works correctly on `localhost` and does not require HTTPS.
- Do NOT change `backend/src/auth/session.ts`, `frontend/src/utils/api.ts`, or `frontend/src/stores/auth.ts`.
