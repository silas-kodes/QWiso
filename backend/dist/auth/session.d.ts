/**
 * Server-side session management
 * Secure cookie-based sessions with SQLite storage
 */
import type { Request, Response, NextFunction } from 'express';
export interface SessionData {
    authenticated: boolean;
    createdAt: number;
    [key: string]: unknown;
}
export declare function createSession(): {
    token: string;
    expiresAt: number;
};
export declare function validateSession(token: string): SessionData | null;
export declare function extendSession(token: string): boolean;
export declare function destroySession(token: string): void;
export declare function requireSession(req: Request, res: Response, next: NextFunction): void;
export declare function optionalSession(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=session.d.ts.map