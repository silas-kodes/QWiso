/**
 * Qwiso Backend Server
 * Express + WebSocket for unified number generation and WhatsApp validation
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

// Import database (initializes connection)
import './db/db.js';

// Import routes
import authRoutes from './routes/auth.js';
import datasetRoutes from './routes/datasets.js';
import whatsappRoutes from './routes/whatsapp.js';
import exportRoutes from './routes/exports.js';
import smsRoutes from './routes/sms.js';
import messagingRoutes from './routes/messaging.js';
import campaignsRoutes from './routes/campaigns.js';
import { automationRoutes } from './routes/automation.js';

// Import middleware
import { optionalSession } from './auth/session.js';

// Import WebSocket
import { initializeWebSocket } from './websocket.js';

// Import WhatsApp client
import { getWhatsAppManager } from './baileys/client.js';
import { getAllWASessions, getRunningJobs, updateJobStatus } from './db/queries.js';

const app = express();
const server = createServer(app);

const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// Support multiple comma-separated origins, e.g.:
//   CORS_ORIGIN=https://qwiso.silaskodes.workers.dev,http://localhost:5173
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

// Trust proxy (for Caddy/Nginx behind-the-scenes)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false,
}));

// CORS — allow configured origins with credentials and common methods/headers
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
}));

// Handle preflight requests for all routes
app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: NODE_ENV === 'development' ? 10000 : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000', 1000),
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === 'development' ? 10000 : 1000, // 10 attempts in prod, generous 10000 in dev
  message: { error: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware (optional on all routes)
app.use(optionalSession);

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: NODE_ENV,
    whatsapp: getWhatsAppManager().getInstances(),
  });
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
// Dataset routes don't require session (public access for number generation)
app.use('/api/datasets', datasetRoutes);
// WhatsApp routes don't require session for QR code display (chicken-and-egg problem)
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/automation', automationRoutes);

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Error:', err);
  res.status(500).json({
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Initialize WebSocket
initializeWebSocket(server);

// Serve frontend static files (built by Vite)
// Try multiple possible paths for the frontend dist directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// On Railway: project root = /app, backend/dist/server.js = /app/backend/dist/server.js
const possibleDistPaths = [
  join(__dirname, 'public'),                         // copied by nixpacks build: backend/dist/public/
  join(__dirname, '../../frontend/dist'),             // from dist/server.js: /app/backend/dist/ -> /app/frontend/dist/
  join(__dirname, '../../../frontend/dist'),           // from src/server.ts (tsx watch)
  join(process.cwd(), '..', 'frontend', 'dist'),       // from CWD (backend/): /app/backend/ -> /app/frontend/dist/
  '/app/frontend/dist',                                 // Railway default absolute path
];

let frontendDist = possibleDistPaths.find(p => existsSync(p));

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.map': 'application/json',
};

if (frontendDist) {
  console.log(`[Server] Serving frontend from: ${frontendDist}`);
  // Log first few asset files for debugging
  try {
    const assetsDir = join(frontendDist, 'assets');
    if (existsSync(assetsDir)) {
      const files = readdirSync(assetsDir);
      console.log(`[Server] Assets found: ${files.slice(0, 10).join(', ')}${files.length > 10 ? `... (+${files.length - 10} more)` : ''}`);
    } else {
      console.warn(`[Server] No assets/ directory found at ${frontendDist}`);
      console.warn(`[Server] Dist contents: ${readdirSync(frontendDist).join(', ')}`);
    }
  } catch { /* ignore */ }
  const indexHtml = readFileSync(join(frontendDist, 'index.html'), 'utf-8');

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws') || req.path === '/health') {
      next();
      return;
    }
    // Strip leading slash so path.join doesn't treat it as absolute
    const relativePath = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
    const filePath = join(frontendDist!, relativePath);
    if (!existsSync(filePath)) {
      if (req.path.includes('.')) {
        res.status(404).type('text').send('Not found');
        return;
      }
      res.type('html').send(indexHtml);
      return;
    }
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    res.type(MIME_TYPES[ext] || 'octet-stream').sendFile(filePath);
  });
} else {
  console.warn(`[Server] Frontend dist not found (tried: ${possibleDistPaths.join(', ')}) — serving API only`);
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

// Start server
server.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║           Qwiso Backend Server                         ║
╠════════════════════════════════════════════════════════╣
║  Environment: ${NODE_ENV.padEnd(40)} ║
║  Port:       ${PORT.toString().padEnd(40)} ║
║  CORS:       ${allowedOrigins.join(', ').padEnd(40)} ║
╚════════════════════════════════════════════════════════╝
  `);

  // Auto-start WhatsApp if session exists and was not explicitly disconnected
  const manager = getWhatsAppManager();
  const autoStart = process.env.WA_AUTO_START !== 'false';
  if (autoStart) {
    console.log('[Server] Auto-starting active WhatsApp accounts...');
    try {
      const savedSessions = getAllWASessions();
      const activeSessions = savedSessions.filter(s => s.state !== 'disconnected');
      
      if (savedSessions.length === 0) {
        // First boot or no sessions: initialize default 'main' instance
        await manager.initializeAll([]);
      } else if (activeSessions.length > 0) {
        console.log(`[Server] Found ${activeSessions.length} active sessions to restore:`, activeSessions.map(s => s.id));
        for (const config of activeSessions) {
          const inst = await manager.createInstance(config.name, config.id);
          if (!inst.hasSession()) {
            console.warn(`[Server] Session ${config.id} (${config.name}) has no saved credentials on disk — will need re-authentication.`);
          }
          inst.initialize().catch(err => console.error(`[WA Manager] Failed to init ${config.id}:`, err));
        }
      } else {
        console.log('[Server] No active sessions to restore.');
      }
    } catch (err) {
      console.error('[Server] Failed to auto-start WhatsApp sessions:', err);
    }
  }

  // Recover stale jobs
  const staleJobs = getRunningJobs();
  if (staleJobs.length > 0) {
    console.log(`[Server] Recovering ${staleJobs.length} stale jobs...`);
    for (const job of staleJobs) {
      updateJobStatus(job.id, 'failed', {
        error_message: 'Server restarted while job was running',
        completed_at: Math.floor(Date.now() / 1000),
      });
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});
