/**
 * Authentication routes
 */

import { Router } from 'express';
import { createSession, destroySession, type SessionData } from '../auth/session.js';

const router = Router();
const APP_PASSWORD = process.env.APP_PASSWORD || 'qwiso123';

// Login - requires password (additional guardrail behind Basic Auth)
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (password !== APP_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const { token, expiresAt } = createSession();
  
  // Set secure cookie
  res.cookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt * 1000),
  });

  res.json({ 
    success: true, 
    expiresAt: expiresAt * 1000,
  });
});

// Logout
router.post('/logout', (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    destroySession(token);
  }
  res.clearCookie('session_token', { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ success: true });
});

// Check session status
router.get('/me', (req, res) => {
  const session = (req as typeof req & { session?: SessionData }).session;
  
  if (session?.authenticated) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;
