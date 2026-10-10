import { type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { flagCodeOf, flagUrlOf, loadHata } from '../data/flags.ts';
import { hexColor, mapFor } from '../data/maps.ts';
import { flagParam } from '../lib/query.ts';
import { ErrorBody } from '../schemas.ts';

const DAY = 'public, max-age=86400';

const SHAPES = ['own', '4:3', '1:1', 'round'] as const;
const FITS = ['auto', 'whole', 'crop', 'cover', 'hoist', 'contain'] as const;

export interface PlaceOptions {
  /**
   * `auto` (the default) draws flags with Hata when it is installed beside this package and redirects to the CDN when it
   * is not; `cdn` always redirects, so a flag is never drawn here.
   */
  flags?: 'auto' | 'cdn' | undefined;
}

/** An SVG picture, standalone: opened on its own it may not run or load anything. */
function svg(c: Context, body: string) {
  return c.body(body, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': DAY,
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
}

const svgResponse = (description: string) => ({
  description,
  content: { 'image/svg+xml': { schema: z.string() } },
  headers: { 'Cache-Control': { description: DAY, schema: { type: 'string' as const } } },
});

/**
 * `/flags/{code}.svg` and `/maps/{code}.svg`. Hono cannot read a parameter followed by `.svg`, so each route is matched by
 * a pattern and described to the OpenAPI document by hand, as `/avatars` is.
 */
export function placeRoutes(app: OpenAPIHono, { flags = 'auto' }: PlaceOptions = {}): void {
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/flags/{code}.svg',
    tags: ['Reference data'],
    operationId: 'flag',
    summary: 'A flag as an SVG',
    description:
      "The flag of a country (`JP`, any case, or its alpha-3 or numeric code is not taken: use the alpha-2) or of a subdivision (`jp-13`, `CA-ON`, `de-by`), from Hata: 464 flags. A record's `flag` field is the same picture's address on the jsDelivr CDN. When `@johnmorrisdotca/hata` is installed beside this package, the flag is drawn here and `shape` (`4:3`, `1:1`, `round`), `fit` (`whole`, `crop`, `cover`, `hoist`, `contain`) and `variant` (a flag in real use besides the default: `de-facto`, `stripes`, `local`) work, so a square or round flag never stretches or misrepresents it. When it is not installed, a plain request is answered with a redirect to the CDN, which the client follows, and the server fetches nothing; a request for a shape, fit or variant is `501`, which says to install it. `404` for a code with no flag.",
    request: {
      params: z.object({ code: z.string().openapi({ example: 'jp-13' }) }),
      query: z.object({
        shape: z.enum(SHAPES).optional().openapi({
          description:
            "The frame: the flag's own proportions (default), `4:3`, `1:1` or `round`. Needs Hata installed.",
        }),
        fit: z.enum(FITS).optional().openapi({
          description:
            'How the flag fills a frame: `whole`, `crop` (at the side chosen for the flag), `cover`, `hoist`, `contain` or `auto`. Needs Hata installed.',
        }),
        variant: z
          .string()
          .optional()
          .openapi({ description: "Which of the place's flags in real use to draw. Needs Hata installed." }),
      }),
    },
    responses: {
      200: svgResponse('The flag, drawn here.'),
      302: {
        description: 'Without Hata installed: the flag on the CDN.',
        headers: { Location: { description: "The flag's SVG on jsDelivr.", schema: { type: 'string' as const } } },
      },
      404: { description: 'No flag for that code.', content: { 'application/json': { schema: ErrorBody } } },
      501: {
        description: 'A shape, fit or variant was asked for and Hata is not installed.',
        content: { 'application/json': { schema: ErrorBody } },
      },
    },
  });
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/maps/{code}.svg',
    tags: ['Reference data'],
    operationId: 'map',
    summary: 'A country or region as an SVG map',
    description:
      "A country's outline (`JP`, `JPN`, `392`: 238 countries, from Natural Earth, by Chizu) or a subdivision lit on its country (`JP-13`, `CA-ON`, `DE-BY`: the regions of 32 countries), drawn as one standalone SVG in the family's colours. `capital=true` puts a dot on a country's capital. A country or region Chizu has no map of is `404`. Drawn by `@johnmorrisdotca/chizu`, a dependency loaded the first time a map is asked for.",
    request: {
      params: z.object({ code: z.string().openapi({ example: 'JP-13' }) }),
      query: z.object({
        color: z
          .string()
          .optional()
          .openapi({ description: 'A fill for the country or the lit region, hex: `2f6b4f`.', example: '2f6b4f' }),
        capital: z.string().optional().openapi({ description: "`true` puts a dot on the capital of a country's map." }),
        dot: z.string().optional().openapi({ description: "The capital's dot, hex. Default `b5452c`." }),
        lang: z
          .enum(['en', 'ja'])
          .optional()
          .openapi({ description: "The language of the map's label for a screen reader." }),
      }),
    },
    responses: {
      200: svgResponse('The map.'),
      400: {
        description: 'A colour that is not hex, or an unknown language.',
        content: { 'application/json': { schema: ErrorBody } },
      },
      404: { description: 'No map for that code.', content: { 'application/json': { schema: ErrorBody } } },
      501: {
        description: 'Chizu cannot be loaded (the API inside a browser tab has no maps).',
        content: { 'application/json': { schema: ErrorBody } },
      },
    },
  });

  app.get('/flags/:file{.+\\.svg}', async (c) => {
    const text = c.req.param('file').slice(0, -'.svg'.length);
    const code = flagCodeOf(text);
    if (!code)
      return c.json(
        { error: `There is no flag for "${text}". Codes are alpha-2 (JP) or ISO 3166-2 (JP-13, CA-ON).` },
        404,
      );
    const { shape, fit, variant } = c.req.query();
    if (shape !== undefined && !(SHAPES as readonly string[]).includes(shape))
      return c.json({ error: `shape is one of ${SHAPES.join(', ')}.` }, 400);
    if (fit !== undefined && !(FITS as readonly string[]).includes(fit))
      return c.json({ error: `fit is one of ${FITS.join(', ')}.` }, 400);
    const asked = (shape !== undefined && shape !== 'own') || fit !== undefined || variant !== undefined;
    const hata = flags === 'cdn' ? null : await loadHata();
    if (hata) {
      const drawn = await hata.flag(code, {
        ...(shape ? { shape } : {}),
        ...(fit ? { fit } : {}),
        ...(variant ? { variant } : {}),
      });
      if (drawn === null) return c.json({ error: `There is no flag "${variant ?? ''}" for ${code}.` }, 404);
      return svg(c, drawn);
    }
    if (asked) {
      return c.json(
        {
          error:
            'A shape, fit or variant is drawn by @johnmorrisdotca/hata, which is not installed here: run `npm install @johnmorrisdotca/hata` beside this package, or take the flag as it is.',
        },
        501,
      );
    }
    return c.redirect(flagUrlOf(code) as string, 302);
  });

  app.get('/maps/:file{.+\\.svg}', async (c) => {
    const text = c.req.param('file').slice(0, -'.svg'.length);
    const { color, capital, dot, lang } = c.req.query();
    const fill = hexColor(color);
    const marker = hexColor(dot);
    if (fill === null || marker === null)
      return c.json({ error: 'color and dot are hex colours, such as 2f6b4f.' }, 400);
    if (lang !== undefined && lang !== 'en' && lang !== 'ja') return c.json({ error: 'lang is en or ja.' }, 400);
    const result = await mapFor(text, {
      color: fill,
      dot: marker,
      lang,
      capital: capital === undefined ? false : flagParam(capital, false),
    });
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return svg(c, result.svg);
  });
}
