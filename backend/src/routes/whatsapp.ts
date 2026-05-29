/**
 * WhatsApp session and validation routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getWhatsAppManager } from '../wvalidator/client.js';
import { runValidationJob, type ValidationProgressCallback } from '../wvalidator/validator.js';
import { getAllAccountStats, pickNextAccount } from '../wvalidator/rotation.js';
import { jobQueue, CancelToken } from '../jobs/queue.js';
import { getDataset, getJob, createJob, updateJobStatus, getNumbersCountByDataset } from '../db/queries.js';
import { broadcastToClients } from '../websocket.js';
import { validateInternationalPhone } from '../qwiso/phone.js';

const router = Router();

// Get all WhatsApp sessions
router.get('/sessions', (_req, res) => {
  const manager = getWhatsAppManager();
  res.json(manager.getInstances());
});

// Get rotation stats
router.get('/rotation-stats', (_req, res) => {
  res.json(getAllAccountStats());
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

  let instance;
  if (clientId) {
    instance = manager.getInstance(clientId);
    if (!instance || !instance.isReady()) {
      res.status(400).json({ error: `Selected WhatsApp account ${clientId} is not ready or not found.` });
      return;
    }
  } else {
    const waAccount = pickNextAccount();
    if (!waAccount) {
      res.status(503).json({ error: 'No healthy WhatsApp accounts available to send messages.' });
      return;
    }
    instance = manager.getInstance(waAccount.id);
  }

  if (!instance || !instance.isReady()) {
    res.status(503).json({ error: 'Selected WhatsApp account is not ready.' });
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

  const results = [];
  let sent = 0;
  let failed = 0;

  for (const entry of normalizedRecipients) {
    if (!entry.phone.ok || !entry.phone.normalized) {
      results.push({ success: false, recipient: entry.raw, error: entry.phone.error || 'Invalid international phone number' });
      failed++;
      continue;
    }

    const recipient = entry.phone.normalized.digits;
    const waAccount = pickNextAccount();
    if (!waAccount) {
      results.push({ success: false, recipient, error: 'No healthy WA accounts available' });
      failed++;
      continue;
    }

    const instance = manager.getInstance(waAccount.id);
    if (!instance || !instance.isReady()) {
      results.push({ success: false, recipient, error: 'Selected WA account not ready' });
      failed++;
      continue;
    }

    try {
      const success = await instance.sendMessage(recipient, message ?? '', image);
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
  const instance = getWhatsAppManager().getInstance(clientId);

  if (!instance) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  try {
    await instance.initialize();
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

// Start WhatsApp session
router.post('/start', async (req, res) => {
  const { clientId = 'main', name } = req.body;
  const manager = getWhatsAppManager();
  let instance = manager.getInstance(clientId);
  
  if (!instance) {
    instance = await manager.createInstance(name || `Account ${clientId}`, clientId);
  }

  try {
    await instance.initialize();
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

// Start validation job
const validateSchema = z.object({
  datasetId: z.string().uuid(),
  waClientId: z.string().default('main'),
  concurrency: z.number().int().min(1).max(5).default(1),
  timeoutMs: z.number().int().min(5000).max(120000).default(30000),
  totalCount: z.number().int().positive().optional(),
});

router.post('/validate', async (req, res) => {
  const parse = validateSchema.safeParse(req.body);
  if (!parse.success) {
    console.error('[WhatsApp] Validation request validation failed:', parse.error.errors);
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  const { datasetId, waClientId, concurrency, timeoutMs } = parse.data;

  // Check dataset exists
  const dataset = getDataset(datasetId);
  if (!dataset) {
    console.error(`[WhatsApp] Dataset not found: ${datasetId}`);
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  // Check WhatsApp is ready
  const manager = getWhatsAppManager();
  const instance = manager.getInstance(waClientId);
  if (!instance || !instance.isReady()) {
    console.error(`[WhatsApp] WhatsApp account not ready: ${waClientId}`);
    res.status(400).json({ 
      error: 'WhatsApp not ready',
      message: `Selected account ${waClientId} is not ready or doesn't exist.`,
    });
    return;
  }

  // Create job
  const jobId = createJob('validate', datasetId, {
    waClientId,
    concurrency,
    timeoutMs,
  });

  console.log(`[WhatsApp] Validation job created: ${jobId} for dataset ${datasetId}`);

  // Start validation in background
  res.json({ 
    success: true, 
    jobId,
    datasetId,
    message: 'Validation job started',
  });

  // Run validation using JobQueue
  const progressCallback: ValidationProgressCallback = (current, total, result) => {
    const counts = getNumbersCountByDataset(datasetId);
    broadcastToClients({
      type: 'validation_progress',
      jobId,
      datasetId,
      current,
      total,
      counts,
      result: {
        digits: result.digits,
        valid: result.valid,
        group: result.group,
      },
    });
  };

  jobQueue.enqueue(jobId, async (cancelToken: CancelToken) => {
    try {
      console.log(`[WhatsApp] Validation job ${jobId} started for dataset ${datasetId}`);
      const result = await runValidationJob({
        jobId,
        datasetId,
        waClientId,
        concurrency,
        timeoutMs,
        totalCount: parse.data.totalCount,
        onProgress: progressCallback,
        cancelToken,
      });

      if (result.success) {
        console.log(`[WhatsApp] Validation job ${jobId} succeeded:`, result.stats);
      } else {
        console.warn(`[WhatsApp] Validation job ${jobId} failed:`, result.message);
      }

      broadcastToClients({
        type: 'validation_complete',
        jobId,
        datasetId,
        result,
      });
    } catch (err) {
      if (cancelToken.cancelled) {
        console.log(`[Validation] Job ${jobId} was cancelled.`);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[WhatsApp] Validation job ${jobId} error:`, errorMsg, err);
      broadcastToClients({
        type: 'validation_error',
        jobId,
        datasetId,
        error: errorMsg,
      });
    }
  });
});

// Get job status
router.get('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json({
    ...job,
    params: job.params_json ? JSON.parse(job.params_json) : null,
    result: job.result_json ? JSON.parse(job.result_json) : null,
  });
});

// Cancel running job
router.post('/jobs/:jobId/cancel', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status !== 'running') {
    res.status(400).json({ error: 'Job is not running' });
    return;
  }

  jobQueue.cancel(jobId);
  updateJobStatus(jobId, 'cancelled', {
    completed_at: Math.floor(Date.now() / 1000),
  });

  res.json({ success: true, message: 'Job cancelled' });
});

export default router;
