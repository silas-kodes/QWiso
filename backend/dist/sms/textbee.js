/**
 * TextBee SMS Service
 * Wraps the textbee.dev REST API to send SMS via a registered Android device.
 * Docs: https://textbee.dev
 *
 * Required env vars:
 *   TEXTBEE_API_KEY  — your API key from textbee.dev/dashboard
 *   TEXTBEE_DEVICE_ID — your registered device ID from textbee.dev/dashboard
 */
const TEXTBEE_BASE_URL = 'https://api.textbee.dev/api/v1';
function getConfig() {
    const apiKey = process.env.TEXTBEE_API_KEY;
    const deviceId = process.env.TEXTBEE_DEVICE_ID;
    if (!apiKey || !deviceId) {
        throw new Error('TextBee not configured. Set TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID in your .env file.');
    }
    return { apiKey, deviceId };
}
/**
 * Send an SMS to one or more recipients.
 * TextBee accepts up to ~100 recipients per request.
 */
export async function sendSms(recipients, message) {
    const { apiKey, deviceId } = getConfig();
    const url = `${TEXTBEE_BASE_URL}/gateway/devices/${deviceId}/send-sms`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify({ recipients, message }),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        console.error('[TextBee] Request failed:', msg);
        return {
            total: recipients.length,
            sent: 0,
            failed: recipients.length,
            results: recipients.map((r) => ({ success: false, recipient: r, error: msg })),
        };
    }
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = `TextBee API error ${response.status}: ${body}`;
        console.error('[TextBee]', error);
        return {
            total: recipients.length,
            sent: 0,
            failed: recipients.length,
            results: recipients.map((r) => ({ success: false, recipient: r, error })),
        };
    }
    // TextBee returns { data: { ... } } on success
    console.log(`[TextBee] Sent SMS to ${recipients.length} recipient(s)`);
    return {
        total: recipients.length,
        sent: recipients.length,
        failed: 0,
        results: recipients.map((r) => ({ success: true, recipient: r })),
    };
}
/**
 * Send a single SMS — convenience wrapper.
 */
export async function sendSingleSms(recipient, message) {
    const result = await sendSms([recipient], message);
    return result.results[0];
}
/**
 * Check whether TextBee is configured (env vars present).
 */
export function isTextBeeConfigured() {
    return !!(process.env.TEXTBEE_API_KEY && process.env.TEXTBEE_DEVICE_ID);
}
//# sourceMappingURL=textbee.js.map