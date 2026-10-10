# REST in Pieces with React and Vite

A starter that loads seeded data from [REST in Pieces](https://github.com/spxis/rest-in-pieces) and shows loading, error and ready states.

[Open in StackBlitz](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/react-vite) · [Open in CodeSandbox](https://codesandbox.io/s/github/spxis/rest-in-pieces/tree/main/examples/react-vite)

```sh
npm install
npm run dev
```

`vite.config.js` adds `restInPieces()`, which serves the API from the dev server under `/api`: no second process and no proxy. Change `seed=7` in the request to get another dataset, `fail=0.5` makes half the requests fail, and `delay=800` makes the loading state visible. See the [options](https://github.com/spxis/rest-in-pieces#using-the-api).
