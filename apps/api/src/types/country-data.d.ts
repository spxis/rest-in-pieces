declare module 'country-data' {
  export interface Country {
    alpha2: string;
    alpha3: string;
    name: string;
    status: string;
    ioc: string;
    emoji: string;
    currencies: string[];
    languages: string[];
    countryCallingCodes: string[];
  }
  export const countries: { all: Country[] } & Record<string, Country>;
}
