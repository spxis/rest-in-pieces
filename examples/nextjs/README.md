# REST in Pieces with Next.js

A starter that loads seeded data from [REST in Pieces](https://github.com/spxis/rest-in-pieces) and shows loading, error and ready states.

[Open in StackBlitz](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/nextjs)

```sh
npm install
npm run dev
```

The API is one route, `app/api/[[...path]]/route.js`: it builds `createApp()` from `@johnmorrisdotca/rest-in-pieces/core` and hands every `/api/*` request to it. Change `seed=7` in the request to get another dataset, `fail=0.5` makes half the requests fail, and `delay=800` makes the loading state visible. See the [options](https://github.com/spxis/rest-in-pieces#using-the-api).
