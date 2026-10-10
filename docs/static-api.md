# The public static API

A read-only copy of REST in Pieces at fixed addresses on GitHub Pages: nothing to install, no key, no sign-up and no server behind it. It is made for tutorials, classroom exercises, CodePens and first prototypes, where "fetch this URL" has to work on any machine. [Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

Base address: **`https://spxis.github.io/rest-in-pieces/api/`**. Every file allows requests from any origin (`Access-Control-Allow-Origin: *`), so it works from `fetch` in any page, from `curl` and from a Node script.

```js
const base = 'https://spxis.github.io/rest-in-pieces/api/';
const { results } = await (await fetch(`${base}users.json`)).json(); // the first ten users
const user = await (await fetch(`${base}users/1.json`)).json();      // one user
```

```sh
curl https://spxis.github.io/rest-in-pieces/api/products/page/2.json   # products 11 to 20
curl https://spxis.github.io/rest-in-pieces/api/ja/products.json       # the first ten Japanese products
curl https://spxis.github.io/rest-in-pieces/api/index.json             # what is here
```

## Paths

GitHub Pages serves files, and cannot read a query string, so the page number is in the path and every address ends in `.json`. That ending is also how Pages knows to send the file as JSON.

| Address | What it holds |
| ------- | ------------- |
| `api/index.json` | The datasets, how many records and pages each holds, the path templates, the version and the seed |
| `api/{dataset}.json` | The first page: ten records, in the API's own envelope (`metadata` and `results`) |
| `api/{dataset}/page/{n}.json` | Page `n` of ten records; `metadata.links` point at the neighbouring files, and `next` is `null` on the last |
| `api/{dataset}/{id}.json` | One record, exactly as `GET /{dataset}/{id}` answers it |
| `api/{dataset}/{id}/{list}.json` | The records one record owns, such as `users/1/orders.json` or `posts/1/comments.json` |
| `api/ja/…` | The same tree with Japanese data (`?locale=ja`) |
| `api/jsonplaceholder/…` | The JSONPlaceholder-shaped tree, below |

Every dataset is here: `names`, `users`, `products`, `companies`, `countries` (all 250), `subdivisions` (all 5,050, in the default locale only, with `countries/{code}/subdivisions.json` for each country's own list), `groupings` (all 107, default locale only), `addresses` (the first 100 at seed 1, default locale only), `withdrawn` (the 31 withdrawn countries, at `withdrawn.json`: a file cannot be under `countries/`, whose folder holds a file for each country), `orders`, `posts`, `comments`, `todos`, `reviews`, `invoices`, `transactions`, `events`, `messages`, `notifications`, `jobs`, `places`, `metrics`, `logs` and the four synthetic-patient sets. `api/index.json` lists them with their relations, so a script can discover the tree instead of hard-coding it:

```js
const index = await (await fetch(`${base}index.json`)).json();
const users = index.datasets['en-CA'].find((dataset) => dataset.name === 'users');
// { name: 'users', idField: 'id', records: 100, pages: 10, nested: ['orders', 'posts', 'todos'] }
```

## A JSONPlaceholder tutorial

`api/jsonplaceholder/` answers with JSONPlaceholder's shapes and lengths, as bare arrays: 100 posts, 500 comments, 200 todos and 10 users, whose `name`, `address`, `website` and `company` are shaped as JSONPlaceholder's are. To follow a JSONPlaceholder tutorial, change the base address and add `.json` to each path:

| JSONPlaceholder | Here |
| --------------- | ---- |
| `/posts` | `api/jsonplaceholder/posts.json` |
| `/posts/1` | `api/jsonplaceholder/posts/1.json` |
| `/posts/1/comments` | `api/jsonplaceholder/posts/1/comments.json` |
| `/users/1/posts`, `/users/1/todos` | `api/jsonplaceholder/users/1/posts.json`, `…/todos.json` |
| `/comments?postId=1` | `api/jsonplaceholder/posts/1/comments.json` (a file cannot take a query) |

Albums and photos have no counterpart, as with the [`/jsonplaceholder`](https://github.com/spxis/rest-in-pieces#a-jsonplaceholder-tutorial-with-a-new-base-url) route.

## What it is not

- **Read-only.** There is no `POST`, `PUT`, `PATCH` or `DELETE`, no sign-in and no failure drills: a file cannot do any of them. Use the [in-browser demo](https://spxis.github.io/rest-in-pieces/) (the API runs inside the page, and keeps writes in the tab when asked), `npx`, Docker or the Vite plugin for those.
- **No query string.** `?limit=`, `?sortBy=`, filters, `?q=`, `?format=`, `?locale=` and `?seed=` are ignored. The choices are the paths above. For another seed, a filter, another format or another locale, run the API: `npx @johnmorrisdotca/rest-in-pieces`.
- **Small on purpose.** Each seeded dataset holds its first **100 records** (ten pages of ten) at seed 1; the real reference data (`countries` and the withdrawn countries) is whole, as it is small and has no seed, in the default locale (`en-CA`) and in Japanese (`ja`). The metrics, logs and synthetic-patient datasets are in the default locale only, because they are large or the same everywhere. A hundred records is a tutorial-sized table; for all 1,000 records, other locales and CSV, use the [fixtures](https://github.com/spxis/rest-in-pieces#fixtures).
- **Rebuilt with every release.** The files are written when the site is built, from the API of that version. A release can change what a seed produces, so a tutorial that must never change should keep its own copy of the files. `index.json` names the version. The `timestamp` and `lastUpdated` in a response are the build's, and `nextCursor` and `prevCursor` are `null`, since a cursor needs a running API.
- **Shared and cached.** GitHub serves it for nothing, and caches each file for ten minutes. It is meant for tutorials and prototypes, not for an application's production traffic.
- **Fetch it from another page.** On the demo site's own pages, the API running in the tab answers `api/` first (it does not know these file names), so call the files from your own page, `curl` or a script.

## How it is made

`pnpm --filter @rest-in-pieces/web build:pages` writes it. `apps/web/scripts/staticApi.ts` asks the API itself (`/resources` and `/locales`), so a new dataset gets its files with no change there, and `metadata.links` are rewritten to the files that answer them. It adds about 6,400 files and 6 MB, written in about a second, to the Pages build. `apps/web/scripts/staticApi.test.ts` checks that every link leads to a file, that every record on a page has its own file, that a record equals the API's answer, and that the sizes stay small.
