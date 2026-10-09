import { type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { avatarSvg, PLACEHOLDER_MAX, PLACEHOLDER_MIN, PLACEHOLDER_TEXT_MAX, placeholderSvg } from '../images.ts';
import { ErrorBody } from '../schemas.ts';

/** A picture depends on nothing but its URL, so it may be kept for a year. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

function svg(c: Context, body: string) {
  return c.body(body, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': IMMUTABLE,
    // Opened on its own, the picture may not run or load anything.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
}

const svgResponse = (description: string) => ({
  description,
  content: { 'image/svg+xml': { schema: z.string() } },
  headers: { 'Cache-Control': { description: IMMUTABLE, schema: { type: 'string' as const } } },
});

/**
 * `/avatars/{seed}.svg` and `/images/{w}x{h}.svg`. Hono cannot read a parameter followed by `.svg`, so each route
 * is matched by a pattern and described to the OpenAPI document by hand.
 */
export function imageRoutes(app: OpenAPIHono): void {
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/avatars/{seed}.svg',
    tags: ['Images'],
    operationId: 'avatar',
    summary: 'An SVG avatar',
    description:
      'A square, deterministic avatar: the seed picks the colour, and `name` the initials (`Ada Lovelace` → `AL`; a Japanese name, family name first, shows the family name: `佐藤 美穂` → `佐藤`). Without a name it draws a symmetric pattern from the seed. White on a mid-tone tile, so it reads on light and dark pages. With `safe=true`, every `avatar` the datasets serve points here.',
    request: {
      params: z.object({
        seed: z.string().openapi({ description: 'Any text, e.g. a username or id.', example: 'ada' }),
      }),
      query: z.object({
        name: z
          .string()
          .optional()
          .openapi({ description: 'The name to take initials from.', example: 'Ada Lovelace' }),
      }),
    },
    responses: { 200: svgResponse('The avatar.') },
  });
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/images/{width}x{height}.svg',
    tags: ['Images'],
    operationId: 'placeholderImage',
    summary: 'A placeholder image',
    description: `A flat SVG rectangle of the size asked for, with its size or \`text\` in the middle. Sides clamp to ${PLACEHOLDER_MIN}–${PLACEHOLDER_MAX} pixels and text to ${PLACEHOLDER_TEXT_MAX} characters; colours are hex without or with \`#\` (\`bg=0f172a\`), and anything else falls back to the defaults.`,
    request: {
      params: z.object({
        width: z.string().openapi({ example: '640' }),
        height: z.string().openapi({ example: '480' }),
      }),
      query: z.object({
        text: z.string().optional().openapi({ description: 'What to write instead of the size.', example: 'Hero' }),
        bg: z.string().optional().openapi({ description: 'Background colour, hex.', example: 'e2e8f0' }),
        fg: z.string().optional().openapi({ description: 'Text colour, hex.', example: '475569' }),
      }),
    },
    responses: {
      200: svgResponse('The image.'),
      400: {
        description: 'The size is not `{width}x{height}`.',
        content: { 'application/json': { schema: ErrorBody } },
      },
    },
  });

  app.get('/avatars/:file{.+\\.svg}', (c) => {
    const seed = c.req.param('file').slice(0, -'.svg'.length);
    return svg(c, avatarSvg(seed, c.req.query('name')));
  });
  app.get('/images/:file{.+\\.svg}', (c) => {
    const match = /^(\d{1,6})x(\d{1,6})\.svg$/.exec(c.req.param('file'));
    if (!match) return c.json({ error: 'Ask for /images/{width}x{height}.svg, e.g. /images/640x480.svg.' }, 400);
    const { text, bg, fg } = c.req.query();
    return svg(c, placeholderSvg(Number(match[1]), Number(match[2]), { text, bg, fg }));
  });
}
