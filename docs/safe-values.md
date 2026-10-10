# Safe values

[Back to the README.](https://github.com/spxis/rest-in-pieces#safe-values)

`safe=true` writes contact details and addresses that cannot reach anybody, because each comes from a range set aside for examples or fiction. It is opt-in in 2.x so that existing seeded output does not change (a test pins a sample of it), and **it becomes the default in 3.0**. One request takes `?safe=true`, the command line `--safe` or `REST_IN_PIECES_SAFE=true`, and in-process, Vite, MSW or a browser tab `createApp({ safe: true })`.

| Value | With `safe=true` |
| ----- | ---------------- |
| Email | The part before the `@` kept, at `example.com`, `example.org` or `example.net` ([RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)); the same address always maps the same way, so a comment's `email` still matches its author's. An email inside other text (a git commit entry) moves too. |
| URL and domain | On those domains and their subdomains: a company's `website` is `https://koehlerhelplingundziegler.example.com`, its email `hello@` the same host. |
| Phone | From the range the country's regulator keeps for fiction; see below. |
| Payment card | Only the test numbers payment processors publish for sandboxes (Stripe, Braintree, PayPal): Luhn-valid, declined by live systems. `finance.creditCardNumber(amex)` picks a network's. |
| IP address | Only the documentation ranges: `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24` ([RFC 5737](https://www.rfc-editor.org/rfc/rfc5737)) and `2001:db8::/32` ([RFC 3849](https://www.rfc-editor.org/rfc/rfc3849)). |
| Avatar and image | This API's own [`/avatars/{seed}.svg?name=`](#images-avatars-and-placeholders) and `/images/{w}x{h}.svg`, never another host. |

Phone numbers by locale:

| Locale | Range | Kept by |
| ------ | ----- | ------- |
| `en-CA`, `fr-CA`, `en-US` | `416-555-0100` to `…-555-0199`, with a real area code | The North American Numbering Plan Administrator: 555-0100 to 555-0199 are reserved for fiction |
| `en-GB` | `07700 900000` to `07700 900999` | Ofcom's drama numbers |
| `de` | `030 23125000`–`999` (Berlin), `069 90009…` (Frankfurt), `040 66969…` (Hamburg), `0221 4710…` (Cologne), `089 99998…` (Munich) | The Bundesnetzagentur's drama numbers |
| `fr` | `01 99 00 xx xx`, `02 61 91 xx xx`, `03 53 01 xx xx`, `04 65 71 xx xx`, `05 36 49 xx xx`, `06 39 98 xx xx` | ARCEP's six fiction blocks |
| `en-IN`, `zh-CN`, `pt-BR`, `ru`, `id`, `ja`, `ko`, `es-MX`, `vi` | `+1 555-0100` to `+1 555-0199` | No published fiction range was found for these countries, and a made-up number in their own format may belong to someone, so they get the North American one in international form. A Japanese user's `phone` then reads `+1 555-0109` rather than `090-…`; leave `safe` off where a layout test needs the national format. |

- **In `/generate`**, these types change: `internet.email`, `internet.url`, `internet.domainName`, `internet.domainSuffix`, `internet.ip`, `internet.ipv4`, `internet.ipv6`, `finance.creditCardNumber`, `phone.number`, `image.avatar`, `image.avatarGitHub`, `image.url` and `image.urlPicsumPhotos`. Every other type is as it was, and any email inside a string moves to an example domain.
- **Avatar links are absolute**, on the address the request came to, so a `PUT` of a record still validates. Behind a path prefix the API cannot see, send `X-Forwarded-Prefix: /api`; the Vite plugin, the MSW handlers and `installInBrowserApi` send it themselves.
- **What it is not.** Safe values make data safe to send, call or load in a test. They are not anonymisation or de-identification: the data is fake to begin with, and nothing real goes in.
