/**
 * WhatsApp session and validation routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getWhatsAppManager } from '../baileys/client.js';
import { validateInternationalPhone } from '../qwiso/phone.js';
import { getDataset, getNumbersForValidation, updateNumberStatus } from '../db/queries.js';
import { broadcastToClients } from '../websocket.js';

const router = Router();

// Get all WhatsApp sessions
router.get('/sessions', (_req, res) => {
  const manager = getWhatsAppManager();
  res.json(manager.getInstances());
});

// Rotation health statistics for each account
router.get('/rotation-stats', (_req, res) => {
  const instances = getWhatsAppManager().getInstances();
  const stats = instances.map(inst => ({
    id: inst.id,
    name: inst.name || inst.id,
    checksThisHour: 0,
    checksThisSession: 0,
    consecutiveErrors: 0,
    cooldownUntil: 0,
    cooldownCount: 0,
    health: inst.state === 'ready' ? 'healthy' as const : 'degraded' as const,
  }));
  res.json(stats);
});


const imageSchema = z.object({
  data: z.string().min(1, 'Image base64 data is required'),
  mimeType: z.string().min(1, 'Image mimeType is required'),
  filename: z.string().min(1).optional(),
});

// Send single WhatsApp message (rotated or specific client)
const sendWaSchema = z.object({
  recipient: z.string().min(7, 'Phone number too short'),
  message: z.string().max(1600, 'Message too long').optional(),
  clientId: z.string().optional(),
  image: imageSchema.optional(),
}).refine((val) => Boolean(val.message?.trim() || val.image), {
  message: 'Either message text or image attachment is required.',
});

router.post('/send', async (req, res) => {
  const parse = sendWaSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  const { recipient, message, clientId } = parse.data;
  const image = parse.data.image
    ? {
        data: parse.data.image.data!,
        mimeType: parse.data.image.mimeType!,
        filename: parse.data.image.filename,
      }
    : undefined;
  const phone = validateInternationalPhone(recipient);
  if (!phone.ok || !phone.normalized) {
    res.status(400).json({ error: phone.error || 'Invalid international phone number.' });
    return;
  }
  const manager = getWhatsAppManager();

  const instance = manager.getInstance(clientId || 'main');
  if (!instance || !instance.isReady()) {
    res.status(503).json({ error: 'WhatsApp account is not ready or not found.' });
    return;
  }

  try {
    const success = await instance.sendMessage(phone.normalized.digits, message ?? '', image);
    res.json({ success, recipient: phone.normalized.e164 });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// Send bulk WhatsApp messages (rotated)
const bulkWaSchema = z.object({
  recipients: z.array(z.string().min(7)).min(1).max(500),
  message: z.string().max(1600, 'Message too long').optional(),
  image: imageSchema.optional(),
}).refine((val) => Boolean(val.message?.trim() || val.image), {
  message: 'Either message text or image attachment is required.',
});

router.post('/send-bulk', async (req, res) => {
  const parse = bulkWaSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  const { recipients, message } = parse.data;
  const image = parse.data.image
    ? {
        data: parse.data.image.data!,
        mimeType: parse.data.image.mimeType!,
        filename: parse.data.image.filename,
      }
    : undefined;
  const normalizedRecipients = recipients.map(recipient => ({
    raw: recipient,
    phone: validateInternationalPhone(recipient),
  }));
  const manager = getWhatsAppManager();
  const instance = manager.getInstance('main');

  if (!instance || !instance.isReady()) {
    res.status(503).json({ error: 'WhatsApp account is not ready.' });
    return;
  }

  const results = [];
  let sent = 0;
  let failed = 0;

  for (const entry of normalizedRecipients) {
    if (!entry.phone.ok || !entry.phone.normalized) {
      results.push({ success: false, recipient: entry.raw, error: entry.phone.error || 'Invalid international phone number' });
      failed++;
      continue;
    }

    try {
      const success = await instance.sendMessage(entry.phone.normalized.digits, message ?? '', image);
      if (success) {
        results.push({ success: true, recipient: entry.phone.normalized.e164 });
        sent++;
      } else {
        results.push({ success: false, recipient: entry.phone.normalized.e164, error: 'Failed to send' });
        failed++;
      }
    } catch (err) {
      results.push({ success: false, recipient: entry.phone.normalized.e164, error: err instanceof Error ? err.message : 'Unknown error' });
      failed++;
    }
  }

  res.json({
    total: recipients.length,
    sent,
    failed,
    results,
  });
});

// Get WhatsApp status for specific client
router.get('/:clientId/status', (req: Request<{ clientId: string }>, res: Response) => {
  const { clientId } = req.params;
  const instance = getWhatsAppManager().getInstance(clientId);
  if (!instance) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.json(instance.getStatus());
});
router.get('/status/:clientId', (req: Request<{ clientId: string }>, res: Response) => {
  const { clientId } = req.params;
  const instance = getWhatsAppManager().getInstance(clientId);
  if (!instance) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.json(instance.getStatus());
});

// Support frontend SSE connect flow for a specific client
router.get('/:clientId/connect', (req, res) => {
  const { clientId } = req.params;
  const manager = getWhatsAppManager();
  const instance = manager.getInstance(clientId);

  if (!instance) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();

  const sendStatus = () => {
    res.write(`data: ${JSON.stringify(instance.getStatus())}\n\n`);
  };

  const unsubscribe = manager.subscribe((status) => {
    if (status.id === clientId) {
      sendStatus();
    }
  });

  sendStatus();

  req.on('close', () => {
    unsubscribe();
  });
});

// Trigger a connect action for a specific WhatsApp client
router.post('/:clientId/connect', async (req, res) => {
  const { clientId } = req.params;
  const { phone, method = 'qr' } = req.body;
  const manager = getWhatsAppManager();
  let instance = manager.getInstance(clientId);

  if (!instance) {
    instance = await manager.createInstance(`Account ${clientId}`, clientId);
  }

  try {
    await instance.initialize({ phone, method });
    res.json({ success: true, status: instance.getStatus() });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to initiate WhatsApp connection',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// Disconnect a specific WhatsApp client
router.post('/:clientId/disconnect', async (req, res) => {
  const { clientId } = req.params;
  const instance = getWhatsAppManager().getInstance(clientId);

  if (!instance) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  try {
    await instance.logout();
    res.json({ success: true, status: instance.getStatus() });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to disconnect WhatsApp client',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// Start WhatsApp session with QR or pairing code
router.post('/start', async (req, res) => {
  const { clientId = 'main', name, phone, method = 'qr' } = req.body;
  const manager = getWhatsAppManager();
  let instance = manager.getInstance(clientId);
  
  if (!instance) {
    instance = await manager.createInstance(name || `Account ${clientId}`, clientId);
  }

  try {
    await instance.initialize({ phone, method });
    res.json({ success: true, status: instance.getStatus() });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to start WhatsApp',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// Logout / stop session
router.post('/logout', async (req, res) => {
  const { clientId = 'main' } = req.body;
  const instance = getWhatsAppManager().getInstance(clientId);
  
  if (!instance) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  try {
    await instance.logout();
    res.json({ success: true, status: instance.getStatus() });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to logout',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});
// Validate phone numbers in a dataset against WhatsApp
router.post('/validate', async (req: Request, res: Response) => {
  const { datasetId, waClientId, concurrency = 5, totalCount } = req.body;

  if (!datasetId || !waClientId) {
    res.status(400).json({ error: 'datasetId and waClientId are required' });
    return;
  }

  const dataset = getDataset(datasetId);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  const instance = getWhatsAppManager().getInstance(waClientId);
  if (!instance || !instance.isReady()) {
    res.status(503).json({ error: 'WhatsApp account is not ready or not found.' });
    return;
  }

  res.json({ success: true, message: 'Validation started' });

  // Run validation asynchronously
  const excludeIds: string[] = [];
  let total = totalCount || 0;
  let checked = 0;
  let valid = 0;

  const processBatch = async () => {
    const batch = getNumbersForValidation(datasetId, concurrency * 2, excludeIds);
    if (batch.length === 0) return;

    if (total === 0) total = batch.length;

    const promises = batch.map(async (num) => {
      updateNumberStatus(num.id, 'checking');
      try {
        const exists = await instance.checkNumberExists(num.digits);
        if (exists) {
          updateNumberStatus(num.id, 'valid');
          valid++;
        } else {
          updateNumberStatus(num.id, 'invalid', 'Number not registered on WhatsApp');
        }
      } catch (err) {
        updateNumberStatus(num.id, 'error', err instanceof Error ? err.message : 'Check failed');
      }
      checked++;
      excludeIds.push(num.id);

      broadcastToClients({
        type: 'validation_progress',
        jobId: `val_${datasetId}`,
        datasetId,
        current: checked,
        total,
        result: { digits: num.digits, valid: checked },
        counts: { total, pending: total - checked, valid, invalid: checked - valid, error: 0, campaign: valid, staff: 0, excluded: 0 },
      });
    });

    await Promise.all(promises);
    if (checked < total) await processBatch();
    else {
      broadcastToClients({
        type: 'validation_complete',
        jobId: `val_${datasetId}`,
        result: { total, valid, invalid: total - valid },
      });
    }
  };

  processBatch().catch(err => {
    console.error(`[Validate] Error processing dataset ${datasetId}:`, err);
    broadcastToClients({
      type: 'validation_error',
      jobId: `val_${datasetId}`,
      error: err instanceof Error ? err.message : 'Validation failed',
    });
  });
});

export default router;
