import { Hono } from 'hono';
import { generatorTypes } from '../data/generators.ts';

export const generators = new Hono().get('/', (c) => c.json({ generators: generatorTypes }));
