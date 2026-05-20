/**
 * WhatsApp Client Manager
 * Handles multiple whatsapp-web.js client instances
 */
import WhatsAppWeb from 'whatsapp-web.js';
const { Client, LocalAuth } = WhatsAppWeb;
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { saveWASession, getActiveAutomationRules } from '../db/queries.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const campaignReceiptEvents = new EventEmitter();
function mapAckToStatus(ack) {
    if (ack < 0)
        return 'failed';
    if (ack === 1)
        return 'sent';
    if (ack === 2)
        return 'delivered';
    if (ack >= 3)
        return 'read';
    return 'unknown';
}
class WhatsAppInstance {
    id;
    name;
    client = null;
    status;
    manager;
    reconnectTimer = null;
    reconnectAttempts = 0;
    authPath;
    constructor(id, name, manager, baseAuthPath) {
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
    updateStatus(partial) {
        this.status = { ...this.status, ...partial };
        // Save to DB for persistence
        try {
            saveWASession(this.id, this.name, this.status.state, this.status.phone);
        }
        catch (err) {
            console.error(`[WA:${this.id}] DB Save Error:`, err);
        }
        this.manager.notifyStatusChange(this.status);
    }
    getStatus() {
        return { ...this.status };
    }
    isReady() {
        return this.status.state === 'ready' && this.client !== null;
    }
    async initialize() {
        if (this.client)
            return;
        console.log(`[WA:${this.id}] Initializing...`);
        this.updateStatus({ state: 'connecting', error: null });
        const headless = process.env.WA_HEADLESS !== 'false';
        const devtools = process.env.WA_DEVTOOLS === 'true';
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: this.id, // Use ID to separate session data
                dataPath: this.authPath,
            }),
            puppeteer: {
                headless,
                devtools,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                ],
            },
        });
        this.client.on('qr', async (qr) => {
            console.log(`[WA:${this.id}] QR received`);
            try {
                const dataUrl = await QRCode.toDataURL(qr, {
                    width: 400,
                    margin: 2,
                    color: { dark: '#ff6b35', light: '#0a0a0f' },
                });
                this.updateStatus({ state: 'qr_ready', qrCode: dataUrl });
            }
            catch (err) {
                console.error(`[WA:${this.id}] QR error:`, err);
                this.updateStatus({ state: 'qr_ready', qrCode: null });
            }
        });
        this.client.on('authenticated', () => {
            console.log(`[WA:${this.id}] Authenticated`);
            this.updateStatus({ state: 'authenticated', qrCode: null });
        });
        this.client.on('auth_failure', (msg) => {
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
            if (!msg.body || msg.isStatus || msg.fromMe)
                return;
            try {
                const activeRules = getActiveAutomationRules();
                if (activeRules.length === 0)
                    return;
                const bodyLower = msg.body.toLowerCase();
                for (const rule of activeRules) {
                    const keywordLower = rule.keyword.toLowerCase();
                    let match = false;
                    if (rule.trigger_type === 'exact') {
                        match = bodyLower === keywordLower;
                    }
                    else if (rule.trigger_type === 'contains') {
                        match = bodyLower.includes(keywordLower);
                    }
                    else if (rule.trigger_type === 'regex') {
                        try {
                            match = new RegExp(rule.keyword, 'i').test(msg.body);
                        }
                        catch (e) {
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
                                    pushName: msg.pushName || 'Unknown',
                                    body: msg.body,
                                    timestamp: new Date().toISOString()
                                })
                            }).catch(e => console.error(`[WA:${this.id}] Webhook failed:`, e));
                        }
                        // Variable Parsing
                        let response = rule.response_text;
                        response = response.replace(/{name}/gi, msg.pushName || 'there');
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
            }
            catch (err) {
                console.error(`[WA:${this.id}] Auto-reply error:`, err);
            }
        });
        this.client.on('message_ack', (msg, ack) => {
            campaignReceiptEvents.emit('receipt', {
                accountId: this.id,
                messageId: msg?.id?._serialized ?? msg?.id?.id ?? '',
                to: String(msg?.to ?? '').split('@')[0],
                ack,
                status: mapAckToStatus(ack),
            });
        });
        this.client.on('disconnected', (reason) => {
            console.log(`[WA:${this.id}] Disconnected:`, reason);
            this.updateStatus({ state: 'disconnected', phone: null, error: reason });
            this.scheduleReconnect();
        });
        try {
            await this.client.initialize();
        }
        catch (err) {
            console.error(`[WA:${this.id}] Init failed:`, err);
            this.updateStatus({
                state: 'error',
                error: err instanceof Error ? err.message : 'Initialization failed'
            });
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        // Exponential backoff: 30s, 60s, 120s, max 600s
        const delay = Math.min(30000 * Math.pow(2, this.reconnectAttempts), 600000);
        this.reconnectAttempts++;
        console.log(`[WA:${this.id}] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.destroy().then(() => this.initialize());
        }, delay);
    }
    async destroy() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.client) {
            try {
                await this.client.destroy();
            }
            catch (err) {
                console.error(`[WA:${this.id}] Destroy error:`, err);
            }
            this.client = null;
        }
    }
    async logout() {
        if (this.client) {
            try {
                await this.client.logout();
            }
            catch (err) {
                console.error(`[WA:${this.id}] Logout error:`, err);
            }
        }
        await this.destroy();
        this.updateStatus({ state: 'disconnected', phone: null, qrCode: null, error: null });
    }
    async checkNumberExists(phone) {
        if (!this.isReady() || !this.client)
            throw new Error(`WhatsApp client ${this.id} not ready`);
        const cleaned = phone.replace(/\D/g, '');
        const chatId = `${cleaned}@c.us`;
        return await this.client.isRegisteredUser(chatId);
    }
    async sendMessage(phone, text) {
        if (!this.isReady() || !this.client)
            throw new Error(`WhatsApp client ${this.id} not ready`);
        const cleaned = phone.replace(/\D/g, '');
        const chatId = `${cleaned}@c.us`;
        try {
            await this.client.sendMessage(chatId, text);
            return true;
        }
        catch (err) {
            console.error(`[WA:${this.id}] Error sending message to ${chatId}:`, err);
            return false;
        }
    }
    dispatchMessage(phone, text) {
        if (!this.isReady() || !this.client)
            throw new Error(`WhatsApp client ${this.id} not ready`);
        const cleaned = phone.replace(/\D/g, '');
        const chatId = `${cleaned}@c.us`;
        return this.client.sendMessage(chatId, text).then((msg) => ({
            messageId: msg?.id?._serialized ?? msg?.id?.id ?? `${this.id}:${cleaned}:${Date.now()}`,
            to: cleaned,
        }));
    }
}
class WhatsAppManager {
    instances = new Map();
    listeners = new Set();
    authPath;
    constructor() {
        this.authPath = process.env.WA_AUTH_PATH || join(__dirname, '../../../data/sessions');
    }
    getInstances() {
        return Array.from(this.instances.values()).map(inst => inst.getStatus());
    }
    getInstance(id) {
        return this.instances.get(id);
    }
    async createInstance(name, id = uuidv4()) {
        if (this.instances.has(id))
            return this.instances.get(id);
        const instance = new WhatsAppInstance(id, name, this, this.authPath);
        this.instances.set(id, instance);
        return instance;
    }
    async removeInstance(id) {
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
    subscribe(callback) {
        this.listeners.add(callback);
        // Notify with all current statuses
        this.getInstances().forEach(status => callback(status));
        return () => this.listeners.delete(callback);
    }
    notifyStatusChange(status) {
        this.listeners.forEach(cb => {
            try {
                cb({ ...status });
            }
            catch { /* ignore */ }
        });
    }
    async initializeAll(savedConfigs) {
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
let manager = null;
export function getWhatsAppManager() {
    if (!manager) {
        manager = new WhatsAppManager();
    }
    return manager;
}
// Keep old getter for compatibility if possible, or refactor all usages
export function getWhatsAppClient(id = 'main') {
    return getWhatsAppManager().getInstance(id);
}
//# sourceMappingURL=client.js.map