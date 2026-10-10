import { restInPieces } from '@johnmorrisdotca/rest-in-pieces/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// restInPieces() serves the fake API from the dev server itself, under /api: no second process, no proxy.
export default defineConfig({ plugins: [react(), restInPieces()] });
