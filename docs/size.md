# Size

What REST in Pieces weighs depends on how you use it. This page has the numbers and says what each one counts. They are measured by `pnpm size` (the badge in the README) and `pnpm --dir apps/api size:split`, recorded in `apps/api/docs/bundle-size.json` and `apps/api/docs/bundle-size-split.json`, and checked by tests.

## The badge: one file per entry

The README badge bundles each entry point into one file, minified for ES2020 and gzipped at level 9, with Node built-ins external. That counts the Kuni subdivisions, the address data and the groupings, which the package loads only when a request reads them, as part of the entry. It is 1,207 kB gzipped for the main entry. It is not the installed tarball or what a browser downloads.

## With code splitting: what loads up front

`pnpm --dir apps/api size:split` bundles with code splitting and adds each chunk's own gzip, which is a little more than the one-file figure in total. `eager` is what the import loads; `later` is fetched by a dynamic `import()`.

| Entry | Loads with the import (gzipped) | Fetched later (gzipped) |
| ----- | ------------------------------- | ----------------------- |
| `/core` and the main entry | 740 to 765 kB (2.7 to 2.8 MB minified) | 610 kB of data, when a request reads it |
| `/browser`, `/msw`, `/element` | 1 to 4 kB | the app, with that data, on the first request |
| `/vite` | 9 kB | the app, on the first request |
| `/mock` | 518 kB | nothing |

The weight inside the app, inlined and minified, is Kuni (1.4 MB), Faker (1.25 MB), address-plus (0.7 MB) and Zod (0.45 MB).

## For a Node app: the install

About 3 MB to download, 12 MB unpacked and about 50 MB with its dependencies (31 packages). A server idles near 200 MB of memory and starts in about a second. The number that matters for Node is this one.
