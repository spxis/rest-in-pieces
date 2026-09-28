import { useEffect, useState } from 'react';
import { trimBase } from '../lib/request.ts';

export interface ResourceInfo {
  name: string;
  description: string;
  idField: string;
  seeded: boolean;
  fields: string[];
}

export interface Catalog {
  resources: ResourceInfo[];
  generators: Record<string, string[]>;
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
};

/** Loads the dataset list and generator types from the API, refreshing when the base URL changes. */
export function useCatalog(apiBase: string): Catalog {
  const [catalog, setCatalog] = useState<Catalog>({ ...FALLBACK_CATALOG, state: 'loading' });

  useEffect(() => {
    const base = trimBase(apiBase);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCatalog((current) => ({ ...current, state: 'loading' }));
      try {
        const [resources, generators] = await Promise.all(
          ['/resources', '/generators'].map(async (path) => {
            const response = await fetch(`${base}${path}`, { signal: controller.signal });
            if (!response.ok) throw new Error(`${path} returned ${response.status}`);
            return response.json();
          }),
        );
        if (!Array.isArray(resources) || typeof generators?.modules !== 'object') throw new Error('Unexpected catalog');
        setCatalog({ resources, generators: generators.modules, state: 'ready' });
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
