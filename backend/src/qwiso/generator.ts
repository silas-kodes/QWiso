/**
 * Phone number generator service
 * Ported from QWiso/lib/generator.ts
 */

import { COUNTRIES, type Country } from './countries.js';

export interface GenerateOptions {
  countryIndex: number;
  quantity: number;
  useDial: boolean;
  useSpaces: boolean;
  localOnly: boolean;
}

export interface GeneratedNumber {
  digits: string;
  raw: string;
  display: string;
}

function randDigit(): number {
  return Math.floor(Math.random() * 10);
}

function randDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += randDigit();
  }
  return s;
}

function randFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chunkNumber(str: string, size: number): string {
  const chunks: string[] = [];
  let i = 0;
  while (i < str.length) {
    chunks.push(str.slice(i, i + size));
    i += size;
  }
  return chunks.join(' ');
}

function generateSingleNumber(
  country: Country,
  _useDial: boolean,
  useSpaces: boolean,
  localOnly: boolean
): GeneratedNumber {
  const prefix = randFrom(country.prefixes);
  const totalLocal = country.length;
  const remaining = totalLocal - prefix.length;
  const local = prefix + randDigits(remaining);

  let formatted: string;
  let raw: string;
  const dialCode = country.dial;
  const digits = dialCode.replace('+', '') + local;

  if (localOnly) {
    // Truly local format - no dial code
    formatted = useSpaces ? chunkNumber(local, 3) : local;
    raw = local;
  } else {
    // Always use country dial code for WhatsApp compatibility
    // WhatsApp requires international format for number validation
    formatted = useSpaces
      ? dialCode + ' ' + chunkNumber(local, 3)
      : dialCode + local;
    raw = dialCode + local;
  }

  return { digits, raw, display: formatted };
}

export function generateNumbers(options: GenerateOptions, isBlacklisted?: (digits: string) => boolean): GeneratedNumber[] {
  const { countryIndex, quantity, useDial, useSpaces, localOnly } = options;
  
  if (countryIndex < 0 || countryIndex >= COUNTRIES.length) {
    throw new Error(`Invalid country index: ${countryIndex}`);
  }
  
  const country = COUNTRIES[countryIndex];
  const numbers: GeneratedNumber[] = [];
  const seen = new Set<string>();
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

export function getCountryOptions(): { index: number; name: string; flag: string; dial: string; code: string }[] {
  return COUNTRIES.map((c, index) => ({
    index,
    name: c.name,
    flag: c.flag,
    dial: c.dial,
    code: c.code,
  }));
}

export { COUNTRIES, type Country };
