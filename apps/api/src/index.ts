/** The API as a value: `app.request('/users?limit=5')` answers in-process, with no port. */
import { app } from './app.ts';

export { type AppOptions, createApp } from './core.ts';
export { app };
export default app;
