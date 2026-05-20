import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { createCampaign, getCampaigns, getCampaign, updateCampaignStatus, getCampaignContactStatusCounts, getValidatedCampaignNumbers, setCampaignTotalContacts, deleteCampaign } from '../db/queries.js';
import { jobQueue, CancelToken } from '../jobs/queue.js';
import { runCampaignJob } from '../jobs/sender.js';

const router = Router();

const createCampaignSchema = z.object({
  name: z.string().min(1),
  dataset_id: z.string().uuid(),
  platform: z.enum(['whatsapp', 'sms']),
  message_template: z.string().min(1),
  scheduled_at: z.number().nullable().optional(),
  wa_account_ids: z.array(z.string()).optional(),
  rate_per_hour: z.number().min(1).default(50),
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
    message_template: parse.data.message_template,
    scheduled_at: parse.data.scheduled_at || null,
    wa_account_ids: parse.data.wa_account_ids ? JSON.stringify(parse.data.wa_account_ids) : null,
    rate_per_hour: parse.data.rate_per_hour,
  };

  createCampaign(campaign);
  res.status(201).json(campaign);
});

router.post('/:id/start', (req, res) => {
  const id = req.params.id;
  const campaign = getCampaign(id);
  
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  if (campaign.status === 'running') {
    res.status(400).json({ error: 'Campaign already running' });
    return;
  }

  // Pre-check: ensure the Action Hub payload contains only validated campaign targets
  const counts = getCampaignContactStatusCounts(campaign.dataset_id);
  if (counts.pending === 0) {
    res.status(400).json({ 
      error: 'No valid uncontacted numbers in this dataset. Validate numbers first before starting a campaign.' 
    });
    return;
  }

  const payload = getValidatedCampaignNumbers(campaign.dataset_id, counts.pending);
  if (payload.length !== counts.pending) {
    res.status(500).json({
      error: 'Action Hub payload validation failed',
      message: `Expected ${validCount} validated targets but found ${payload.length}. Campaign launch halted.`,
    });
    return;
  }

  setCampaignTotalContacts(campaign.id, payload.length);

  jobQueue.enqueue(id, async (token: CancelToken) => {
    await runCampaignJob(id, token);
  });

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
