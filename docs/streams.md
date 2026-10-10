# Live streams: Server-Sent Events

`GET /streams/{name}` plays a dataset as a Server-Sent Events stream, one record at a time, for the screens that listen: a chat, a notification bell, a metrics chart, a log tail. The events are the dataset's own records, seeded, so a stream replays exactly and every client sees the same sequence. [Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

| Stream | Plays | For |
| ------ | ----- | --- |
| `/streams/messages` | `/messages` | A chat or mail feed; a reply comes after the message it answers |
| `/streams/notifications` | `/notifications` | A bell, a badge count, a toast (for users 1 to 1,000) |
| `/streams/metrics` | `/metrics` | A chart that ticks, with an incident now and then |
| `/streams/logs` | `/logs` | A log tail with levels, services and the odd error |

`GET /streams` lists them.

```js
const source = new EventSource('http://localhost:6800/streams/logs?count=20&every=500');
source.onmessage = (event) => console.log(JSON.parse(event.data)); // one log line
source.addEventListener('end', () => source.close());               // after the last event
```

```sh
curl -N 'http://localhost:6800/streams/metrics?count=5&every=200'
```

```
retry: 3000
: metrics stream, seed 1, 5 events, one every 200 ms, from id 1

id: 1
data: {"id":1,"timestamp":"2025-12-28T12:40:00.000Z","host":"web-6","cpuPercent":47,"memoryPercent":45.4,"requestsPerSecond":859.5,"latencyMs":81.8,"errorRatePercent":0.21,"incident":false}

id: 2
data: {"id":2,...}
```

The event's `id` is the record's own `id`, and `data` is the record as one line of JSON, so the first N events are exactly the first N records of `/metrics?limit=N` for the same `seed` (and `locale`, for messages and notifications). Events are unnamed, so `onmessage` receives them; the stream ends with a named `end` event.

## Parameters

| Parameter | Default | Does |
| --------- | ------- | ---- |
| `count` | 20 | Events in the whole stream, 1 to 500. After the last one the stream sends `end` and closes |
| `every` | 1000 | Milliseconds between events, 100 to 10,000. The first event comes at once |
| `duration` | 30 | Seconds one connection stays open, 1 to 60. A client that reconnects carries on from where it was |
| `seed`, `locale`, `safe` | 1, `en-CA`, off | As on the datasets: another seed, [another locale](https://github.com/spxis/rest-in-pieces#data-locales), [safe values](https://github.com/spxis/rest-in-pieces#safe-values) |
| `drop` | 0 | Close the connection without `end` after this many events, to rehearse a client that reconnects |
| `delay` | none | Wait this many milliseconds before the first event |
| `status`, `fail` | none | Refuse with that status (`?status=503`, with `Retry-After`) or a share of connections (`?fail=0.3`), as on every route |
| `lastEventId` | none | Start after this id, for a client that cannot send `Last-Event-ID` |

An unsupported locale is `400`, an unknown stream `404`.

## Resuming

`EventSource` reconnects after a drop and sends the last id it saw as `Last-Event-ID`; the stream carries on from the next one, whatever `every` and `count` were. After the last event has gone, a reconnect is answered `204 No Content`, which tells `EventSource` to stop instead of reconnecting for ever. Try it: `?count=10&drop=3` closes after three events without an `end`, your client reconnects, and gets events 4 to 6, then 7 to 9, then 10.

`fetch` clients send the header themselves: `fetch(url, { headers: { 'Last-Event-ID': '3' } })`.

## Limits

An open stream is a held connection, so everything about it is bounded: at most 500 events in a stream, 60 seconds for one connection (it closes with a comment saying where to resume), an event at most every 100 ms, and one timer per open stream, with nothing running between events. A client that goes away stops its timer. There is no `max` on connections: run it where you can leave it open, which is your own machine, a container, or the dev server.

## What works where

| Where | Works | Notes |
| ----- | ----- | ----- |
| `npx`, Docker, `node` | `EventSource`, `fetch`, `curl -N` | |
| The Vite plugin | `EventSource`, `fetch` | Served from the dev server's origin under the plugin's base: `new EventSource('/api/streams/logs')` |
| In a test (`createApp().request()`) | Read the body stream | `const reader = (await app.request('/streams/logs?count=3&every=100')).body.getReader()` |
| Mock Service Worker | `fetch` | The handlers pass a streaming response through. Check `EventSource` in your own MSW version, or use the Vite plugin for it |
| The API inside the page (`installInBrowserApi`, the live demo) | `fetch` only | `EventSource` opens its own network connection, which the in-page API cannot answer. The playground's Streams tab reads with `fetch` |
| The [static API](static-api.md) and [fixtures](fixtures.md) on GitHub Pages | No | Files cannot stream |
| Serverless hosts (Vercel) | Off | A held connection is billed by time. Set `REST_IN_PIECES_STREAMS=off`, or `createApp({ streams: false })`, and `/streams` answers `404` |

WebSocket is not offered: the server is a fetch-style app with no upgrade handling, and Server-Sent Events cover the one-way feeds these datasets make.
