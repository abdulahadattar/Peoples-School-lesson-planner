const { build } = require('esbuild');
const path = require('path');

build({
  entryPoints: [path.join(__dirname, '..', 'api', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: path.join(__dirname, '..', 'api', 'index.js'),
  logLevel: 'info',
}).catch(() => process.exit(1));
