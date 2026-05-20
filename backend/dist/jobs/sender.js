import { getCampaign, updateCampaignStatus, getUncontactedNumbers, markNumberContacted, updateNumberContactStatus, updateCampaignProgress, updateCampaignCheckpoint, pauseCampaignAtCheckpoint, incrementCampaignFailed, setCampaignTotalContacts, getValidCountForDataset, } from '../db/queries.js';
import { campaignReceiptEvents, getWhatsAppManager } from '../wvalidator/client.js';
import { sendSingleSms } from '../sms/textbee.js';
import { broadcastToClients } from '../websocket.js';
import { pickNextAccount } from '../wvalidator/rotation.js';
const BATCH_SIZE = 50;
const MIN_MESSAGE_DELAY_MS = 7_000;
const MAX_MESSAGE_DELAY_MS = 15_000;
const MIN_BATCH_COOLDOWN_MS = 5 * 60_000;
const MAX_BATCH_COOLDOWN_MS = 10 * 60_000;
class CampaignPausedError extends Error {
    lastProcessedIndex;
    constructor(message, lastProcessedIndex) {
        super(message);
        this.lastProcessedIndex = lastProcessedIndex;
        this.name = 'CampaignPausedError';
    }
}
const pendingDispatches = new Map();
let receiptListenerRegistered = false;
function randomBetween(minMs, maxMs) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function personalize(template, digits) {
    return template
        .replace(/{{number}}/g, digits)
        .replace(/{phone}/gi, digits)
        .replace(/{name}/gi, digits);
}
function registerReceiptListener() {
    if (receiptListenerRegistered)
        return;
    receiptListenerRegistered = true;
    campaignReceiptEvents.on('receipt', (receipt) => {
        const pending = pendingDispatches.get(receipt.messageId);
        if (!pending)
            return;
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
function hasReadyWhatsAppSession() {
    return getWhatsAppManager().getInstances().some(instance => instance.state === 'ready');
}
async function interruptibleDelay(ms, cancelToken, lastProcessedIndex, requireWhatsAppSession) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < ms) {
        if (cancelToken.cancelled)
            return;
        if (requireWhatsAppSession && !hasReadyWhatsAppSession()) {
            throw new CampaignPausedError('WhatsApp session disconnected during campaign delay.', lastProcessedIndex);
        }
        await sleep(Math.min(1_000, ms - (Date.now() - startedAt)));
    }
}
function emitCampaignProgress(campaignId, sentCount, failedCount, totalContacts, lastNumber, success) {
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
async function dispatchWhatsAppMessage(campaignId, numberId, digits, message) {
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
export async function runCampaignJob(campaignId, cancelToken) {
    registerReceiptListener();
    const campaign = getCampaign(campaignId);
    if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
    }
    const remainingContacts = getValidCountForDataset(campaign.dataset_id);
    const totalContacts = campaign.total_contacts > 0 ? campaign.total_contacts : remainingContacts;
    if (remainingContacts === 0) {
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
            if (batch.length === 0)
                break;
            try {
                for (const num of batch) {
                    if (cancelToken.cancelled)
                        break;
                    const message = personalize(campaign.message_template, num.digits);
                    try {
                        if (campaign.platform === 'sms') {
                            const result = await sendSingleSms(num.digits, message);
                            if (!result.success)
                                throw new Error(result.error || 'SMS gateway failed');
                        }
                        else {
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
                    }
                    catch (err) {
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
                    await interruptibleDelay(delay, cancelToken, lastProcessedIndex, campaign.platform === 'whatsapp');
                }
            }
            catch (err) {
                if (err instanceof CampaignPausedError)
                    throw err;
                console.error(`[Campaign] Batch-level failure in campaign ${campaignId}:`, err);
            }
            if (cancelToken.cancelled)
                break;
            const remainingAfterBatch = getValidCountForDataset(campaign.dataset_id);
            if (remainingAfterBatch > 0) {
                const cooldown = randomBetween(MIN_BATCH_COOLDOWN_MS, MAX_BATCH_COOLDOWN_MS);
                broadcastToClients({
                    type: 'campaign_cooldown',
                    campaignId,
                    cooldownMs: cooldown,
                    lastProcessedIndex,
                });
                await interruptibleDelay(cooldown, cancelToken, lastProcessedIndex, campaign.platform === 'whatsapp');
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
        }
        else {
            updateCampaignStatus(campaignId, 'completed');
            broadcastToClients({ type: 'campaign_status_changed', campaignId, status: 'completed' });
        }
    }
    catch (err) {
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
    }
}
//# sourceMappingURL=sender.js.map