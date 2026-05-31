import { CancelToken } from './queue.js';
import {
  getCampaign,
  updateCampaignStatus,
  getUncontactedNumbers,
  getValidatedCampaignNumbers,
  getCampaignContactStatusCounts,
  markNumberContacted,
  updateNumberContactStatus,
  updateCampaignProgress,
  updateCampaignCheckpoint,
  pauseCampaignAtCheckpoint,
  incrementCampaignFailed,
  setCampaignTotalContacts,
  getValidCountForDataset,
  type NumberRecord,
} from '../db/queries.js';
import { campaignReceiptEvents, getWhatsAppManager, type MessageReceiptEvent } from '../baileys/client.js';
import { sendSingleSms } from '../sms/textbee.js';
import { broadcastToClients } from '../websocket.js';

const BATCH_SIZE = 50;
const MIN_MESSAGE_DELAY_MS = 7_000;
const MAX_MESSAGE_DELAY_MS = 15_000;
const MIN_BATCH_COOLDOWN_MS = 5 * 60_000;
const MAX_BATCH_COOLDOWN_MS = 10 * 60_000;

interface PendingDispatch {
  campaignId: string;
  numberId: string;
  digits: string;
}

class CampaignPausedError extends Error {
  constructor(
    message: string,
    public readonly lastProcessedIndex: number,
  ) {
    super(message);
    this.name = 'CampaignPausedError';
  }
}

const pendingDispatches = new Map<string, PendingDispatch>();
let receiptListenerRegistered = false;

function randomBetween(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assertValidActionHubPayload(numbers: NumberRecord[], expectedCount: number): void {
  const invalidTargets = numbers.filter(
    (n) => n.wa_status !== 'valid' || n.recipient_group !== 'campaign'
  );

  if (invalidTargets.length > 0) {
    const sample = invalidTargets[0];
    throw new Error(
      `Action Hub payload validation failed: ${invalidTargets.length} invalid target(s) found. ` +
      `First invalid record: ${sample.digits} (status=${sample.wa_status}, group=${sample.recipient_group}).`
    );
  }

  if (numbers.length !== expectedCount) {
    throw new Error(
      `Action Hub payload validation failed: expected ${expectedCount} campaign targets but found ${numbers.length}.`
    );
  }
}

function deriveFinalCampaignCounts(datasetId: string): { sent: number; failed: number; totalTargets: number } {
  const counts = getCampaignContactStatusCounts(datasetId);
  return {
    sent: counts.sent,
    failed: counts.failed,
    totalTargets: counts.totalTargets,
  };
}

function personalize(template: string, digits: string): string {
  return template
    .replace(/{{number}}/g, digits)
    .replace(/{phone}/gi, digits)
    .replace(/{name}/gi, digits);
}

function registerReceiptListener(): void {
  if (receiptListenerRegistered) return;
  receiptListenerRegistered = true;

  campaignReceiptEvents.on('receipt', (receipt: MessageReceiptEvent) => {
    const pending = pendingDispatches.get(receipt.messageId);
    if (!pending) return;

    if (receipt.status === 'delivered' || receipt.status === 'read' || receipt.status === 'failed') {
      updateNumberContactStatus(pending.numberId, receipt.status);
      broadcastToClients({
        type: 'campaign_receipt',
        campaignId: pending.campaignId,
        numberId: pending.numberId,
        digits: pending.digits,
        messageId: receipt.messageId,
        status: receipt.status,
      });
    }

    if (receipt.status === 'failed') {
      incrementCampaignFailed(pending.campaignId);
    }

    if (receipt.status === 'read' || receipt.status === 'failed') {
      pendingDispatches.delete(receipt.messageId);
    }
  });
}

function hasReadyWhatsAppSession(): boolean {
  return getWhatsAppManager().getInstances().some((instance: any) => instance.state === 'ready');
}

async function interruptibleDelay(
  ms: number,
  cancelToken: CancelToken,
  lastProcessedIndex: number,
  requireWhatsAppSession: boolean,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < ms) {
    if (cancelToken.cancelled) return;

    if (requireWhatsAppSession && !hasReadyWhatsAppSession()) {
      throw new CampaignPausedError('WhatsApp session disconnected during campaign delay.', lastProcessedIndex);
    }

    await sleep(Math.min(1_000, ms - (Date.now() - startedAt)));
  }
}

function emitCampaignProgress(
  campaignId: string,
  sentCount: number,
  failedCount: number,
  totalContacts: number,
  lastNumber: string,
  success: boolean,
): void {
  broadcastToClients({
    type: 'campaign_progress',
    campaignId,
    sentCount,
    failedCount,
    totalContacts,
    lastNumber,
    success,
  });
}

async function dispatchWhatsAppMessage(
  campaignId: string,
  numberId: string,
  digits: string,
  message: string,
  image?: { data: string; mimeType: string; filename?: string },
): Promise<void> {
  const instance = getWhatsAppManager().getInstance('main');
  if (!instance || !instance.isReady()) {
    throw new CampaignPausedError('WhatsApp session is not ready.', 0);
  }

  const dispatch = instance.dispatchMessage(digits, message, image);

  // Delivery receipts and late network failures are deliberately handled outside
  // the main campaign loop so a slow acknowledgement cannot block the queue.
  dispatch
    .then(({ messageId }) => {
      pendingDispatches.set(messageId, { campaignId, numberId, digits });
    })
    .catch((err: any) => {
      console.error(`[Campaign] Async WhatsApp dispatch failed for ${digits}:`, err);
      updateNumberContactStatus(numberId, 'failed');
      incrementCampaignFailed(campaignId);
      broadcastToClients({
        type: 'campaign_receipt',
        campaignId,
        numberId,
        digits,
        status: 'failed',
        error: err instanceof Error ? err.message : 'WhatsApp dispatch failed',
      });
    });
}

export async function runCampaignJob(campaignId: string, cancelToken: CancelToken): Promise<void> {
  console.log(`[CAMPAIGN JOB] runCampaignJob called for campaign ${campaignId}`);
  registerReceiptListener();
  console.log(`[CAMPAIGN JOB] Receipt listener registered`);

  console.log(`[CAMPAIGN JOB] Fetching campaign ${campaignId} from database`);
  const campaign = getCampaign(campaignId);
  if (!campaign) {
    console.log(`[CAMPAIGN JOB] Campaign ${campaignId} not found in database`);
    throw new Error(`Campaign ${campaignId} not found`);
  }
  console.log(`[CAMPAIGN JOB] Campaign ${campaignId} found: name=${campaign.name}, platform=${campaign.platform}, status=${campaign.status}`);

  console.log(`[CAMPAIGN JOB] Getting contact status counts for dataset ${campaign.dataset_id}`);
  const counts = getCampaignContactStatusCounts(campaign.dataset_id);
  console.log(`[CAMPAIGN JOB] Contact counts - sent: ${counts.sent}, failed: ${counts.failed}, pending: ${counts.pending}, totalTargets: ${counts.totalTargets}`);
  
  console.log(`[CAMPAIGN JOB] Getting validated campaign numbers for dataset ${campaign.dataset_id}, limit: ${counts.pending}`);
  const validatedTargets = getValidatedCampaignNumbers(campaign.dataset_id, counts.pending);
  console.log(`[CAMPAIGN JOB] Retrieved ${validatedTargets.length} validated targets`);
  assertValidActionHubPayload(validatedTargets, counts.pending);
  console.log(`[CAMPAIGN JOB] Action Hub payload validation passed`);

  const totalContacts = counts.totalTargets;
  if (counts.pending === 0) {
    console.log(`[CAMPAIGN JOB] No pending contacts, marking campaign as completed`);
    updateCampaignStatus(campaignId, 'completed');
    setCampaignTotalContacts(campaignId, totalContacts);
    broadcastToClients({ type: 'campaign_status_changed', campaignId, status: 'completed' });
    return;
  }

  console.log(`[CAMPAIGN JOB] Setting campaign total contacts to ${totalContacts}`);
  setCampaignTotalContacts(campaignId, totalContacts);
  console.log(`[CAMPAIGN JOB] Updating campaign status to 'running'`);
  updateCampaignStatus(campaignId, 'running');
  console.log(`[CAMPAIGN JOB] Broadcasting status change to clients`);
  broadcastToClients({ type: 'campaign_status_changed', campaignId, status: 'running' });

  let sentCount = campaign.sent_contacts || 0;
  let failedCount = campaign.failed_contacts || 0;
  let lastProcessedIndex = campaign.last_processed_index || 0;
  console.log(`[CAMPAIGN JOB] Initial counters - sent: ${sentCount}, failed: ${failedCount}, lastProcessedIndex: ${lastProcessedIndex}`);

  try {
    console.log(`[CAMPAIGN JOB] Starting main processing loop`);
    while (!cancelToken.cancelled) {
      console.log(`[CAMPAIGN JOB] Fetching batch of uncontacted numbers, batch size: ${BATCH_SIZE}`);
      const batch = getUncontactedNumbers(campaign.dataset_id, BATCH_SIZE);
      console.log(`[CAMPAIGN JOB] Retrieved batch of ${batch.length} numbers`);
      assertValidActionHubPayload(batch, batch.length);
      if (batch.length === 0) {
        console.log(`[CAMPAIGN JOB] Batch empty, breaking loop`);
        break;
      }

      try {
        console.log(`[CAMPAIGN JOB] Processing batch of ${batch.length} numbers`);
        for (const num of batch) {
          if (cancelToken.cancelled) {
            console.log(`[CAMPAIGN JOB] Campaign cancelled during batch processing`);
            break;
          }

          console.log(`[CAMPAIGN JOB] Processing number ${num.digits} (id: ${num.id})`);
          const message = personalize(campaign.message_template, num.digits);
          console.log(`[CAMPAIGN JOB] Message personalized: ${message.substring(0, 50)}...`);

          try {
            if (campaign.platform === 'sms') {
              console.log(`[CAMPAIGN JOB] Sending SMS to ${num.digits}`);
              const result = await sendSingleSms(num.digits, message);
              if (!result.success) {
                console.log(`[CAMPAIGN JOB] SMS send failed: ${result.error}`);
                throw new Error(result.error || 'SMS gateway failed');
              }
              console.log(`[CAMPAIGN JOB] SMS sent successfully to ${num.digits}`);
            } else {
              console.log(`[CAMPAIGN JOB] Platform is WhatsApp, checking session`);
              if (!hasReadyWhatsAppSession()) {
                console.log(`[CAMPAIGN JOB] WhatsApp session not ready`);
                throw new CampaignPausedError('WhatsApp session disconnected before dispatch.', lastProcessedIndex);
              }
              console.log(`[CAMPAIGN JOB] WhatsApp session ready, dispatching message`);
              const image = campaign.image_data
                ? {
                    data: campaign.image_data,
                    mimeType: campaign.image_mime_type ?? 'image/jpeg',
                    filename: campaign.image_filename ?? 'image',
                  }
                : undefined;
              await dispatchWhatsAppMessage(campaignId, num.id, num.digits, message, image);
              console.log(`[CAMPAIGN JOB] WhatsApp message dispatched to ${num.digits}`);
            }

            sentCount++;
            lastProcessedIndex++;
            console.log(`[CAMPAIGN JOB] Marking number ${num.id} as contacted (sent)`);
            markNumberContacted(num.id, 'sent');
            updateCampaignProgress(campaignId, sentCount, failedCount);
            updateCampaignCheckpoint(campaignId, lastProcessedIndex);
            emitCampaignProgress(campaignId, sentCount, failedCount, totalContacts, num.digits, true);
            console.log(`[CAMPAIGN JOB] Number ${num.digits} processed successfully - sent: ${sentCount}, failed: ${failedCount}`);
          } catch (err) {
            if (err instanceof CampaignPausedError) {
              console.log(`[CAMPAIGN JOB] CampaignPausedError thrown: ${err.message}`);
              throw new CampaignPausedError(err.message, lastProcessedIndex);
            }

            failedCount++;
            lastProcessedIndex++;
            console.log(`[CAMPAIGN JOB] Message-level failure for ${num.digits}, marking as failed`);
            markNumberContacted(num.id, 'failed');
            updateCampaignProgress(campaignId, sentCount, failedCount);
            updateCampaignCheckpoint(campaignId, lastProcessedIndex);
            emitCampaignProgress(campaignId, sentCount, failedCount, totalContacts, num.digits, false);
            console.error(`[Campaign] Message-level failure for ${num.digits}:`, err);
          }

          const delay = randomBetween(MIN_MESSAGE_DELAY_MS, MAX_MESSAGE_DELAY_MS);
          console.log(`[CAMPAIGN JOB] Delaying ${delay}ms before next message`);
          await interruptibleDelay(
            delay,
            cancelToken,
            lastProcessedIndex,
            campaign.platform === 'whatsapp',
          );
        }
        console.log(`[CAMPAIGN JOB] Batch processing completed`);
      } catch (err) {
        if (err instanceof CampaignPausedError) {
          console.log(`[CAMPAIGN JOB] CampaignPausedError in batch: ${err.message}`);
          throw err;
        }
        console.error(`[Campaign] Batch-level failure in campaign ${campaignId}:`, err);
      }

      if (cancelToken.cancelled) {
        console.log(`[CAMPAIGN JOB] Campaign cancelled after batch`);
        break;
      }

      const remainingAfterBatch = getValidCountForDataset(campaign.dataset_id);
      console.log(`[CAMPAIGN JOB] Remaining contacts after batch: ${remainingAfterBatch}`);
      if (remainingAfterBatch > 0) {
        const cooldown = randomBetween(MIN_BATCH_COOLDOWN_MS, MAX_BATCH_COOLDOWN_MS);
        console.log(`[CAMPAIGN JOB] Starting cooldown for ${cooldown}ms`);
        broadcastToClients({
          type: 'campaign_cooldown',
          campaignId,
          cooldownMs: cooldown,
          lastProcessedIndex,
        });

        await interruptibleDelay(
          cooldown,
          cancelToken,
          lastProcessedIndex,
          campaign.platform === 'whatsapp',
        );
        console.log(`[CAMPAIGN JOB] Cooldown completed`);
      }
    }
    console.log(`[CAMPAIGN JOB] Main processing loop completed`);

    console.log(`[CAMPAIGN JOB] Final campaign progress update - sent: ${sentCount}, failed: ${failedCount}`);
    updateCampaignProgress(campaignId, sentCount, failedCount);
    updateCampaignCheckpoint(campaignId, lastProcessedIndex);

    if (cancelToken.cancelled) {
      console.log(`[CAMPAIGN JOB] Campaign was cancelled, pausing at checkpoint`);
      pauseCampaignAtCheckpoint(campaignId, lastProcessedIndex, 'Campaign paused by operator.');
      broadcastToClients({
        type: 'campaign_status_changed',
        campaignId,
        status: 'paused',
        lastProcessedIndex,
      });
    } else {
      console.log(`[CAMPAIGN JOB] Campaign completed normally`);
      updateCampaignStatus(campaignId, 'completed');
      broadcastToClients({ type: 'campaign_status_changed', campaignId, status: 'completed' });
    }

    const finalCounts = deriveFinalCampaignCounts(campaign.dataset_id);
    console.log(`[CAMPAIGN JOB] Final counts from dataset - sent: ${finalCounts.sent}, failed: ${finalCounts.failed}, totalTargets: ${finalCounts.totalTargets}`);
    updateCampaignProgress(campaignId, finalCounts.sent, finalCounts.failed);
    setCampaignTotalContacts(campaignId, finalCounts.totalTargets);
    console.log(`[CAMPAIGN JOB] Campaign job completed successfully`);
  } catch (err) {
    console.log(`[CAMPAIGN JOB] Error in campaign job:`, err);
    if (err instanceof CampaignPausedError) {
      console.log(`[CAMPAIGN JOB] CampaignPausedError caught, pausing campaign`);
      pauseCampaignAtCheckpoint(campaignId, err.lastProcessedIndex, err.message);
      broadcastToClients({
        type: 'campaign_status_changed',
        campaignId,
        status: 'paused',
        error: err.message,
        lastProcessedIndex: err.lastProcessedIndex,
        alert: true,
      });
      const finalCounts = deriveFinalCampaignCounts(campaign.dataset_id);
      updateCampaignProgress(campaignId, finalCounts.sent, finalCounts.failed);
      setCampaignTotalContacts(campaignId, finalCounts.totalTargets);
      return;
    }

    console.error(`[Campaign] Fatal error in campaign ${campaignId}:`, err);
    updateCampaignStatus(campaignId, 'failed');
    broadcastToClients({
      type: 'campaign_status_changed',
      campaignId,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    const finalCounts = deriveFinalCampaignCounts(campaign.dataset_id);
    updateCampaignProgress(campaignId, finalCounts.sent, finalCounts.failed);
    setCampaignTotalContacts(campaignId, finalCounts.totalTargets);
  }
  console.log(`[CAMPAIGN JOB] runCampaignJob function exiting`);
}
