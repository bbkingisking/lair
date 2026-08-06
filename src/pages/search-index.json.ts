import type { APIRoute } from 'astro';
import { buildSearchIndex } from '../utils/search-index';

// Emitted once at build time and fetched lazily by the masthead search, rather
// than inlined into every page that carries a search box.
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(await buildSearchIndex()), {
    headers: { 'Content-Type': 'application/json' },
  });
};
