import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import * as main from '@johnmorrisdotca/address-plus';
import { ADDRESS_COUNTRIES, type AddressCountry, loadAddressModules } from '../data/addresses.ts';
import { ErrorBody } from '../schemas.ts';

/** The longest address either route reads, in characters: a postal address is a few lines, never a document. */
export const MAX_ADDRESS_LENGTH = 300;

const Query = z.object({
  address: z.string().openapi({
    description: `The address, on one line (at most ${MAX_ADDRESS_LENGTH} characters).`,
    example: '12 Smith St, Parramatta NSW 2150',
  }),
  country: z
    .string()
    .optional()
    .openapi({
      description: `Which country's format to read it in: ${ADDRESS_COUNTRIES.join(', ')}. Without it, the country is worked out from the address.`,
    }),
});

const Validation = z
  .object({
    isValid: z.boolean(),
    confidence: z.number(),
    completeness: z.number(),
    errors: z.array(z.unknown()),
    warnings: z
      .array(z.unknown())
      .openapi({ description: 'What disagrees: a postcode that belongs to another region, an unrecognised code.' }),
    suggestions: z.array(z.unknown()),
    parsedAddress: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('AddressValidation');

const Formatted = z
  .object({
    country: z.string(),
    format: z.string().openapi({
      description:
        'The format written: `usps`, `canada-post`, `australia-post`, `royal-mail`, `la-poste`, `deutsche-post` or `japan-post`.',
    }),
    lines: z.array(z.string()),
    singleLine: z.string(),
    parsedAddress: z.record(z.string(), z.unknown()),
  })
  .openapi('AddressFormat');

const responses = (ok: z.ZodType, what: string) => ({
  200: { description: what, content: { 'application/json': { schema: ok } } },
  400: {
    description: 'No address, one longer than 300 characters, or a country that is not one of the seven.',
    content: { 'application/json': { schema: ErrorBody } },
  },
  422: {
    description: 'An address that cannot be read as an address.',
    content: { 'application/json': { schema: ErrorBody } },
  },
});

const read = (country: AddressCountry | undefined) =>
  loadAddressModules().then((tables) => {
    const countries = [tables.au.australia, tables.fr.france, tables.de.germany, tables.gb.unitedKingdom];
    return { tables, countries, hint: country } as const;
  });

function problem(address: string | undefined, country: string | undefined): { error: string } | null {
  if (!address || address.trim() === '') return { error: 'address is required.' };
  if (address.length > MAX_ADDRESS_LENGTH) return { error: `address is longer than ${MAX_ADDRESS_LENGTH} characters.` };
  if (country !== undefined && !(ADDRESS_COUNTRIES as readonly string[]).includes(country.toUpperCase())) {
    return { error: `country is one of ${ADDRESS_COUNTRIES.join(', ')}.` };
  }
  return null;
}

/**
 * `GET /addresses/validate` and `GET /addresses/format`: address-plus's checker and formatters on an address you give
 * them, for the seven countries `/addresses` makes. Nothing is stored and nothing is looked up on the network.
 */
export function addressRoutes() {
  const validateRoute = createRoute({
    method: 'get',
    path: '/validate',
    tags: ['Reference data'],
    operationId: 'validate_address',
    summary: 'Check an address',
    description:
      'Reads an address in the format of the United States, Canada, Japan, Australia, the United Kingdom, France or Germany and checks it with `@johnmorrisdotca/address-plus`: whether it has what a postal address has, and whether its postcode belongs to the region it names (`Postcode 2000 belongs to NSW, not VIC`). Nothing is looked up on the network, so it says nothing about whether a street exists.',
    request: { query: Query },
    responses: responses(Validation, 'The reading of the address and what disagrees in it.'),
  });
  const formatRoute = createRoute({
    method: 'get',
    path: '/format',
    tags: ['Reference data'],
    operationId: 'format_address',
    summary: 'Write an address the way its country does',
    description:
      "Reads an address and writes it as its country's post does: USPS capitals, Canada Post, Australia Post, Royal Mail, La Poste's capitals without accents, Deutsche Post, Japan Post. `lines` are the lines on an envelope.",
    request: { query: Query },
    responses: responses(Formatted, 'The address as its country writes it.'),
  });

  return new OpenAPIHono()
    .openapi(validateRoute, async (c) => {
      const { address, country } = c.req.valid('query');
      const wrong = problem(address, country);
      if (wrong) return c.json(wrong, 400) as never;
      const { countries, hint } = await read(country?.toUpperCase() as AddressCountry | undefined);
      const parsed = main.parseLocation(address, { countries, ...(hint ? { country: hint } : {}) });
      if (!parsed) return c.json({ error: 'That cannot be read as an address.' }, 422) as never;
      const result = main.validateAddress(address, { countries, ...(hint ? { country: hint } : {}) });
      return c.json({ ...result, parsedAddress: result.parsedAddress ?? parsed }) as never;
    })
    .openapi(formatRoute, async (c) => {
      const { address, country } = c.req.valid('query');
      const wrong = problem(address, country);
      if (wrong) return c.json(wrong, 400) as never;
      const { tables, countries, hint } = await read(country?.toUpperCase() as AddressCountry | undefined);
      const options = { countries, ...(hint ? { country: hint } : {}) };
      const looksJapanese = hint === 'JP' || (!hint && tables.jp.looksJapanese(address));
      const parsed = looksJapanese ? tables.jp.parseJapaneseAddress(address) : main.parseLocation(address, options);
      if (!parsed) return c.json({ error: 'That cannot be read as an address.' }, 422) as never;
      const where = (parsed as { country?: string }).country ?? hint ?? 'US';
      const written =
        where === 'JP'
          ? { lines: tables.jp.formatJapanese(parsed as never).split('\n'), format: 'japan-post' }
          : where === 'AU'
            ? { ...tables.au.formatAustraliaPost(parsed as never) }
            : where === 'GB'
              ? { ...tables.gb.formatRoyalMail(parsed as never) }
              : where === 'FR'
                ? { ...tables.fr.formatLaPoste(parsed as never) }
                : where === 'DE'
                  ? { ...tables.de.formatDeutschePost(parsed as never) }
                  : where === 'CA'
                    ? { ...main.formatCanadaPost(parsed as never) }
                    : { ...main.formatUSPS(parsed as never) };
      const lines = (written as { lines: string[] }).lines;
      return c.json({
        country: where,
        format: (written as { format?: string }).format ?? 'usps',
        lines,
        singleLine: (written as { singleLine?: string }).singleLine ?? lines.join(', '),
        parsedAddress: parsed as Record<string, unknown>,
      }) as never;
    });
}
