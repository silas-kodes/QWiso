/**
 * TextBee SMS Service
 * Wraps the textbee.dev REST API to send SMS via a registered Android device.
 * Docs: https://textbee.dev
 *
 * Required env vars:
 *   TEXTBEE_API_KEY  — your API key from textbee.dev/dashboard
 *   TEXTBEE_DEVICE_ID — your registered device ID from textbee.dev/dashboard
 */
export interface SmsSendResult {
    success: boolean;
    recipient: string;
    error?: string;
}
export interface SmsBulkResult {
    total: number;
    sent: number;
    failed: number;
    results: SmsSendResult[];
}
/**
 * Send an SMS to one or more recipients.
 * TextBee accepts up to ~100 recipients per request.
 */
export declare function sendSms(recipients: string[], message: string): Promise<SmsBulkResult>;
/**
 * Send a single SMS — convenience wrapper.
 */
export declare function sendSingleSms(recipient: string, message: string): Promise<SmsSendResult>;
/**
 * Check whether TextBee is configured (env vars present).
 */
export declare function isTextBeeConfigured(): boolean;
//# sourceMappingURL=textbee.d.ts.map