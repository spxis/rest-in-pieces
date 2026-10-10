# Writes, sessions and sign-in

[Back to the README](https://github.com/spxis/rest-in-pieces#readme).

## Writes

`/names`, `/users`, `/products`, `/companies`, `/orders`, `/posts`, `/comments`, `/todos` and `/reviews` take writes, so a client can rehearse a form submit, an optimistic update, a delete confirmation and a validation error:

```sh
# Create: 201, with the next id after the dataset's last, createdAt, updatedAt and a Location header
curl -i -X POST 'http://localhost:6800/users' -H 'Content-Type: application/json' \
  -d '{ "firstName": "Ada", "lastName": "Lovelace", "username": "ada", "email": "ada@example.com",
        "avatar": "https://example.com/ada.png", "phone": "416-555-0100", "jobTitle": "Analyst",
        "company": "Analytical Engines", "city": "Toronto", "country": "CA", "active": true }'

# Update some fields: 200 with the record merged with them
curl -X PATCH 'http://localhost:6800/users/42' -H 'Content-Type: application/json' -d '{ "active": false }'

# Delete: 204
curl -i -X DELETE 'http://localhost:6800/users/42'

# A validation error, a conflict, and a slow failing save
curl -X POST 'http://localhost:6800/users' -H 'Content-Type: application/json' -d '{ "email": "nope" }'
curl -i -X PUT 'http://localhost:6800/users/42?conflict=true' -H 'Content-Type: application/json' -d '{ … }'
curl -i -X PATCH 'http://localhost:6800/users/42?delay=1500&status=503' -H 'Content-Type: application/json' -d '{}'
```

| Request | Answer |
| ------- | ------ |
| `POST /{dataset}` | `201` with the record, the next id (`1001` for users, `1000` for the zero-based `/names`, one past the last for the related datasets), `createdAt` and `updatedAt`, and `Location: /users/1001`. |
| `PUT /{dataset}/{id}` | `200` with the body under the same id, `createdAt` kept and `updatedAt` set. Every field is required. |
| `PATCH /{dataset}/{id}` | `200` with the record merged with the fields sent, and `updatedAt` set. |
| `DELETE /{dataset}/{id}` | `204` with no body. |
| An unknown id | `404`, as the `GET` answers. |
| A body that fails validation | `422` with a message per field: `{ "error": "Validation failed", "fields": { "email": "Invalid email" } }`. A missing field says `Required`; a reference to a record that does not exist says so: `{ "userId": "No user with id 5000." }`. |
| `?conflict=true` | `409`, to rehearse "someone else changed this". |
| Malformed JSON, or no `Content-Type: application/json` | `400` or `415`. Bodies over 64 KB get `413`. |
| A full session | `507` with a message saying which limit, when the [session](#sessions-keeping-writes) is on. |

The body is the record without the fields the server sets (the id and `createdAt`); those are ignored if sent, and so is any field the dataset does not have. The schemas are `PersonInput`, `UserInput`, `ProductInput`, `CompanyInput`, `OrderInput`, `PostInput`, `CommentInput`, `TodoInput` and `ReviewInput` in [`/openapi.json`](https://github.com/spxis/rest-in-pieces#endpoints); a related dataset's references must name records that exist, and an order's prices and totals are worked out by the server (see [Relations](https://github.com/spxis/rest-in-pieces#relations)). Every record a dataset serves is a valid `PUT` body. `delay`, `trickle`, `status` and `fail` work as they do on reads; on a `PUT`, `PATCH` or `DELETE`, `seed` and `locale` choose the record, as on the `GET`. Writes answer in JSON.

**Stateless by default.** Unless the session is on, nothing is stored: a write never changes what a later read returns, on a shared host or anywhere else, and the response is what the write would have produced. Turn the [session](#sessions-keeping-writes) on to keep writes. `/countries` is real reference data keyed by ISO code, so it stays read-only, as does the deprecated `/random-names` alias.

## Sessions: keeping writes

Off by default, and opt-in wherever the API runs:

| Where | Turn it on |
| ----- | ---------- |
| The command line | `npx @johnmorrisdotca/rest-in-pieces --session`, or `REST_IN_PIECES_SESSION=true` (also in Docker: `-e REST_IN_PIECES_SESSION=true`) |
| In-process | `createApp({ session: true })` |
| The Vite plugin | `restInPieces({ app: { session: true } })` |
| MSW | `restInPiecesHandlers({ http, app: { session: true } })` |
| A browser tab | `installInBrowserApi({ app: { session: true } })` |

```sh
npx @johnmorrisdotca/rest-in-pieces --session

curl -X DELETE 'http://localhost:6800/users/1'                # 204
curl -i 'http://localhost:6800/users/1'                       # 404: it stays deleted
curl 'http://localhost:6800/users?limit=1' | jq .metadata.total   # 999
curl 'http://localhost:6800/session'                          # what the session holds
curl -X POST 'http://localhost:6800/reset'                    # the seed again: 1000 users
```

- **What it keeps.** `POST` adds the record with the next id (ids are never given out twice, even after a delete), `PUT` and `PATCH` replace and merge, `DELETE` removes. Lists, counts, `X-Total-Count`, filters, search, sorting, paging, cursors, `messy` and item routes all see the change, and so does `/auth/me` for a user who was edited, disabled or deleted.
- **Per seed and locale.** A dataset is copied into the session on its first write, at that request's `seed` and `locale`, so `/users?seed=7` and `/users?locale=ja` change apart from `/users`. Everything not written to is still read straight from the seed.
- **`GET /session`** lists every changed dataset with its created, updated and deleted counts and its size, plus the limits. **`POST /reset`** drops every change, or one dataset's with `?dataset=users`, and answers `200` when the session is off too, so a test's `beforeEach` can call it either way.
- **Relations stay whole.** A write must name records that exist: an order's `userId` and every item's `productId`, a comment's `postId` and `userId`, a review's `productId` and `userId`, a post's or todo's `userId`, at the same `seed` and `locale`, or it answers `422` naming the field. A delete takes along every record that points at the one deleted, and theirs in turn: **deleting a user deletes their orders, their posts and every comment on those posts, their todos, and the comments and reviews they wrote**; deleting a post deletes its comments; deleting a product deletes its reviews. Orders keep a product's name and price as they were when it was ordered, the way a shop keeps what it charged, so deleting a product leaves the orders, and `expand=items.product` gives `null` there. The delete makes room for every dataset it changes first, or answers `507` and changes nothing. `GET /session` counts what each dataset lost.
- **Capped.** At most 2,000 records in a dataset of 1,000 (at one seed and locale), and in proportion for a dataset seeded with more (an orders dataset of 1,680 may hold 3,360); 64 changed datasets, counting each seed and locale apart, since one delete can change six; and 8 MB of written records. A write past a limit answers `507 Insufficient Storage` and keeps nothing; `createApp({ session: { records, datasets, bytes } })` moves the limits.
- **Memory only.** Nothing is written to disk and nothing runs on a timer. A restart starts again from the seed, each `createApp()` has a store of its own, and on a serverless host every instance keeps its own copy, so keep it off there. The hosted demos are stateless: the Vercel deployment never turns it on, and the GitHub Pages playground keeps writes only in your tab, and only after you tick **Keep writes in this tab**.

## Sign-in (fake auth)

A login form, protected routes, roles and expired tokens, against realistic answers. **Not security:** every account's password is `password`, and the tokens are HS256 JWTs signed with the published key `rest-in-pieces-not-a-secret`, so anyone can mint one. They are real JWTs only so that a client's own JWT decoding works on them.

```sh
curl -X POST 'http://localhost:6800/auth/login?expiresIn=30s' -H 'Content-Type: application/json' \
  -d '{ "username": "editor", "password": "password" }'
curl 'http://localhost:6800/auth/me' -H 'Authorization: Bearer <accessToken>'
curl -i 'http://localhost:6800/products?auth=admin' -H 'Authorization: Bearer <accessToken>'   # 403 for an editor
```

**Accounts.** Every user of `/users` signs in with their `username` or `email`, at the `seed` and `locale` in the login's query, so the same seed signs in the same person on every machine. The first active user is the `admin`, the second the `editor`, and every other user a `viewer`. Four usernames are shortcuts: `admin`, `editor` and `viewer` sign in as those accounts, and `disabled` names the first account that is not active.

| Request | Answer |
| ------- | ------ |
| `POST /auth/login` `{ "username", "password" }` (or `email`) | `200` with `tokenType: "Bearer"`, `accessToken`, `expiresIn` (seconds), `expiresAt`, `refreshToken`, `refreshExpiresIn` and `user` (the `/users` record plus `role`). |
| A wrong password or unknown user | `401` `{ "error": "Unauthorized", "code": "invalid_credentials", "message": … }` |
| An account that is not active | `403` with `code: "account_disabled"` |
| A missing field | `422` `{ "error": "Validation failed", "fields": { "password": "Required" } }` |
| `POST /auth/refresh` `{ "refreshToken" }` | `200` with a new pair, read again from the user's current record. Tokens are not stored, so an old refresh token works until it expires. |
| `GET /auth/me` with `Authorization: Bearer <accessToken>` | `200` with the user and their role. |
| `POST /auth/logout` | `204`. Signing out is the client forgetting its tokens. |
| No token, a malformed or tampered one, or a refresh token where an access token belongs | `401` with `code` `missing_token` or `invalid_token`, and `WWW-Authenticate: Bearer realm="rest-in-pieces"` (with `error="invalid_token"` and a description for a bad token). |
| An expired token | `401` with `code: "token_expired"`. |
| `?auth=editor` or `?auth=admin` with a role that is not enough | `403` with `code: "insufficient_role"`, `required` and `role`. |

- **Lifetimes.** Access tokens last 15 minutes and refresh tokens 7 days. `?expiresIn=` and `?refreshExpiresIn=` on login and refresh take seconds (`30`) or a unit (`30s`, `5m`, `2h`, `7d`), up to 30 days. `expiresIn=0` gives an access token that has already expired, so the refresh path can be rehearsed at once.
- **Protected routes.** `?auth=required`, `?auth=editor` or `?auth=admin` on any dataset, item, write or `/generate` turns that request into a protected route. Without `auth`, tokens are ignored, as before. A simulated `status` or `fail` still wins, so `?auth=required&status=503` is a `503`.
- **Rehearsable failures too.** `delay`, `status` and `fail` work on `/auth/*`, for a slow or failing sign-in.
- **In the OpenAPI document** as the `Auth` tag and a `bearerAuth` security scheme, so `/docs` can send a token.
