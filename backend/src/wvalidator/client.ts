/**
 * WhatsApp Client Manager
 * Handles multiple whatsapp-web.js client instances
 */

import WhatsAppWeb from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = WhatsAppWeb;
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { saveWASession, getActiveAutomationRules } from '../db/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types
export type WAState = 
  | 'disconnected' 
  | 'connecting' 
  | 'qr_ready' 
  | 'authenticated' 
  | 'ready' 
  | 'error';

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

export const campaignReceiptEvents = new EventEmitter();

function mapAckToStatus(ack: number): MessageReceiptEvent['status'] {
  if (ack < 0) return 'failed';
  if (ack === 1) return 'sent';
  if (ack === 2) return 'delivered';
  if (ack >= 3) return 'read';
  return 'unknown';
}

class WhatsAppInstance {
  public id: string;
  public name: string;
  private client: InstanceType<typeof Client> | null = null;
  private status: WAClientStatus;
  private manager: WhatsAppManager;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private authPath: string;

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
    return this.status.state === 'ready' && this.client !== null;
  }

  async initialize(): Promise<void> {
    if (this.client) return;

    console.log(`[WA:${this.id}] Initializing...`);
    this.updateStatus({ state: 'connecting', error: null });

    const headless = process.env.WA_HEADLESS !== 'false';
    const devtools = process.env.WA_DEVTOOLS === 'true';

    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    console.log(`[WA:${this.id}] Using Chrome executable: ${executablePath || 'default'}`);

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.id, // Use ID to separate session data
        dataPath: this.authPath,
      }),
      puppeteer: {
        headless,
        devtools,
        executablePath: executablePath || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          // Required for Railway/container environments where Chromium's
          // multi-process model is blocked by the container's seccomp profile.
          // Without this, Chromium spawns a zygote process that immediately
          // crashes in constrained environments, preventing QR generation.
          '--single-process',
          '--disable-extensions',
        ],
      },
    });

    this.client.on('qr', async (qr: string) => {
      console.log(`[WA:${this.id}] QR received`);
      try {
        const dataUrl = await QRCode.toDataURL(qr, {
          width: 400,
          margin: 2,
          color: { dark: '#ff6b35', light: '#0a0a0f' },
        });
        this.updateStatus({ state: 'qr_ready', qrCode: dataUrl });
      } catch (err) {
        console.error(`[WA:${this.id}] QR error:`, err);
        this.updateStatus({ state: 'qr_ready', qrCode: null });
      }
    });

    this.client.on('authenticated', () => {
      console.log(`[WA:${this.id}] Authenticated`);
      this.updateStatus({ state: 'authenticated', qrCode: null });
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error(`[WA:${this.id}] Auth failure:`, msg);
      this.updateStatus({ state: 'error', error: msg });
    });

    this.client.on('ready', () => {
      this.reconnectAttempts = 0;
      const info = this.client?.info;
      const phone = info?.wid?.user || null;
      console.log(`[WA:${this.id}] Ready! Phone: ${phone}`);
      this.updateStatus({ state: 'ready', phone, qrCode: null, error: null });
    });

    this.client.on('message', async (msg) => {
      // Only process standard text messages
      if (!msg.body || msg.isStatus || msg.fromMe) return;

      try {
        const activeRules = getActiveAutomationRules();
        if (activeRules.length === 0) return;

        const bodyLower = msg.body.toLowerCase();

        for (const rule of activeRules) {
          const keywordLower = rule.keyword.toLowerCase();
          let match = false;

          if (rule.trigger_type === 'exact') {
            match = bodyLower === keywordLower;
          } else if (rule.trigger_type === 'contains') {
            match = bodyLower.includes(keywordLower);
          } else if (rule.trigger_type === 'regex') {
            try {
              match = new RegExp(rule.keyword, 'i').test(msg.body);
            } catch (e) {
              console.error(`Invalid regex in rule ${rule.name}:`, e);
            }
          }

          if (match) {
            console.log(`[WA:${this.id}] Auto-replying to ${msg.from} for rule: ${rule.name}`);
            
            // Webhook Fire
            if (rule.webhook_url) {
              fetch(rule.webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ruleName: rule.name,
                  from: msg.from,
                  pushName: (msg as any).pushName || 'Unknown',
                  body: msg.body,
                  timestamp: new Date().toISOString()
                })
              }).catch(e => console.error(`[WA:${this.id}] Webhook failed:`, e));
            }

            // Variable Parsing
            let response = rule.response_text;
            response = response.replace(/{name}/gi, (msg as any).pushName || 'there');
            response = response.replace(/{phone}/gi, msg.from.split('@')[0]);

            // Typing Delay Simulation
            if (rule.typing_delay && rule.typing_delay > 0) {
              const chat = await msg.getChat();
              await chat.sendStateTyping();
              await new Promise(resolve => setTimeout(resolve, rule.typing_delay * 1000));
              await chat.clearState();
            }

            await msg.reply(response);
            break; // Stop processing after the first matching rule
          }
        }
      } catch (err) {
        console.error(`[WA:${this.id}] Auto-reply error:`, err);
      }
    });

    this.client.on('message_ack', (msg: any, ack: number) => {
      campaignReceiptEvents.emit('receipt', {
        accountId: this.id,
        messageId: msg?.id?._serialized ?? msg?.id?.id ?? '',
        to: String(msg?.to ?? '').split('@')[0],
        ack,
        status: mapAckToStatus(ack),
      } satisfies MessageReceiptEvent);
    });

    this.client.on('disconnected', (reason: string) => {
      console.log(`[WA:${this.id}] Disconnected:`, reason);
      this.updateStatus({ state: 'disconnected', phone: null, error: reason });
      this.scheduleReconnect();
    });

    try {
      await this.client.initialize();
    } catch (err) {
      console.error(`[WA:${this.id}] Init failed:`, err);
      this.updateStatus({ 
        state: 'error', 
        error: err instanceof Error ? err.message : 'Initialization failed' 
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // Exponential backoff: 30s, 60s, 120s, max 600s
    const delay = Math.min(30000 * Math.pow(2, this.reconnectAttempts), 600000);
    this.reconnectAttempts++;
    console.log(`[WA:${this.id}] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.destroy().then(() => this.initialize());
    }, delay);
  }

  async destroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try { await this.client.destroy(); } catch (err) { console.error(`[WA:${this.id}] Destroy error:`, err); }
      this.client = null;
    }
  }

  async logout(): Promise<void> {
    if (this.client) {
      try { await this.client.logout(); } catch (err) { console.error(`[WA:${this.id}] Logout error:`, err); }
    }
    await this.destroy();
    this.updateStatus({ state: 'disconnected', phone: null, qrCode: null, error: null });
  }

  async checkNumberExists(phone: string): Promise<boolean> {
    if (!this.isReady() || !this.client) throw new Error(`WhatsApp client ${this.id} not ready`);
    const cleaned = phone.replace(/\D/g, '');
    const chatId = `${cleaned}@c.us`;
    return await this.client.isRegisteredUser(chatId);
  }

  async sendMessage(phone: string, text: string, image?: { data: string; mimeType: string; filename?: string }): Promise<boolean> {
    if (!this.isReady() || !this.client) throw new Error(`WhatsApp client ${this.id} not ready`);
    const cleaned = phone.replace(/\D/g, '');
    const chatId = `${cleaned}@c.us`;
    try {
      if (image) {
        const payload = image.data.replace(/^data:[^;]+;base64,/, '');
        const media = new MessageMedia(image.mimeType, payload, image.filename ?? 'image');
        await this.client.sendMessage(chatId, media, {
          caption: text?.trim() ? text.trim() : undefined,
        });
      } else {
        await this.client.sendMessage(chatId, text);
      }
      return true;
    } catch (err) {
      console.error(`[WA:${this.id}] Error sending message to ${chatId}:`, err);
      return false;
    }
  }

  dispatchMessage(phone: string, text: string, image?: { data: string; mimeType: string; filename?: string }): Promise<{ messageId: string; to: string }> {
    if (!this.isReady() || !this.client) throw new Error(`WhatsApp client ${this.id} not ready`);
    const cleaned = phone.replace(/\D/g, '');
    const chatId = `${cleaned}@c.us`;

    if (image) {
      const payload = image.data.replace(/^data:[^;]+;base64,/, '');
      const media = new MessageMedia(image.mimeType, payload, image.filename ?? 'image');
      return this.client.sendMessage(chatId, media, {
        caption: text?.trim() ? text.trim() : undefined,
      }).then((msg: any) => ({
        messageId: msg?.id?._serialized ?? msg?.id?.id ?? `${this.id}:${cleaned}:${Date.now()}`,
        to: cleaned,
      }));
    }

    return this.client.sendMessage(chatId, text).then((msg: any) => ({
      messageId: msg?.id?._serialized ?? msg?.id?.id ?? `${this.id}:${cleaned}:${Date.now()}`,
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
    const instance = new WhatsAppInstance(id, name, this, this.authPath);
    this.instances.set(id, instance);
    return instance;
  }

  async removeInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (instance) {
      await instance.destroy();
      this.instances.delete(id);
      // Notify removal by sending a disconnected status or similar
      this.listeners.forEach(cb => {
        cb({
          id,
          state: 'disconnected',
          phone: null,
          qrCode: null,
          error: 'Removed',
        });
      });
    }
  }

  subscribe(callback: StatusCallback): () => void {
    this.listeners.add(callback);
    // Notify with all current statuses
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
    
    // If no instances, create a default 'main' one
    if (savedConfigs.length === 0) {
      const inst = await this.createInstance('Default Account', 'main');
      inst.initialize().catch(console.error);
    }
  }
}

// Singleton manager
let manager: WhatsAppManager | null = null;

export function getWhatsAppManager(): WhatsAppManager {
  if (!manager) {
    manager = new WhatsAppManager();
  }
  return manager;
}

// Keep old getter for compatibility if possible, or refactor all usages
export function getWhatsAppClient(id: string = 'main') {
  return getWhatsAppManager().getInstance(id);
}
