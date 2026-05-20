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
} from '../db/queries.js';
import { campaignReceiptEvents, getWhatsAppManager, type MessageReceiptEvent } from '../wvalidator/client.js';
import { sendSingleSms } from '../sms/textbee.js';
import { broadcastToClients } from '../websocket.js';
import { pickNextAccount } from '../wvalidator/rotation.js';

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
  return getWhatsAppManager().getInstances().some(instance => instance.state === 'ready');
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
): Promise<void> {
  const waAccount = pickNextAccount();
  if (!waAccount) {
    throw new CampaignPausedError('No ready WhatsApp session is available for campaign dispatch.', 0);
  }

  const instance = getWhatsAppManager().getInstance(waAccount.id);
  if (!instance || !instance.isReady()) {
    throw new CampaignPausedError(`WhatsApp session ${waAccount.id} is not ready.`, 0);
  }

  const dispatch = instance.dispatchMessage(digits, message);

  // Delivery receipts and late network failures are deliberately handled outside
  // the main campaign loop so a slow acknowledgement cannot block the queue.
  dispatch
    .then(({ messageId }) => {
      pendingDispatches.set(messageId, { campaignId, numberId, digits });
    })
    .catch(err => {
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
  registerReceiptListener();

  const campaign = getCampaign(campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const counts = getCampaignContactStatusCounts(campaign.dataset_id);
  const validatedTargets = getValidatedCampaignNumbers(campaign.dataset_id, counts.pending);
  assertValidActionHubPayload(validatedTargets, counts.pending);

  const totalContacts = counts.totalTargets;
  if (counts.pending === 0) {
    updateCampaignStatus(campaignId, 'completed');
    setCampaignTotalContacts(campaignId, totalContacts);
    broadcastToClients({ type: 'campaign_status_changed', campaignId, status: 'completed' });
    return;
  }

  setCampaignTotalContacts(campaignId, totalContacts);
  updateCampaignStatus(campaignId, 'running');
  broadcastToClients({ type: 'campaign_status_changed', campaignId, status: 'running' });

  let sentCount = campaign.sent_contacts || 0;
  let failedCount = campaign.failed_contacts || 0;
  let lastProcessedIndex = campaign.last_processed_index || 0;

  try {
    while (!cancelToken.cancelled) {
      const batch = getUncontactedNumbers(campaign.dataset_id, BATCH_SIZE);
      assertValidActionHubPayload(batch, batch.length);
      if (batch.length === 0) break;

      try {
        for (const num of batch) {
          if (cancelToken.cancelled) break;

          const message = personalize(campaign.message_template, num.digits);

          try {
            if (campaign.platform === 'sms') {
              const result = await sendSingleSms(num.digits, message);
              if (!result.success) throw new Error(result.error || 'SMS gateway failed');
            } else {
              if (!hasReadyWhatsAppSession()) {
                throw new CampaignPausedError('WhatsApp session disconnected before dispatch.', lastProcessedIndex);
              }
              await dispatchWhatsAppMessage(campaignId, num.id, num.digits, message);
            }

            sentCount++;
            lastProcessedIndex++;
            markNumberContacted(num.id, 'sent');
            updateCampaignProgress(campaignId, sentCount, failedCount);
            updateCampaignCheckpoint(campaignId, lastProcessedIndex);
            emitCampaignProgress(campaignId, sentCount, failedCount, totalContacts, num.digits, true);
          } catch (err) {
            if (err instanceof CampaignPausedError) {
              throw new CampaignPausedError(err.message, lastProcessedIndex);
            }

            failedCount++;
            lastProcessedIndex++;
            markNumberContacted(num.id, 'failed');
            updateCampaignProgress(campaignId, sentCount, failedCount);
            updateCampaignCheckpoint(campaignId, lastProcessedIndex);
            emitCampaignProgress(campaignId, sentCount, failedCount, totalContacts, num.digits, false);
            console.error(`[Campaign] Message-level failure for ${num.digits}:`, err);
          }

          const delay = randomBetween(MIN_MESSAGE_DELAY_MS, MAX_MESSAGE_DELAY_MS);
          await interruptibleDelay(
            delay,
            cancelToken,
            lastProcessedIndex,
            campaign.platform === 'whatsapp',
          );
        }
      } catch (err) {
        if (err instanceof CampaignPausedError) throw err;
        console.error(`[Campaign] Batch-level failure in campaign ${campaignId}:`, err);
      }

      if (cancelToken.cancelled) break;

      const remainingAfterBatch = getValidCountForDataset(campaign.dataset_id);
      if (remainingAfterBatch > 0) {
        const cooldown = randomBetween(MIN_BATCH_COOLDOWN_MS, MAX_BATCH_COOLDOWN_MS);
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
      }
    }

    updateCampaignProgress(campaignId, sentCount, failedCount);
    updateCampaignCheckpoint(campaignId, lastProcessedIndex);

    if (cancelToken.cancelled) {
      pauseCampaignAtCheckpoint(campaignId, lastProcessedIndex, 'Campaign paused by operator.');
      broadcastToClients({
        type: 'campaign_status_changed',
        campaignId,
        status: 'paused',
        lastProcessedIndex,
      });
    } else {
      updateCampaignStatus(campaignId, 'completed');
      broadcastToClients({ type: 'campaign_status_changed', campaignId, status: 'completed' });
    }

    const finalCounts = deriveFinalCampaignCounts(campaign.dataset_id);
    updateCampaignProgress(campaignId, finalCounts.sent, finalCounts.failed);
    setCampaignTotalContacts(campaignId, finalCounts.totalTargets);
  } catch (err) {
    if (err instanceof CampaignPausedError) {
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
}
