/**
 * SMS Routes — powered by TextBee
 * Endpoints for sending SMS messages via a registered Android device.
 */

import { Router } from 'express';
import { z } from 'zod';
import { sendSms, sendSingleSms, isTextBeeConfigured } from '../sms/textbee.js';
import { validateInternationalPhone } from '../qwiso/phone.js';

const router = Router();

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * GET /api/sms/status
 * Returns whether TextBee is configured and ready.
 */
router.get('/status', (_req, res) => {
  const configured = isTextBeeConfigured();
  res.json({
    configured,
    deviceId: configured ? process.env.TEXTBEE_DEVICE_ID : null,
    message: configured
      ? 'TextBee SMS gateway is ready.'
      : 'TextBee not configured. Add TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID to .env.',
  });
});

// ─── Send Single SMS ─────────────────────────────────────────────────────────

const singleSmsSchema = z.object({
  recipient: z.string().min(7, 'Phone number too short'),
  message: z.string().min(1).max(1600, 'Message too long'),
});

/**
 * POST /api/sms/send
 * Body: { recipient: string, message: string }
 */
router.post('/send', async (req, res) => {
  const parse = singleSmsSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  if (!isTextBeeConfigured()) {
    res.status(503).json({ error: 'SMS gateway not configured on this server.' });
    return;
  }

  const { recipient, message } = parse.data;
  const phone = validateInternationalPhone(recipient);
  if (!phone.ok || !phone.normalized) {
    res.status(400).json({ error: phone.error || 'Invalid international phone number.' });
    return;
  }

  try {
    const result = await sendSingleSms(phone.normalized.e164, message);
    res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// ─── Send Bulk SMS ────────────────────────────────────────────────────────────

const bulkSmsSchema = z.object({
  recipients: z.array(z.string().min(7)).min(1).max(500),
  message: z.string().min(1).max(1600, 'Message too long'),
});

/**
 * POST /api/sms/send-bulk
 * Body: { recipients: string[], message: string }
 */
router.post('/send-bulk', async (req, res) => {
  const parse = bulkSmsSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  if (!isTextBeeConfigured()) {
    res.status(503).json({ error: 'SMS gateway not configured on this server.' });
    return;
  }

  const { recipients, message } = parse.data;
  const normalizedRecipients: string[] = [];
  for (const recipient of recipients) {
    const phone = validateInternationalPhone(recipient);
    if (!phone.ok || !phone.normalized) {
      res.status(400).json({ error: phone.error || `Invalid phone number: ${recipient}`, recipient });
      return;
    }
    normalizedRecipients.push(phone.normalized.e164);
  }

  // TextBee handles batching internally, but we chunk at 100 to be safe
  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < normalizedRecipients.length; i += CHUNK_SIZE) {
    chunks.push(normalizedRecipients.slice(i, i + CHUNK_SIZE));
  }

  try {
    const chunkResults = await Promise.all(
      chunks.map((chunk) => sendSms(chunk, message)),
    );

    // Merge chunk results
    const merged = chunkResults.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        sent: acc.sent + r.sent,
        failed: acc.failed + r.failed,
        results: [...acc.results, ...r.results],
      }),
      { total: 0, sent: 0, failed: 0, results: [] as typeof chunkResults[0]['results'] },
    );

    res.json(merged);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
