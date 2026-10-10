import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';

// The whole API behind one route: /api/users, /api/orders?expand=user, and the rest.
const app = createApp();

async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  return app.fetch(new Request(new URL(`${path}${url.search}`, url.origin), request));
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
