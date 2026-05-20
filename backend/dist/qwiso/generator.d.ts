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
export declare function generateNumbers(options: GenerateOptions, isBlacklisted?: (digits: string) => boolean): GeneratedNumber[];
export declare function getCountryOptions(): {
    index: number;
    name: string;
    flag: string;
    dial: string;
    code: string;
}[];
export { COUNTRIES, type Country };
//# sourceMappingURL=generator.d.ts.map