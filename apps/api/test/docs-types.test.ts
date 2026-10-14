import ts from 'typescript-api';
import { describe, expect, it } from 'vitest';
import { documentOpenApiTypes } from '../scripts/docs-openapi.ts';

const original =
  'export interface paths {}\nexport type webhooks = Record<string, never>;\nexport interface components {}\nexport type $defs = Record<string, never>;\nexport interface operations {}\n';
const tokens = (source: string) => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
  const values: string[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) values.push(scanner.getTokenText());
  return values;
};

describe('the generated OpenAPI type documentation', () => {
  it('documents every public export while preserving every declaration token', () => {
    const documented = documentOpenApiTypes(original);
    expect(tokens(documented)).toEqual(tokens(original));
    const source = ts.createSourceFile('types.d.ts', documented, ts.ScriptTarget.Latest, true);
    for (const declaration of source.statements) {
      const example = ts.getJSDocTags(declaration).find((tag) => tag.tagName.text === 'example');
      expect(example?.comment).toContain('from "@johnmorrisdotca/rest-in-pieces/types"');
      expect(example?.comment).toContain('console.log');
    }
  });

  it('refuses a newly generated export with no owned documentation', () => {
    expect(() => documentOpenApiTypes(`${original}export interface newPublicType {}\n`)).toThrow(
      /newPublicType needs a documented example/,
    );
  });

  it('refuses documentation for an export the generator no longer produces', () => {
    expect(() => documentOpenApiTypes(original.replace('export interface operations {}\n', ''))).toThrow(
      /no longer export operations/,
    );
  });
});
