import { describe, expect, it } from 'vitest';
import { CliError, DEFAULT_PORT, displayUrl, parseCliArgs } from '../src/cli.ts';

describe('parseCliArgs', () => {
  it('listens on localhost:6800 by default', () => {
    expect(parseCliArgs([])).toEqual({ kind: 'serve', port: DEFAULT_PORT, host: 'localhost' });
    expect(DEFAULT_PORT).toBe(6800);
  });

  it('reads --port and --host, with a space or an equals sign', () => {
    expect(parseCliArgs(['--port', '6831', '--host', '0.0.0.0'])).toEqual({
      kind: 'serve',
      port: 6831,
      host: '0.0.0.0',
    });
    expect(parseCliArgs(['--port=6832', '--host=::1'])).toEqual({ kind: 'serve', port: 6832, host: '::1' });
  });

  it('falls back to PORT, which --port overrides', () => {
    expect(parseCliArgs([], { PORT: '6833' })).toMatchObject({ port: 6833 });
    expect(parseCliArgs(['--port', '6834'], { PORT: '6833' })).toMatchObject({ port: 6834 });
  });

  it('answers help and version before anything else', () => {
    expect(parseCliArgs(['--port', '1', '--help'])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['-h'])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['--version'])).toEqual({ kind: 'version' });
    expect(parseCliArgs(['-v', '--nope'])).toEqual({ kind: 'version' });
  });

  it('rejects unknown options, missing values and bad ports', () => {
    for (const argv of [['--nope'], ['6800'], ['--port'], ['--port', '--host'], ['--host='], ['--port', 'abc']]) {
      expect(() => parseCliArgs(argv), argv.join(' ')).toThrow(CliError);
    }
    expect(() => parseCliArgs(['--port', '70000'])).toThrow('--port must be a port number from 0 to 65535.');
    expect(() => parseCliArgs([], { PORT: '-1' })).toThrow('PORT must be a port number');
  });
});

describe('displayUrl', () => {
  it('shows a wildcard address as localhost and brackets IPv6', () => {
    expect(displayUrl('0.0.0.0', 6800)).toBe('http://localhost:6800');
    expect(displayUrl('::', 6800)).toBe('http://localhost:6800');
    expect(displayUrl('::1', 6800)).toBe('http://[::1]:6800');
    expect(displayUrl('127.0.0.1', 6801)).toBe('http://127.0.0.1:6801');
  });
});
