# Relations

[Back to the README.](https://github.com/spxis/rest-in-pieces#relations)

Five datasets are joined to `/users` and `/products`, and to each other, by ids that always resolve:

| Dataset | Points at | Owned by | About, at seed 1 |
| ------- | --------- | -------- | ---------------- |
| `/orders` | `userId` → `/users`, each item's `productId` → `/products` | a user: 0 to 5 each | 1,680 |
| `/posts` | `userId` → `/users` | a user: 0 to 5 each | 1,160 |
| `/comments` | `postId` → `/posts`, `userId` → `/users` | a post: 0 to 6 each | 3,128 |
| `/todos` | `userId` → `/users` | a user: 0 to 8 each | 4,480 |
| `/reviews` | `productId` → `/products`, `userId` → `/users` | a product: 0 to 6 each | 2,349 |

```sh
curl 'http://localhost:6800/users/2/orders'                          # user 2's orders
curl 'http://localhost:6800/orders/4?expand=user,items.product'      # an order with its buyer and products
curl 'http://localhost:6800/posts?userId=1&expand=comments'          # a user's posts with their comments
curl 'http://localhost:6800/comments?limit=5&expand=post.user,user'  # two levels: the post's author too
```

```json
{
  "id": 4,
  "userId": 2,
  "orderStatus": "delivered",
  "items": [
    { "productId": 960, "name": "Soft Metal Car", "quantity": 1, "unitPrice": 553.99, "lineTotal": 553.99 },
    { "productId": 106, "name": "Recycled Bronze Fish", "quantity": 2, "unitPrice": 888.5, "lineTotal": 1777 }
  ],
  "itemCount": 3,
  "currency": "CAD",
  "subtotal": 2330.99,
  "taxRate": 0.13,
  "tax": 303.03,
  "total": 2634.02,
  "createdAt": "2025-06-28T03:37:44.000Z",
  "shippedAt": "2025-06-29T17:20:36.000Z",
  "deliveredAt": "2025-07-01T22:35:32.000Z"
}
```

- **Who owns what depends on the seed alone.** Each parent owns a seeded number of children, the same in every locale, and one prefix sum per seed turns the counts into id ranges: user 2's orders are a range worked out by arithmetic, never found by a scan, so `/users/2/orders` costs what a page costs. The first ten users, posts and products always own at least one child, so the records a tutorial asks for first are never empty.
- **Nested routes are lists.** `/users/{id}/orders`, `/users/{id}/posts`, `/users/{id}/todos`, `/posts/{id}/comments` and `/products/{id}/reviews` return exactly what the filter (`/orders?userId=2`) does, with paging, sorting, filters, search, formats, `expand`, `messy`, `safe`, locales, ETags and the simulation. A parent that does not exist is a `404`; one with no children is an empty page.
- **`expand` embeds related records**: a record it points at (`user`, `product`, `post`), a record's children (`orders`, `posts`, `todos`, `comments`, `reviews`), or what an order's items point at (`items.product`). `GET /resources` lists what each dataset takes. It applies to the page only, goes two levels deep at most (`post.user`), takes six paths at most, and embeds at most 5,000 records in one response, answering `400` past any of these. An embedded record reads exactly as its own route shows it, `safe` and `messy` included; one that no longer exists (deleted in a session) is `null`. Embeds are presentation: a cursor carries across a change of `expand`.
- **Totals add up.** Each line is `quantity × unitPrice`, `subtotal` adds the lines, `tax` is the subtotal times the buyer's locale's headline rate (the `taxRate` column of [Data locales](https://github.com/spxis/rest-in-pieces#data-locales)), and `total` adds the two, all in whole units of the currency's smallest coin, so they add up exactly. In `global`, an order is in its buyer's currency and holds only products priced in it.
- **Dates follow one another.** An order is placed after its buyer joined; a `shipped` order has `shippedAt` after `createdAt`, a `delivered` or `refunded` one `deliveredAt` after that; recent orders are still `pending` or `paid`. A comment comes after its post and after the comments before it, a review after the product was listed and the reviewer joined, a todo's `dueOn` after it was made.
- **And more that agrees.** Nobody comments on their own post. Review ratings gather around the product's own `rating`, and their words match their stars. A comment's `name` and `email` are its author's.
- **Writes keep relations whole**, with the session on or off: see [Sessions](https://github.com/spxis/rest-in-pieces#sessions-keeping-writes). `POST /orders` takes `{ "userId": 3, "items": [{ "productId": 5, "quantity": 2 }] }` and works out the names, prices, totals, tax and dates itself; a `PATCH` of `orderStatus` moves `shippedAt` and `deliveredAt` on, and one without `items` keeps what was charged.
- **Words.** Posts and comments are Faker's lorem in the locale's language, as JSONPlaceholder's are; todos and reviews are hand-written English; `ja` has hand-written Japanese for all four.
