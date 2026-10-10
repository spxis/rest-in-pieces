/**
 * `rest-in-pieces serve --openapi <file>`: reads the document and builds the mock, or says in a sentence why it cannot.
 * Only the file is Node's; the mock is `lib/openapiMock.ts`, which runs anywhere fetch does.
 */
import { CliError } from './cli.ts';
import { createMock, type Mock, OpenApiError } from './lib/openapiMock.ts';
import { readSchemaFile } from './offline.ts';

/** The most operations the start-up message lists; the rest are counted, and `GET /__mock` lists them all. */
const LISTED = 40;

export interface LoadedMock {
  mock: Mock;
  /** What to print once the server is listening at `url`. */
  banner: (url: string) => string;
}

/** Reads and checks the document at `path`. Throws `CliError`, whose message is fit to print, for anything wrong with it. */
export function loadMock(path: string, options: { safe: boolean; log: boolean }): LoadedMock {
  const document = readSchemaFile(path);
  let mock: Mock;
  try {
    mock = createMock(document, { safe: options.safe, log: options.log });
  } catch (error) {
    if (error instanceof OpenApiError) throw new CliError(`${path} cannot be mocked:\n${error.message}`);
    throw error;
  }
  const banner = (url: string) => {
    const width = Math.max(...mock.operations.slice(0, LISTED).map((operation) => operation.method.length));
    const lines = mock.operations
      .slice(0, LISTED)
      .map(
        (operation) =>
          `  ${operation.method.padEnd(width)}  ${operation.path}${operation.status === undefined ? '' : `  -> ${operation.status}`}`,
      );
    if (mock.operations.length > LISTED) lines.push(`  …and ${mock.operations.length - LISTED} more`);
    return [
      `Mocking ${mock.title}${mock.version ? ` ${mock.version}` : ''} from ${path}: ${mock.operations.length} operation${mock.operations.length === 1 ? '' : 's'} at ${url}`,
      ...lines,
      `Every route answers with seeded data in the shape of its response schema, and checks the request against the document.`,
      `Controls on any route: ?delay=1500  ?status=503  ?fail=0.3  ?trickle=200  ?seed=7  ?locale=ja`,
      `GET ${url}/__mock lists the operations; ${url}/__mock/docs shows the document.`,
    ].join('\n');
  };
  return { mock, banner };
}
