export interface Dataset {
    id: string;
    name: string;
    country_code: string;
    country_name: string;
    dial_code: string;
    quantity: number;
    options_json: string;
    created_at: number;
    updated_at: number;
}
export interface NumberRecord {
    id: string;
    dataset_id: string;
    digits: string;
    raw_format: string;
    display_format: string;
    wa_status: 'pending' | 'checking' | 'valid' | 'invalid' | 'error';
    wa_checked_at: number | null;
    wa_error: string | null;
    recipient_group: 'unclassified' | 'campaign' | 'staff' | 'excluded';
    contacted: boolean;
    contacted_at: number | null;
    contact_status: string | null;
    created_at: number;
}
export interface Job {
    id: string;
    type: 'generate' | 'validate' | 'export';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    dataset_id: string | null;
    params_json: string | null;
    total_items: number;
    processed_items: number;
    valid_count: number;
    invalid_count: number;
    error_count: number;
    started_at: number | null;
    completed_at: number | null;
    result_json: string | null;
    error_message: string | null;
    created_at: number;
    updated_at: number;
}
export declare function createDataset(name: string, countryCode: string, countryName: string, dialCode: string, quantity: number, options: Record<string, unknown>): string;
export declare function getDataset(id: string): Dataset | undefined;
export declare function getAllDatasets(limit?: number, offset?: number): Dataset[];
export declare function deleteDataset(id: string): boolean;
export declare function createNumber(datasetId: string, digits: string, rawFormat: string, displayFormat: string): string;
export declare function createNumbersBatch(datasetId: string, numbers: {
    digits: string;
    rawFormat: string;
    displayFormat: string;
}[]): number;
export declare function getNumbersByDataset(datasetId: string, status?: string, limit?: number, offset?: number): NumberRecord[];
export declare function getNumbersCountByDataset(datasetId: string): {
    total: number;
    pending: number;
    valid: number;
    invalid: number;
    error: number;
    campaign: number;
    staff: number;
    excluded: number;
};
export declare function isNumberBlacklisted(digits: string): boolean;
export declare function addToBlacklist(digits: string): void;
export declare function updateNumberStatus(id: string, status: NumberRecord['wa_status'], error?: string, recipientGroup?: NumberRecord['recipient_group']): void;
export declare function resetDatasetValidationStatus(datasetId: string): void;
export declare function getNumbersForValidation(datasetId: string, batchSize?: number, excludeIds?: string[]): NumberRecord[];
export declare function getValidNumbersByDataset(datasetId: string): NumberRecord[];
export declare function createJob(type: Job['type'], datasetId: string | null, params: Record<string, unknown>): string;
export declare function getJob(id: string): Job | undefined;
export declare function updateJobStatus(id: string, status: Job['status'], updates?: Partial<Omit<Job, 'id' | 'type' | 'status' | 'created_at'>>): void;
export declare function getJobsByDataset(datasetId: string): Job[];
export declare function getRunningJobs(): Job[];
export declare function saveWASession(id: string, name: string, state: string, phone: string | null): void;
export declare function getAllWASessions(): {
    id: string;
    name: string;
    state: string;
    phone: string | null;
}[];
export declare function deleteWASession(id: string): void;
export interface Campaign {
    id: string;
    name: string;
    dataset_id: string;
    dataset_name?: string;
    platform: string;
    message_template: string;
    status: string;
    scheduled_at: number | null;
    wa_account_ids: string | null;
    rate_per_hour: number;
    total_contacts: number;
    sent_contacts: number;
    failed_contacts: number;
    last_processed_index: number;
    last_error: string | null;
    created_at: number;
    updated_at: number;
}
export declare function createCampaign(campaign: Omit<Campaign, 'created_at' | 'updated_at' | 'status' | 'total_contacts' | 'sent_contacts' | 'failed_contacts' | 'last_processed_index' | 'last_error'>): void;
export declare function getCampaign(id: string): Campaign | undefined;
export declare function getCampaigns(): Campaign[];
export declare function updateCampaignStatus(id: string, status: string): void;
export declare function pauseCampaignAtCheckpoint(id: string, lastProcessedIndex: number, reason: string): void;
export declare function updateCampaignProgress(id: string, sent: number, failed: number): void;
export declare function updateCampaignCheckpoint(id: string, lastProcessedIndex: number): void;
export declare function incrementCampaignFailed(id: string): void;
export declare function setCampaignTotalContacts(id: string, total: number): void;
export declare function getValidCountForDataset(datasetId: string): number;
export declare function getUncontactedNumbers(datasetId: string, limit: number): NumberRecord[];
export declare function markNumberContacted(id: string, status?: string): void;
export declare function updateNumberContactStatus(id: string, status: string): void;
export declare function deleteCampaign(id: string): boolean;
export interface AutomationRule {
    id: string;
    name: string;
    trigger_type: 'exact' | 'contains' | 'regex';
    keyword: string;
    response_text: string;
    typing_delay: number;
    webhook_url: string | null;
    is_active: boolean;
    created_at: number;
    updated_at: number;
}
export declare function createAutomationRule(rule: Omit<AutomationRule, 'id' | 'created_at' | 'updated_at'>): string;
export declare function getAutomationRules(): AutomationRule[];
export declare function getActiveAutomationRules(): AutomationRule[];
export declare function updateAutomationRule(id: string, updates: Partial<Omit<AutomationRule, 'id' | 'created_at' | 'updated_at'>>): void;
export declare function deleteAutomationRule(id: string): void;
//# sourceMappingURL=queries.d.ts.map