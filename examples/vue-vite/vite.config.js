import { restInPieces } from '@johnmorrisdotca/rest-in-pieces/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// restInPieces() serves the fake API from the dev server itself, under /api: no second process, no proxy.
export default defineConfig({ plugins: [vue(), restInPieces()] });
