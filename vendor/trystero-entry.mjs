// Entryp bundling Trystero (strategi Nostr) menjadi satu file IIFE global.
// Build: npm run vendor  (esbuild -> vendor/trystero.js)
import * as Trystero from 'trystero';
globalThis.Trystero = Trystero;
