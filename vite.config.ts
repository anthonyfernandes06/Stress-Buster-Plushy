import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * rapier3d-compat initialises its embedded WASM with the deprecated
 * positional wasm-bindgen signature, which logs a console warning on every
 * load. Rewrite that single call to the object form.
 */
function rapierInitFix(): Plugin {
  return {
    name: 'rapier-init-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('rapier3d-compat') || !id.endsWith('.mjs')) return null;
      const fixed = code.replace(/\byield\s+(\w+)\((\w+\.toByteArray\("[^"]*"\)(?:\.buffer)?)\)/, 'yield $1({module_or_path:$2})');
      return fixed === code ? null : { code: fixed, map: null };
    },
  };
}

export default defineConfig({
  // relative asset URLs: the same build works at a domain root or under a
  // sub-path such as GitHub Pages' /Stress-Buster-Plushy/
  base: './',
  plugins: [rapierInitFix(), react()],
  optimizeDeps: {
    // keep rapier out of the dep pre-bundle so the fix above also applies in dev
    exclude: ['@dimforge/rapier3d-compat'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
});
