import type { Dataset } from '../db/queries.js';
export interface NormalizedPhone {
    digits: string;
    e164: string;
    countryCode?: string;
}
export interface PhoneValidationResult {
    ok: boolean;
    normalized?: NormalizedPhone;
    error?: string;
}
export declare function normalizeDigits(input: string): string;
export declare function validateInternationalPhone(input: string, dataset?: Dataset): PhoneValidationResult;
export declare function parseStaffNumbers(input?: string): Set<string>;
//# sourceMappingURL=phone.d.ts.map