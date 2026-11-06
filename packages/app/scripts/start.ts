/**
 * Host-side entry (`npm start`). The server itself is `src/server.ts`; this is
 * the wrapper that runs it straight from source.
 *
 * Production runs the COMPILED entry instead:
 * `node packages/app/lib/server.js` (see the Dockerfile). Started from source
 * under NODE_ENV=production every `.tsx` route would 500 — Node's type
 * stripping cannot load JSX and there is no Vite to transform it. See the note
 * in `src/server.ts`.
 */
import '../src/server.ts'
