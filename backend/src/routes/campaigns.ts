import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { createCampaign, getCampaigns, getCampaign, updateCampaignStatus, getCampaignContactStatusCounts, getValidatedCampaignNumbers, setCampaignTotalContacts, deleteCampaign } from '../db/queries.js';
import { jobQueue, CancelToken } from '../jobs/queue.js';
import { runCampaignJob } from '../jobs/sender.js';

const router = Router();

const imagePayloadSchema = z.object({
  data: z.string().min(1),
  mimeType: z.string().min(1),
  filename: z.string().min(1).optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  dataset_id: z.string().uuid(),
  platform: z.enum(['whatsapp', 'sms']),
  message_template: z.string().max(1600).optional(),
  image: imagePayloadSchema.optional(),
  scheduled_at: z.number().nullable().optional(),
  wa_account_ids: z.array(z.string()).optional(),
  rate_per_hour: z.number().min(1).default(50),
}).superRefine((val, ctx) => {
  if (val.platform === 'sms') {
    if (!val.message_template || !val.message_template.trim()) {
      ctx.addIssue({
        path: ['message_template'],
        code: z.ZodIssueCode.custom,
        message: 'SMS campaigns require a text message template.',
      });
    }
    if (val.image) {
      ctx.addIssue({
        path: ['image'],
        code: z.ZodIssueCode.custom,
        message: 'Image attachments are not supported for SMS campaigns.',
      });
    }
  }

  if (val.platform === 'whatsapp') {
    if ((!val.message_template || !val.message_template.trim()) && !val.image) {
      ctx.addIssue({
        path: ['message_template'],
        code: z.ZodIssueCode.custom,
        message: 'WhatsApp campaigns require either a message template or an image attachment.',
      });
    }
  }
});

router.get('/', (_req, res) => {
  res.json(getCampaigns());
});

router.post('/', (req, res) => {
  const parse = createCampaignSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
    return;
  }

  const campaign = {
    id: crypto.randomUUID(),
    name: parse.data.name,
    dataset_id: parse.data.dataset_id,
    platform: parse.data.platform,
    message_template: parse.data.message_template ?? '',
    image_data: parse.data.image?.data ?? null,
    image_mime_type: parse.data.image?.mimeType ?? null,
    image_filename: parse.data.image?.filename ?? null,
    scheduled_at: parse.data.scheduled_at || null,
    wa_account_ids: parse.data.wa_account_ids ? JSON.stringify(parse.data.wa_account_ids) : null,
    rate_per_hour: parse.data.rate_per_hour,
  };

  createCampaign(campaign);
  res.status(201).json(campaign);
});

router.post('/:id/start', (req, res) => {
  const id = req.params.id;
  console.log(`[CAMPAIGN START] POST /campaigns/${id}/start - Request received`);
  const campaign = getCampaign(id);
  
  if (!campaign) {
    console.log(`[CAMPAIGN START] Campaign ${id} not found`);
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  console.log(`[CAMPAIGN START] Campaign ${id} found, current status: ${campaign.status}`);

  if (campaign.status === 'running') {
    console.log(`[CAMPAIGN START] Campaign ${id} already running`);
    res.status(400).json({ error: 'Campaign already running' });
    return;
  }

  // Pre-check: ensure the Action Hub payload contains only validated campaign targets
  console.log(`[CAMPAIGN START] Checking contact status counts for dataset ${campaign.dataset_id}`);
  const counts = getCampaignContactStatusCounts(campaign.dataset_id);
  console.log(`[CAMPAIGN START] Contact counts - sent: ${counts.sent}, failed: ${counts.failed}, pending: ${counts.pending}, totalTargets: ${counts.totalTargets}`);
  if (counts.pending === 0) {
    console.log(`[CAMPAIGN START] No valid uncontacted numbers in dataset ${campaign.dataset_id}`);
    res.status(400).json({ 
      error: 'No valid uncontacted numbers in this dataset. Validate numbers first before starting a campaign.' 
    });
    return;
  }

  console.log(`[CAMPAIGN START] Getting validated campaign numbers for dataset ${campaign.dataset_id}, limit: ${counts.pending}`);
  const payload = getValidatedCampaignNumbers(campaign.dataset_id, counts.pending);
  console.log(`[CAMPAIGN START] Retrieved ${payload.length} validated numbers`);
  if (payload.length !== counts.pending) {
    console.log(`[CAMPAIGN START] Payload validation failed - expected ${counts.pending}, got ${payload.length}`);
    res.status(500).json({
      error: 'Action Hub payload validation failed',
      message: `Expected ${counts.pending} validated targets but found ${payload.length}. Campaign launch halted.`,
    });
    return;
  }

  console.log(`[CAMPAIGN START] Setting campaign total contacts to ${payload.length}`);
  setCampaignTotalContacts(campaign.id, payload.length);

  console.log(`[CAMPAIGN START] Enqueuing job for campaign ${id}`);
  jobQueue.enqueue(id, async (token: CancelToken) => {
    console.log(`[CAMPAIGN START] Job execution started for campaign ${id}`);
    await runCampaignJob(id, token);
    console.log(`[CAMPAIGN START] Job execution completed for campaign ${id}`);
  });
  console.log(`[CAMPAIGN START] Job enqueued for campaign ${id}, returning success response`);
  res.json({ success: true, message: 'Campaign started', validContacts: payload.length });
});

router.post('/:id/pause', (req, res) => {
  const id = req.params.id;
  jobQueue.cancel(id);
  updateCampaignStatus(id, 'paused');
  res.json({ success: true, message: 'Campaign paused' });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const campaign = getCampaign(id);
  
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  // Cancel if running
  if (campaign.status === 'running') {
    jobQueue.cancel(id);
  }

  deleteCampaign(id);
  
  res.json({ success: true, message: 'Campaign deleted' });
});

export default router;
