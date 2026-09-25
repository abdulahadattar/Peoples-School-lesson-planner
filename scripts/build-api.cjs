const { build } = require('esbuild');
const path = require('path');

build({
  entryPoints: [path.join(__dirname, '..', 'services', 'apiHandler.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: path.join(__dirname, '..', 'api', '_bundle.cjs'),
  logLevel: 'info',
  allowOverwrite: true,
}).catch(() => process.exit(1));
