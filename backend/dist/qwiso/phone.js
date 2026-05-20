import { getCountryByCode, getCountryByDial } from './countries.js';
const E164_RE = /^[1-9]\d{6,14}$/;
export function normalizeDigits(input) {
    const trimmed = String(input ?? '').trim();
    const plusPrefixed = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    if (!digits)
        return '';
    if (!plusPrefixed && trimmed.startsWith('00'))
        return digits.slice(2);
    return digits;
}
export function validateInternationalPhone(input, dataset) {
    const digits = normalizeDigits(input);
    if (!E164_RE.test(digits)) {
        return {
            ok: false,
            error: 'Phone number must be strict international E.164 digits: country code plus 6-14 subscriber digits, no local-only format.',
        };
    }
    const country = dataset
        ? getCountryByCode(dataset.country_code) ?? getCountryByDial(dataset.dial_code)
        : undefined;
    if (country) {
        const dialDigits = country.dial.replace(/\D/g, '');
        const local = digits.slice(dialDigits.length);
        if (!digits.startsWith(dialDigits)) {
            return {
                ok: false,
                error: `Phone number does not match dataset country code ${country.dial}.`,
            };
        }
        if (local.length !== country.length) {
            return {
                ok: false,
                error: `Phone number has invalid national length for ${country.code}: expected ${country.length}, got ${local.length}.`,
            };
        }
        if (country.prefixes.length > 0 && !country.prefixes.some(prefix => local.startsWith(prefix))) {
            return {
                ok: false,
                error: `Phone number prefix is not recognized for ${country.code}.`,
            };
        }
        return { ok: true, normalized: { digits, e164: `+${digits}`, countryCode: country.code } };
    }
    return { ok: true, normalized: { digits, e164: `+${digits}` } };
}
export function parseStaffNumbers(input = '') {
    return new Set(input
        .split(',')
        .map(value => normalizeDigits(value))
        .filter(value => E164_RE.test(value)));
}
//# sourceMappingURL=phone.js.map