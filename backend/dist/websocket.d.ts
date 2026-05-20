import { WebSocket } from 'ws';
import type { Server } from 'http';
export declare function initializeWebSocket(server: Server): void;
export declare function broadcastToClients(data: unknown): void;
export declare function sendToClient(ws: WebSocket, data: unknown): void;
//# sourceMappingURL=websocket.d.ts.map