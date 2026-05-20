/**
 * Phone number generator service
 * Ported from QWiso/lib/generator.ts
 */
import { COUNTRIES } from './countries.js';
function randDigit() {
    return Math.floor(Math.random() * 10);
}
function randDigits(n) {
    let s = '';
    for (let i = 0; i < n; i++) {
        s += randDigit();
    }
    return s;
}
function randFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function chunkNumber(str, size) {
    const chunks = [];
    let i = 0;
    while (i < str.length) {
        chunks.push(str.slice(i, i + size));
        i += size;
    }
    return chunks.join(' ');
}
function generateSingleNumber(country, _useDial, useSpaces, localOnly) {
    const prefix = randFrom(country.prefixes);
    const totalLocal = country.length;
    const remaining = totalLocal - prefix.length;
    const local = prefix + randDigits(remaining);
    let formatted;
    let raw;
    const dialCode = country.dial;
    const digits = dialCode.replace('+', '') + local;
    if (localOnly) {
        // Truly local format - no dial code
        formatted = useSpaces ? chunkNumber(local, 3) : local;
        raw = local;
    }
    else {
        // Always use country dial code for WhatsApp compatibility
        // WhatsApp requires international format for number validation
        formatted = useSpaces
            ? dialCode + ' ' + chunkNumber(local, 3)
            : dialCode + local;
        raw = dialCode + local;
    }
    return { digits, raw, display: formatted };
}
export function generateNumbers(options, isBlacklisted) {
    const { countryIndex, quantity, useDial, useSpaces, localOnly } = options;
    if (countryIndex < 0 || countryIndex >= COUNTRIES.length) {
        throw new Error(`Invalid country index: ${countryIndex}`);
    }
    const country = COUNTRIES[countryIndex];
    const numbers = [];
    const seen = new Set();
    const maxAttempts = quantity * 10; // Prevent infinite loops
    let attempts = 0;
    while (numbers.length < quantity && attempts < maxAttempts) {
        attempts++;
        const num = generateSingleNumber(country, useDial, useSpaces, localOnly);
        // Ensure uniqueness and not blacklisted
        if (!seen.has(num.digits) && (!isBlacklisted || !isBlacklisted(num.digits))) {
            seen.add(num.digits);
            numbers.push(num);
        }
    }
    return numbers;
}
export function getCountryOptions() {
    return COUNTRIES.map((c, index) => ({
        index,
        name: c.name,
        flag: c.flag,
        dial: c.dial,
        code: c.code,
    }));
}
export { COUNTRIES };
//# sourceMappingURL=generator.js.map