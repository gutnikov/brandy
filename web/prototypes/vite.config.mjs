// UI prototypes: one file per prototype in this folder, served by Vite.
// Run: pnpm proto (in web/)  →  http://localhost:6060/
// Set up and maintained by the ui-prototypes plugin for Claude Code; README.md
// next to this file lists the design system's components and how to use them.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const settings = {
  title: 'brandy prototypes',
  port: 6060,
  // Imported once, before any prototype: the global styles the app imports. The app has none yet (styling is
  // separate work); add its stylesheet here when it gets one.
  styles: [],
  // Wraps every prototype the way the app wraps its screens: providers for the
  // theme, translations, data. null for none, or
  // { module: '../src/providers.tsx', export: 'Providers' }.
  // The app's own providers (TanStack Query, the router) are not needed: a prototype makes no API calls, and Base UI
  // needs no provider.
  frame: null,
  // What a prototype may import, besides files in this folder. An entry also
  // allows its subpaths: 'react' allows 'react/jsx-runtime'.
  allow: ['react', '@base-ui/react'],
};

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: here,
  plugins: [react(), prototypes(settings)],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: settings.port, open: false },
  clearScreen: false,
};

// The prototypes runtime. Nothing below needs editing.
function prototypes({ title, styles, frame, allow }) {
  // Not .jsx: the React plugin would add refresh code that imports this file from disk, where it does not exist.
  const entry = join(here, '__prototypes_entry__.mjs');
  // A file in this folder, except _frame.*, which wraps prototypes in the app's providers and may import them.
  const isPrototype = (id) => {
    const file = id?.split('?')[0];
    const name = file?.startsWith(here) ? file.slice(here.length) : '';
    return /^[^/]+\.[jt]sx?$/.test(name) && !name.startsWith('_frame.');
  };
  const isBare = (source) => !/^[./\0]/.test(source) && !source.startsWith('virtual:') && !/^[a-z]+:/i.test(source);
  const allowed = (source) => allow.some((name) => source === name || source.startsWith(`${name}/`));

  const code = `
import { Component, createElement as h, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
${styles.map((style) => `import ${JSON.stringify(style)};`).join('\n')}
${frame
  ? `import { ${frame.export} as Frame } from ${JSON.stringify(frame.module)};`
  : 'const Frame = ({ children }) => children;'}

const modules = import.meta.glob(['./*.tsx', './*.jsx', '!./_*']);
const names = Object.keys(modules).map((path) => path.slice(2).replace(/\\.[jt]sx$/, '')).sort();
const name = decodeURIComponent(location.pathname.replace(/^\\/+|\\/+$/g, ''));
const root = createRoot(document.getElementById('root'));
const render = (node) => root.render(h(StrictMode, null, node));
const box = { fontFamily: 'system-ui, sans-serif', padding: 32, lineHeight: 1.6 };

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return h('pre', { style: { ...box, color: '#b00020', whiteSpace: 'pre-wrap' } },
      String(this.state.error.stack || this.state.error));
  }
}

const list = (heading) => h('div', { style: box },
  h('h1', { style: { fontSize: 20, margin: '0 0 12px' } }, heading),
  names.length === 0
    ? h('p', null, 'No prototypes yet.')
    : h('ul', null, names.map((n) => h('li', { key: n }, h('a', { href: '/' + n }, n)))));

if (!name) {
  document.title = ${JSON.stringify(title)};
  render(list(${JSON.stringify(title)}));
} else if (!names.includes(name)) {
  render(list('No prototype "' + name + '". These exist:'));
} else {
  document.title = name + ' · ' + ${JSON.stringify(title)};
  const path = Object.keys(modules).find((p) => p.slice(2).replace(/\\.[jt]sx$/, '') === name);
  modules[path]().then(
    (module) => render(h(Boundary, null, h(Frame, null, h(module.default)))),
    (error) => render(h(Boundary, null, h(() => { throw error; }))),
  );
}
`;

  const page = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title></head>
  <body><div id="root"></div><script type="module" src="/__prototypes_entry__.mjs"></script></body>
</html>`;

  return {
    name: 'ui-prototypes',
    resolveId(source, importer) {
      if (source === '/__prototypes_entry__.mjs') return entry;
      if (importer && isPrototype(importer) && isBare(source) && !allowed(source)) {
        this.error(`a prototype may import only ${allow.join(', ')} and files in this folder, not "${source}"`);
      }
      return null;
    },
    load(id) {
      return id === entry ? code : null;
    },
    // Before Vite's own middlewares: Vite takes a path without an extension, such as
    // /invoice-list, for a module request and would answer it with JavaScript.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '/').split('?')[0];
        const wantsPage = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
        if (!wantsPage || path.startsWith('/@') || /\.[a-z0-9]+$/i.test(path)) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await server.transformIndexHtml(path, page));
      });
    },
  };
}
