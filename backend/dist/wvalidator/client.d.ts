/**
 * WhatsApp Client Manager
 * Handles multiple whatsapp-web.js client instances
 */
import { EventEmitter } from 'events';
export type WAState = 'disconnected' | 'connecting' | 'qr_ready' | 'authenticated' | 'ready' | 'error';
export interface WAClientStatus {
    id: string;
    name?: string;
    state: WAState;
    phone: string | null;
    qrCode: string | null;
    error: string | null;
}
type StatusCallback = (status: WAClientStatus) => void;
export interface MessageReceiptEvent {
    accountId: string;
    messageId: string;
    to: string;
    ack: number;
    status: 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
}
export declare const campaignReceiptEvents: EventEmitter<[never]>;
declare class WhatsAppInstance {
    id: string;
    name: string;
    private client;
    private status;
    private manager;
    private reconnectTimer;
    private reconnectAttempts;
    private authPath;
    constructor(id: string, name: string, manager: WhatsAppManager, baseAuthPath: string);
    private updateStatus;
    getStatus(): WAClientStatus;
    isReady(): boolean;
    initialize(): Promise<void>;
    private scheduleReconnect;
    destroy(): Promise<void>;
    logout(): Promise<void>;
    checkNumberExists(phone: string): Promise<boolean>;
    sendMessage(phone: string, text: string): Promise<boolean>;
    dispatchMessage(phone: string, text: string): Promise<{
        messageId: string;
        to: string;
    }>;
}
declare class WhatsAppManager {
    private instances;
    private listeners;
    private authPath;
    constructor();
    getInstances(): WAClientStatus[];
    getInstance(id: string): WhatsAppInstance | undefined;
    createInstance(name: string, id?: string): Promise<WhatsAppInstance>;
    removeInstance(id: string): Promise<void>;
    subscribe(callback: StatusCallback): () => void;
    notifyStatusChange(status: WAClientStatus): void;
    initializeAll(savedConfigs: {
        id: string;
        name: string;
    }[]): Promise<void>;
}
export declare function getWhatsAppManager(): WhatsAppManager;
export declare function getWhatsAppClient(id?: string): WhatsAppInstance | undefined;
export {};
//# sourceMappingURL=client.d.ts.map