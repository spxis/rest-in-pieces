import type { Plugin } from 'vite';

export function packageOf(id: string): { name: string; dir: string } | null;
export function thirdPartyLicences(options?: { fileName?: string; title?: string }): Plugin;
