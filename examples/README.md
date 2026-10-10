# Starters

Three small apps that load their data from REST in Pieces, each one click from a running copy in your browser. They show a loading state, an error state (`fail=0.5`) and a seeded list, so the same page renders the same data every time.

| Starter | Stack | How the API reaches it | Open it |
| ------- | ----- | ---------------------- | ------- |
| [react-vite](react-vite) | React 19, Vite | The Vite plugin serves it from the dev server under `/api` | [StackBlitz](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/react-vite) · [CodeSandbox](https://codesandbox.io/s/github/spxis/rest-in-pieces/tree/main/examples/react-vite) |
| [vue-vite](vue-vite) | Vue 3, Vite | The Vite plugin, as above | [StackBlitz](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/vue-vite) · [CodeSandbox](https://codesandbox.io/s/github/spxis/rest-in-pieces/tree/main/examples/vue-vite) |
| [nextjs](nextjs) | Next.js 16, app router | One route, `app/api/[[...path]]/route.js`, answers `/api/*` with `createApp()` | [StackBlitz](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/nextjs) |

StackBlitz runs all three in the browser with no account. CodeSandbox opens the two Vite starters in its browser sandbox; it may ask you to sign in to run them, and Next.js needs a server, so use StackBlitz for that one.

To run one on your machine:

```sh
cd examples/react-vite
npm install
npm run dev
```

They install `@johnmorrisdotca/rest-in-pieces` from npm and are not part of the workspace, so each is a copy you can take as it is. The same API is in the [Postman and Bruno collections](../collections) and, with nothing to install at all, in the [static API](../docs/static-api.md).
