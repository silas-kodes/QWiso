/**
 * API utility — centralised fetch wrapper with safe JSON parsing and 401 handling.
 *
 * Since the frontend is served by the same Express server on Railway,
 * all API calls use relative paths (/api/...) by default.
 * VITE_API_URL can override this for local dev pointing at a separate backend.
 */

// Base URL: empty string = same origin (works on Railway).
// Override with VITE_API_URL for local dev if backend runs on a different port.
function getBase(): string {
  const env = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')
  if (env) return env
  // Same-origin: no base needed
  return ''
}

export function apiUrl(path: string): string {
  return `${getBase()}${path}`
}

export function wsUrl(path: string): string {
  const base = getBase()
  if (base) {
    // Absolute base provided — convert http(s) → ws(s)
    const url = new URL(base)
    const prefix = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${prefix}//${url.host}${path}`
  }
  // Same-origin WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

/**
 * Safe fetch wrapper:
 * - Always sends credentials (cookies)
 * - Checks Content-Type before calling .json()
 * - Throws a descriptive Error on non-2xx responses
 * - Calls onUnauthorized (logout) on 401 to prevent infinite retry loops
 */
let _onUnauthorized: (() => void) | null = null

export function registerUnauthorizedHandler(fn: () => void) {
  _onUnauthorized = fn
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers,
  })

  // Handle 401 globally — trigger logout to stop infinite retry loops
  if (res.status === 401) {
    console.warn(`[API] 401 Unauthorized on ${path} — logging out`)
    _onUnauthorized?.()
    throw new Error('Unauthorized')
  }

  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  if (!res.ok) {
    // Safe error extraction — never blindly call .json() on HTML error pages
    let message = `HTTP ${res.status}`
    if (isJson) {
      try {
        const body = await res.json()
        message = body?.error ?? body?.message ?? message
      } catch {
        // ignore parse failure
      }
    } else {
      const text = await res.text().catch(() => '')
      console.error(`[API] Non-JSON error response from ${path}:`, res.status, text.slice(0, 200))
    }
    throw new Error(message)
  }

  if (!isJson) {
    const text = await res.text().catch(() => '')
    console.error(`[API] Expected JSON but got non-JSON from ${path}:`, text.slice(0, 200))
    throw new Error('Expected JSON response from API')
  }

  return res.json() as Promise<T>
}
