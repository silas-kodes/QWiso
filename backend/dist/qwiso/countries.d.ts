/**
 * Country data for phone number generation
 * Ported from QWiso/lib/generator.ts
 */
export interface Country {
    name: string;
    flag: string;
    dial: string;
    code: string;
    prefixes: string[];
    length: number;
    mobile?: boolean;
}
export declare const COUNTRIES: Country[];
export declare function getCountryByCode(code: string): Country | undefined;
export declare function getCountryByDial(dial: string): Country | undefined;
//# sourceMappingURL=countries.d.ts.map