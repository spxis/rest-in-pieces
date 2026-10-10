import { useEffect, useState } from 'react';
import { isInBrowserApi } from '../lib/inBrowserApi.ts';
import { trimBase } from '../lib/request.ts';

/** Datasets made from a package the copy of the API inside a browser tab cannot load (Chizu), so the tab has none of them. */
const NOT_IN_A_TAB: ReadonlySet<string> = new Set(['features']);

export interface ResourceInfo {
  name: string;
  description: string;
  idField: string;
  seeded: boolean;
  /** Takes POST, PUT, PATCH and DELETE. Missing from an API that predates writes. */
  writable?: boolean;
  fields: string[];
  /** Fields per data locale; Japanese records add readings such as `nameKana`. */
  locales?: Record<string, { fields: string[] }>;
  /** What `expand=` takes, such as `user` or `items.product`. Missing from an API that predates relations. */
  expand?: string[];
  /** Lists under one record, such as `orders` for `/users/{id}/orders`. */
  nested?: string[];
}

/** One entry of `GET /locales`. */
export interface DataLocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  /** BCP 47 tag; `null` for the global mix. */
  tag: string | null;
  default: boolean;
}

export interface Catalog {
  resources: ResourceInfo[];
  generators: Record<string, string[]>;
  /** The arguments of each type that takes them, such as `number.int: 'min, max'`. */
  parameters: Record<string, string>;
  locales: DataLocaleInfo[];
  state: 'loading' | 'ready' | 'offline';
}

/** Used until the API answers, and when it cannot be reached. */
export const FALLBACK_CATALOG: Omit<Catalog, 'state'> = {
  resources: [
    {
      name: 'names',
      description: 'People',
      idField: 'index',
      seeded: true,
      fields: ['index', 'name', 'age', 'address', 'city', 'province', 'postal', 'country', 'gender'],
    },
    {
      name: 'countries',
      description: 'Countries',
      idField: 'alpha2',
      seeded: false,
      fields: ['alpha2', 'alpha3', 'name', 'status', 'ioc', 'emoji', 'currencies', 'languages', 'countryCallingCodes'],
    },
  ],
  generators: { person: ['fullName', 'firstName', 'lastName'], internet: ['email', 'username', 'url'] },
  parameters: {},
  // The two locales every version of the API has had, for an API that is offline or predates `/locales`.
  locales: [
    { code: 'en-CA', name: 'English (Canada)', nativeName: 'English (Canada)', tag: 'en-CA', default: true },
    { code: 'ja', name: 'Japanese (Japan)', nativeName: '日本語（日本）', tag: 'ja-JP', default: false },
  ],
};

/** Loads the dataset list, generator types and data locales from the API, refreshing when the base URL changes. */
export function useCatalog(apiBase: string): Catalog {
  const [catalog, setCatalog] = useState<Catalog>({ ...FALLBACK_CATALOG, state: 'loading' });

  useEffect(() => {
    const base = trimBase(apiBase);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCatalog((current) => ({ ...current, state: 'loading' }));
      const get = async (path: string) => {
        const response = await fetch(`${base}${path}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`${path} returned ${response.status}`);
        return response.json();
      };
      try {
        const [resources, generators, locales] = await Promise.all([
          get('/resources'),
          get('/generators'),
          // An API older than `/locales` still serves the rest of the catalog.
          get('/locales').catch(() => null),
        ]);
        if (!Array.isArray(resources) || typeof generators?.modules !== 'object') throw new Error('Unexpected catalog');
        setCatalog({
          resources: isInBrowserApi(apiBase)
            ? (resources as ResourceInfo[]).filter((one) => !NOT_IN_A_TAB.has(one.name))
            : resources,
          generators: generators.modules,
          parameters: typeof generators.parameters === 'object' && generators.parameters ? generators.parameters : {},
          locales: Array.isArray(locales) && locales.length > 0 ? locales : FALLBACK_CATALOG.locales,
          state: 'ready',
        });
      } catch (error) {
        if (!controller.signal.aborted) setCatalog({ ...FALLBACK_CATALOG, state: 'offline' });
        if (!(error instanceof DOMException)) console.debug(error);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiBase]);

  return catalog;
}
