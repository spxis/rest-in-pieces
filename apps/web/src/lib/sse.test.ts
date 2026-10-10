import { describe, expect, it } from 'vitest';
import { readSse, type SseEvent } from './sse.ts';

function collect(chunks: string[]) {
  const events: SseEvent[] = [];
  const comments: string[] = [];
  const retries: number[] = [];
  const reader = readSse(
    (event) => events.push(event),
    (text) => comments.push(text),
    (ms) => retries.push(ms),
  );
  for (const chunk of chunks) reader.push(chunk);
  reader.finish();
  return { events, comments, retries };
}

describe('readSse', () => {
  it('reads an event with an id, a name and data, and defaults the name to message', () => {
    const { events } = collect(['id: 4\nevent: end\ndata: {"a":1}\n\nid: 5\ndata: plain\n\n']);
    expect(events).toEqual([
      { id: '4', event: 'end', data: '{"a":1}' },
      { id: '5', event: 'message', data: 'plain' },
    ]);
  });

  it('joins several data lines with a newline, and strips only one space', () => {
    expect(collect(['data: a\ndata:  b\ndata\ndata: c\n\n']).events[0]?.data).toBe('a\n b\n\nc');
  });

  it('is the same however the text is cut, even in the middle of a line or a CRLF', () => {
    const text = 'retry: 3000\n: hello\n\nid: 1\ndata: {"x":"é"}\n\nid: 2\r\ndata: two\r\n\r\n';
    const whole = collect([text]);
    for (let cut = 1; cut < text.length; cut += 3) {
      const split = collect([text.slice(0, cut), text.slice(cut)]);
      expect(split.events, `cut at ${cut}`).toEqual(whole.events);
      expect(split.comments).toEqual(whole.comments);
    }
    const bytewise = collect([...text]);
    expect(bytewise.events).toEqual(whole.events);
    expect(whole.events.map((event) => event.id)).toEqual(['1', '2']);
    expect(whole.retries).toEqual([3000]);
    expect(whole.comments).toEqual(['hello']);
  });

  it('keeps the last id for events that carry none, and ignores an id with a NUL', () => {
    const { events } = collect(['id: 7\ndata: a\n\ndata: b\n\nid: x\0y\ndata: c\n\n']);
    expect(events.map((event) => event.id)).toEqual(['7', '7', '7']);
  });

  it('reads CR and LF line ends, a leading BOM, and unknown fields as nothing', () => {
    const { events } = collect(['﻿data: a\r\r', 'data: b\r\n\r\n', 'wibble: 1\nretry: soon\ndata: c\n\n']);
    expect(events.map((event) => event.data)).toEqual(['a', 'b', 'c']);
  });

  it('does not dispatch an event with no data, and drops one the stream ended in the middle of', () => {
    expect(collect(['id: 1\n\nevent: x\n\n']).events).toEqual([]);
    expect(collect(['data: half']).events).toEqual([]);
    expect(collect(['data: whole\n\ndata: half']).events).toHaveLength(1);
  });

  it('reports comments and retry', () => {
    const { comments, retries } = collect([':no space\n: with space\nretry: 1500\nretry: nope\n\n']);
    expect(comments).toEqual(['no space', 'with space']);
    expect(retries).toEqual([1500]);
  });
});
