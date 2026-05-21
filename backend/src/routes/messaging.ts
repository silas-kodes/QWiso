/**
 * Unified Messaging Routes
 * Platform-agnostic API for sending messages via SMS or WhatsApp
 */

import { Router } from 'express';
import { z } from 'zod';
import { sendSingleSms, sendSms } from '../sms/textbee.js';
import { getWhatsAppManager } from '../wvalidator/client.js';
import { pickNextAccount } from '../wvalidator/rotation.js';
import { validateInternationalPhone } from '../qwiso/phone.js';

const router = Router();

// ─── Unified Send Message ─────────────────────────────────────────────────────

const unifiedSendSchema = z.object({
  channel: z.enum(['sms', 'whatsapp']),
  recipient: z.string().min(7, 'Phone number too short'),
  message: z.string().min(1).max(1600, 'Message too long'),
  clientId: z.string().optional(), // For WhatsApp account selection
});

/**
 * POST /api/messaging/send
 * Unified endpoint for sending messages via SMS or WhatsApp
 */
router.post('/send', async (req, res) => {
  const parse = unifiedSendSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  const { channel, recipient, message, clientId } = parse.data;
  const phone = validateInternationalPhone(recipient);
  if (!phone.ok || !phone.normalized) {
    res.status(400).json({ error: phone.error || 'Invalid international phone number.' });
    return;
  }

  try {
    if (channel === 'sms') {
      const result = await sendSingleSms(phone.normalized.e164, message);
      res.status(result.success ? 200 : 502).json(result);
    } else if (channel === 'whatsapp') {
      const manager = getWhatsAppManager();
      
      let instance: any;
      if (clientId) {
        instance = manager.getInstance(clientId);
        if (!instance || !instance.isReady()) {
          res.status(400).json({ error: `Selected WhatsApp account ${clientId} is not ready.` });
          return;
        }
      } else {
        const waAccount = pickNextAccount();
        if (!waAccount) {
          res.status(503).json({ error: 'No healthy WhatsApp accounts available.' });
          return;
        }
        instance = manager.getInstance(waAccount.id);
      }

      if (!instance || !instance.isReady()) {
        res.status(503).json({ error: 'Selected WhatsApp account is not ready.' });
        return;
      }

      const success = await instance.sendMessage(phone.normalized.digits, message);
      res.json({ success, recipient: phone.normalized.e164 });
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// ─── Unified Bulk Send ────────────────────────────────────────────────────────

const unifiedBulkSchema = z.object({
  channel: z.enum(['sms', 'whatsapp']),
  recipients: z.array(z.string().min(7)).min(1).max(500),
  message: z.string().min(1).max(1600, 'Message too long'),
  clientId: z.string().optional(),
});

/**
 * POST /api/messaging/send-bulk
 * Send to multiple recipients via single platform
 */
router.post('/send-bulk', async (req, res) => {
  const parse = unifiedBulkSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  const { channel, recipients, message, clientId } = parse.data;
  const normalizedRecipients: string[] = [];

  // Validate all recipients first
  for (const recipient of recipients) {
    const phone = validateInternationalPhone(recipient);
    if (!phone.ok || !phone.normalized) {
      res.status(400).json({ error: phone.error || `Invalid phone number: ${recipient}`, recipient });
      return;
    }
    normalizedRecipients.push(phone.normalized.e164);
  }

  try {
    if (channel === 'sms') {
      const result = await sendSms(normalizedRecipients, message);
      res.status(result.sent > 0 ? 200 : 502).json(result);
    } else if (channel === 'whatsapp') {
      const manager = getWhatsAppManager();
      
      let instance: any;
      if (clientId) {
        instance = manager.getInstance(clientId);
        if (!instance || !instance.isReady()) {
          res.status(400).json({ error: `Selected WhatsApp account ${clientId} is not ready.` });
          return;
        }
      } else {
        const waAccount = pickNextAccount();
        if (!waAccount) {
          res.status(503).json({ error: 'No healthy WhatsApp accounts available.' });
          return;
        }
        instance = manager.getInstance(waAccount.id);
      }

      const results = [];
      for (const recipient of normalizedRecipients) {
        try {
          const success = await instance.sendMessage(recipient.replace(/\D/g, ''), message);
          results.push({ recipient, success });
        } catch (err) {
          results.push({
            recipient,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
        // Delay between messages to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }

      const sent = results.filter(r => r.success).length;
      res.json({
        total: results.length,
        sent,
        failed: results.length - sent,
        results,
      });
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// ─── Get Channel Status ────────────────────────────────────────────────────────

/**
 * GET /api/messaging/status
 * Check availability of all messaging channels
 */
router.get('/status', (_req, res) => {
  const manager = getWhatsAppManager();
  const waStatuses = manager.getInstances();
  const waReady = waStatuses.some(s => s.state === 'ready');

  res.json({
    channels: {
      whatsapp: {
        available: waReady,
        accounts: waStatuses.length,
        ready: waStatuses.filter(s => s.state === 'ready').length,
      },
      sms: {
        available: !!process.env.TEXTBEE_DEVICE_ID,
        deviceId: process.env.TEXTBEE_DEVICE_ID || null,
      },
    },
  });
});

export default router;
