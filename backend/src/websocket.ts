import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { getWhatsAppManager } from './wvalidator/client.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

// Initialize WebSocket server
export function initializeWebSocket(server: Server): void {
  wss = new WebSocketServer({ 
    server, 
    path: '/ws',
    // Allow connections from any origin (needed for Railway cross-origin setup)
    verifyClient: () => true,
  });

  wss.on('connection', async (ws) => {
    console.log('[WS] Client connected');
    clients.add(ws);

    const manager = getWhatsAppManager();

    // Auto-resume active WhatsApp accounts if they aren't in memory
    try {
      const { getAllWASessions } = await import('./db/queries.js');
      const savedSessions = getAllWASessions();
      const activeSessions = savedSessions.filter(s => s.state !== 'disconnected');
      
      for (const session of activeSessions) {
        if (!manager.getInstance(session.id)) {
          console.log(`[WS] Auto-resuming active session ${session.id} (${session.name})`);
          const inst = await manager.createInstance(session.name, session.id);
          inst.initialize().catch(err => console.error(`[WS] Auto-resume failed for ${session.id}:`, err));
        }
      }
    } catch (err) {
      console.error('[WS] Failed to auto-resume sessions on connection:', err);
    }

    // Send current status for all WhatsApp instances immediately
    const instances = manager.getInstances();
    instances.forEach(status => {
      ws.send(JSON.stringify({
        type: 'wa_status',
        status,
      }));
    });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[WS] Received message: ${msg.type}`, msg);
        
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        const clientId = msg.clientId || 'main';
        const instance = manager.getInstance(clientId);

        if (msg.type === 'wa_initialize') {
          console.log(`[WS] Initialize WhatsApp requested for ${clientId} (name: ${msg.name})`);
          let inst = instance;
          if (!inst) {
            console.log(`[WS] Creating new instance for ${clientId}`);
            inst = await manager.createInstance(msg.name || `Account ${clientId}`, clientId);
          }
          try {
            await inst.initialize();
          } catch (err) {
            console.error(`[WS] Failed to initialize ${clientId}:`, err);
          }
          return;
        }

        if (msg.type === 'wa_logout') {
          console.log(`[WS] Logout WhatsApp requested for ${clientId}`);
          if (instance) {
            try {
              await instance.logout();
            } catch (err) {
              console.error(`[WS] Failed to logout ${clientId}:`, err);
            }
          }
          return;
        }

        if (msg.type === 'wa_remove') {
          console.log(`[WS] Remove WhatsApp requested for ${clientId}`);
          await manager.removeInstance(clientId);
          // Also delete from DB
          const { deleteWASession } = await import('./db/queries.js');
          deleteWASession(clientId);
          return;
        }
      } catch (err) {
        console.error('[WS] Message error:', err);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err);
      clients.delete(ws);
    });
  });

  // Subscribe to all WhatsApp status changes
  getWhatsAppManager().subscribe((status) => {
    broadcastToClients({
      type: 'wa_status',
      status,
    });
  });

  console.log('[WS] WebSocket server initialized on /ws');
}

// Broadcast message to all connected clients
export function broadcastToClients(data: unknown): void {
  const message = JSON.stringify(data);
  
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (err) {
        console.error('[WS] Send error:', err);
        clients.delete(ws);
      }
    }
  });
}

// Send message to specific client
export function sendToClient(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
