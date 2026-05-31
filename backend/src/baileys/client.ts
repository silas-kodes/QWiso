/**
 * WhatsApp Client Manager using Baileys (no Chrome required)
 * Handles multiple Baileys socket instances
 */

import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { saveWASession, getWASession, getActiveAutomationRules } from '../db/queries.js';
import { isoCountryFromDigits } from './phone-region.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types
export type WAState = 
  | 'disconnected' 
  | 'connecting' 
  | 'qr_ready' 
  | 'pairing'
  | 'authenticated' 
  | 'ready' 
  | 'error';

export interface WAClientStatus {
  id: string;
  name?: string;
  state: WAState;
  phone: string | null;
  qrCode: string | null;
  pairingCode: string | null;
  error: string | null;
}

type StatusCallback = (status: WAClientStatus) => void;

export interface MessageReceiptEvent {
  accountId: string;
  messageId: string;
  to: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
}

export const campaignReceiptEvents = new EventEmitter();

class WhatsAppInstance {
  public id: string;
  public name: string;
  private socket: WASocket | null = null;
  private status: WAClientStatus;
  private manager: WhatsAppManager;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private authPath: string;
  private isInitializing = false;
  private pendingPhone: string | null = null;
  private pendingMethod: 'qr' | 'pairing' = 'qr';
  private pairingCodeRequested = false;
  private destroyed = false;

  constructor(id: string, name: string, manager: WhatsAppManager, baseAuthPath: string) {
    this.id = id;
    this.name = name;
    this.manager = manager;
    this.authPath = baseAuthPath;
    this.status = {
      id,
      name,
      state: 'disconnected',
      phone: null,
      qrCode: null,
      pairingCode: null,
      error: null,
    };
  }

  private updateStatus(partial: Partial<WAClientStatus>): void {
    this.status = { ...this.status, ...partial };
    // Save to DB for persistence
    try {
      saveWASession(this.id, this.name, this.status.state, this.status.phone);
    } catch (err) {
      console.error(`[WA:${this.id}] DB Save Error:`, err);
    }
    this.manager.notifyStatusChange(this.status);
  }

  getStatus(): WAClientStatus {
    return { ...this.status };
  }

  isReady(): boolean {
    return this.status.state === 'ready' && this.socket !== null;
  }

  hasSession(): boolean {
    const { existsSync } = require('fs');
    return existsSync(join(this.authPath, 'creds.json'));
  }

  async initialize(opts?: { phone?: string; method?: 'qr' | 'pairing' }): Promise<void> {
    if (this.destroyed || this.isInitializing || this.status.state === 'ready') return;
    
    this.isInitializing = true;
    if (opts?.phone) this.pendingPhone = opts.phone;
    if (opts?.method) this.pendingMethod = opts.method;

    console.log(`[WA:${this.id}] Initializing with method: ${this.pendingMethod}...`);
    this.updateStatus({ state: 'connecting', error: null });

    try {
      await this.connect();
    } catch (err) {
      console.error(`[WA:${this.id}] Init failed:`, err);
      this.updateStatus({ 
        state: 'error', 
        error: err instanceof Error ? err.message : 'Initialization failed' 
      });
      this.scheduleReconnect();
    } finally {
      this.isInitializing = false;
    }
  }

  private async connect(): Promise<void> {
    const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import('fs');
    
    if (!existsSync(this.authPath)) {
      mkdirSync(this.authPath, { recursive: true });
    }

    // Try to restore credentials from database first
    const savedSession = getWASession(this.id);
    const sessionPath = join(this.authPath, 'creds.json');
    let isResuming = existsSync(sessionPath);

    if (!isResuming && savedSession?.creds_json) {
      console.log(`[WA:${this.id}] Restoring credentials from database`);
      try {
        writeFileSync(sessionPath, savedSession.creds_json, 'utf8');
        isResuming = true;
      } catch (err) {
        console.error(`[WA:${this.id}] Failed to restore credentials from DB:`, err);
      }
    }

    const { state: authState, saveCreds } = await useMultiFileAuthState(this.authPath);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });
    
    if (isResuming) {
      console.log(`[WA:${this.id}] Found existing session at ${this.authPath}. Resuming…`);
    } else {
      console.log(`[WA:${this.id}] No session found. Initializing new connection…`);
    }

    this.pairingCodeRequested = false;
    this.updateStatus({ 
      state: 'connecting', 
      qrCode: null, 
      pairingCode: null, 
      error: null 
    });

    // Wrap saveCreds to also save to database
    const originalSaveCreds = saveCreds;
    const wrappedSaveCreds = async () => {
      await originalSaveCreds();
      // Save credentials to database for persistence
      try {
        const credsContent = readFileSync(sessionPath, 'utf8');
        saveWASession(this.id, this.name, this.status.state, this.status.phone, credsContent);
        console.log(`[WA:${this.id}] Credentials saved to database`);
      } catch (err) {
        console.error(`[WA:${this.id}] Failed to save credentials to DB:`, err);
      }
    };

    const socketConfig: Parameters<typeof makeWASocket>[0] = {
      version,
      logger,
      auth: authState,
      printQRInTerminal: false,
      browser: Browsers.macOS('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 15_000,
      markOnlineOnConnect: false,
    };

    // Only pass countryCode for pairing flow
    if (this.pendingMethod === 'pairing' && this.pendingPhone) {
      const countryCode = isoCountryFromDigits(this.pendingPhone.replace(/\D/g, ''));
      (socketConfig as Record<string, unknown>).countryCode = countryCode;
    }

    this.socket = makeWASocket(socketConfig);

    this.socket.ev.on('creds.update', wrappedSaveCreds);
    this.socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      console.log(`[WA:${this.id}] Connection update:`, { connection, hasQR: !!qr });

      // QR method: convert to PNG data URL and broadcast
      if (qr && this.pendingMethod === 'qr') {
        console.log(`[WA:${this.id}] QR generated, converting to data URL`);
        try {
          const dataURL = await QRCode.toDataURL(qr, { 
            width: 400, 
            margin: 2, 
            color: { dark: '#ff6b35', light: '#0a0a0f' } 
          });
          console.log(`[WA:${this.id}] QR data URL created, emitting to frontend`);
          this.updateStatus({ state: 'qr_ready', qrCode: dataURL, error: null });
        } catch (err) {
          console.error(`[WA:${this.id}] QR conversion error:`, err);
          this.updateStatus({ state: 'qr_ready', qrCode: qr, error: null });
        }
        return;
      }

      // Pairing method: request 8-digit code on first QR tick
      if (qr && this.pendingMethod === 'pairing' && !this.socket!.authState.creds.registered && this.pendingPhone && !this.pairingCodeRequested) {
        console.log(`[WA:${this.id}] Requesting pairing code for ${this.pendingPhone}`);
        this.pairingCodeRequested = true;
        try {
          const raw = await this.socket!.requestPairingCode(this.pendingPhone.replace(/\D/g, ''));
          const formatted = (raw ?? '').match(/.{1,4}/g)?.join('-') ?? raw ?? '';
          if (!formatted) throw new Error('Empty pairing code returned.');
          console.log(`[WA:${this.id}] Pairing code generated: ${formatted}`);
          console.log(`[WA:${this.id}] Emitting pairing code to frontend`);
          this.updateStatus({ state: 'pairing', pairingCode: formatted, error: null });
        } catch (e) {
          console.error(`[WA:${this.id}] Pairing code error:`, e);
          this.pairingCodeRequested = false;
          this.updateStatus({ 
            state: 'disconnected', 
            pairingCode: null, 
            error: e instanceof Error ? e.message : 'Failed to get pairing code' 
          });
        }
        return;
      }

      // Connection closed
      if (connection === 'close') {
        if (this.destroyed) return;
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          console.log(`[WA:${this.id}] Logged out`);
          const { rmSync } = await import('fs');
          if (existsSync(this.authPath)) rmSync(this.authPath, { recursive: true, force: true });
          this.updateStatus({ 
            state: 'disconnected', 
            qrCode: null, 
            pairingCode: null, 
            phone: null, 
            error: 'Logged out. Please reconnect.' 
          });
          return;
        }

        // Reconnect with silent mode for qr_ready/pairing states
        const currentStatus = this.status.state;
        const silentReconnect = currentStatus === 'qr_ready' || currentStatus === 'pairing';

        console.log(`[WA:${this.id}] Connection closed (code ${code}) during ${currentStatus} — reconnecting${silentReconnect ? ' silently' : ''}...`);

        if (silentReconnect) {
          this.pairingCodeRequested = false;
          this.updateStatus({ qrCode: null, pairingCode: null });
        } else {
          this.updateStatus({ state: 'connecting', qrCode: null, pairingCode: null });
        }

        setTimeout(() => {
          this.isInitializing = false;
          this.initialize();
        }, 1500);
      }

      // Connected
      if (connection === 'open') {
        const user = this.socket!.user;
        const phone = user?.id?.split(':')[0] ?? null;
        console.log(`[WA:${this.id}] Connected as ${user?.name ?? user?.id}, phone: ${phone}`);
        this.updateStatus({
          state: 'ready',
          qrCode: null,
          pairingCode: null,
          phone,
          error: null,
        });
      }
    });

    // Message handling for automation
    this.socket.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        
        const messageContent = msg.message;
        if (!messageContent?.conversation && !messageContent?.extendedTextMessage?.text) continue;

        const body = messageContent.conversation || messageContent.extendedTextMessage?.text || '';
        const from = msg.key.remoteJid;

        try {
          const activeRules = getActiveAutomationRules();
          if (activeRules.length === 0) return;

          const bodyLower = body.toLowerCase();

          for (const rule of activeRules) {
            const keywordLower = rule.keyword.toLowerCase();
            let match = false;

            if (rule.trigger_type === 'exact') {
              match = bodyLower === keywordLower;
            } else if (rule.trigger_type === 'contains') {
              match = bodyLower.includes(keywordLower);
            } else if (rule.trigger_type === 'regex') {
              try {
                match = new RegExp(rule.keyword, 'i').test(body);
              } catch (e) {
                console.error(`Invalid regex in rule ${rule.name}:`, e);
              }
            }

            if (match) {
              console.log(`[WA:${this.id}] Auto-replying to ${from} for rule: ${rule.name}`);
              
              // Webhook Fire
              if (rule.webhook_url) {
                fetch(rule.webhook_url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ruleName: rule.name,
                    from,
                    pushName: msg.pushName || 'Unknown',
                    body,
                    timestamp: new Date().toISOString()
                  })
                }).catch(e => console.error(`[WA:${this.id}] Webhook failed:`, e));
              }

              // Variable Parsing
              let response = rule.response_text;
              response = response.replace(/{name}/gi, msg.pushName || 'there');
              response = response.replace(/{phone}/gi, from?.split('@')[0] || '');

              // Typing Delay Simulation
              if (rule.typing_delay && rule.typing_delay > 0 && from) {
                await this.socket!.sendPresenceUpdate('composing', from);
                await new Promise(resolve => setTimeout(resolve, rule.typing_delay * 1000));
                await this.socket!.sendPresenceUpdate('paused', from);
              }

              if (from) {
                await this.socket!.sendMessage(from, { text: response });
              }
              break;
            }
          }
        } catch (err) {
          console.error(`[WA:${this.id}] Auto-reply error:`, err);
        }
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000 * Math.pow(2, this.reconnectAttempts), 600000);
    this.reconnectAttempts++;
    console.log(`[WA:${this.id}] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.destroy().then(() => this.initialize());
    }, delay);
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try { 
        await this.socket.logout(); 
      } catch (err) { 
        console.error(`[WA:${this.id}] Destroy error:`, err); 
      }
      this.socket = null;
    }
  }

  async logout(): Promise<void> {
    if (this.socket) {
      try { await this.socket.logout(); } catch (err) { console.error(`[WA:${this.id}] Logout error:`, err); }
    }
    await this.destroy();
    const { rmSync, existsSync } = await import('fs');
    if (existsSync(this.authPath)) rmSync(this.authPath, { recursive: true, force: true });
    this.pendingPhone = null;
    this.pairingCodeRequested = false;
    this.updateStatus({ state: 'disconnected', phone: null, qrCode: null, pairingCode: null, error: null });
  }

  async checkNumberExists(phone: string): Promise<boolean> {
    if (!this.isReady() || !this.socket) throw new Error(`WhatsApp client ${this.id} not ready`);
    const cleaned = phone.replace(/\D/g, '');
    const jid = `${cleaned}@s.whatsapp.net`;
    try {
      const results = await this.socket.onWhatsApp(jid);
      const result = results?.[0];
      return Boolean(result?.exists) ?? false;
    } catch (err) {
      console.error(`[WA:${this.id}] checkNumberExists error:`, err);
      return false;
    }
  }

  async sendMessage(phone: string, text: string, image?: { data: string; mimeType: string; filename?: string }): Promise<boolean> {
    if (!this.isReady() || !this.socket) throw new Error(`WhatsApp client ${this.id} not ready`);
    const cleaned = phone.replace(/\D/g, '');
    const jid = `${cleaned}@s.whatsapp.net`;
    try {
      if (image) {
        const payload = image.data.replace(/^data:[^;]+;base64,/, '');
        // Baileys doesn't have MessageMedia, use direct buffer
        const buffer = Buffer.from(payload, 'base64');
        await this.socket.sendMessage(jid, {
          image: buffer,
          mimetype: image.mimeType,
          caption: text?.trim() || undefined,
        });
      } else {
        await this.socket.sendMessage(jid, { text });
      }
      return true;
    } catch (err) {
      console.error(`[WA:${this.id}] Error sending message to ${jid}:`, err);
      return false;
    }
  }

  dispatchMessage(phone: string, text: string, image?: { data: string; mimeType: string; filename?: string }): Promise<{ messageId: string; to: string }> {
    if (!this.isReady() || !this.socket) throw new Error(`WhatsApp client ${this.id} not ready`);
    const cleaned = phone.replace(/\D/g, '');
    const jid = `${cleaned}@s.whatsapp.net`;

    if (image) {
      const payload = image.data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(payload, 'base64');
      return this.socket.sendMessage(jid, {
        image: buffer,
        mimetype: image.mimeType,
        caption: text?.trim() || undefined,
      }).then((msg: any) => ({
        messageId: msg?.key?.id ?? `${this.id}:${cleaned}:${Date.now()}`,
        to: cleaned,
      }));
    }

    return this.socket.sendMessage(jid, { text }).then((msg: any) => ({
      messageId: msg?.key?.id ?? `${this.id}:${cleaned}:${Date.now()}`,
      to: cleaned,
    }));
  }
}

class WhatsAppManager {
  private instances: Map<string, WhatsAppInstance> = new Map();
  private listeners: Set<StatusCallback> = new Set();
  private authPath: string;

  constructor() {
    this.authPath = process.env.WA_AUTH_PATH || join(__dirname, '../../../data/sessions');
  }

  getInstances(): WAClientStatus[] {
    return Array.from(this.instances.values()).map(inst => inst.getStatus());
  }

  getInstance(id: string): WhatsAppInstance | undefined {
    return this.instances.get(id);
  }

  async createInstance(name: string, id: string = uuidv4()): Promise<WhatsAppInstance> {
    if (this.instances.has(id)) return this.instances.get(id)!;
    const instance = new WhatsAppInstance(id, name, this, join(this.authPath, id));
    this.instances.set(id, instance);
    return instance;
  }

  async removeInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (instance) {
      await instance.destroy();
      this.instances.delete(id);
      // Also delete the session directory
      const { rmSync, existsSync } = await import('fs');
      const sessionPath = join(this.authPath, id);
      if (existsSync(sessionPath)) {
        rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[WhatsAppManager] Removed session directory for ${id}`);
      }
      this.listeners.forEach(cb => {
        cb({
          id,
          state: 'disconnected',
          phone: null,
          qrCode: null,
          pairingCode: null,
          error: 'Removed',
        });
      });
    }
  }

  subscribe(callback: StatusCallback): () => void {
    this.listeners.add(callback);
    this.getInstances().forEach(status => callback(status));
    return () => this.listeners.delete(callback);
  }

  notifyStatusChange(status: WAClientStatus): void {
    this.listeners.forEach(cb => {
      try { cb({ ...status }); } catch { /* ignore */ }
    });
  }

  async initializeAll(savedConfigs: {id: string, name: string}[]): Promise<void> {
    for (const config of savedConfigs) {
      const inst = await this.createInstance(config.name, config.id);
      inst.initialize().catch(err => console.error(`[WA Manager] Failed to init ${config.id}:`, err));
    }
    
    if (savedConfigs.length === 0) {
      const inst = await this.createInstance('Default Account', 'main');
      inst.initialize().catch(console.error);
    }
  }
}

let manager: WhatsAppManager | null = null;

export function getWhatsAppManager(): WhatsAppManager {
  if (!manager) {
    manager = new WhatsAppManager();
  }
  return manager;
}

export function getWhatsAppClient(id: string = 'main') {
  return getWhatsAppManager().getInstance(id);
}
