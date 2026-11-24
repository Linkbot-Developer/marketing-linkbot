// PM2 config for the droplet. Started by the deploy workflow: pm2 startOrReload deploy/ecosystem.config.cjs
// Keys come from /srv/marketing-linkbot/.env (read by renderer/src/config.ts); the values here win over it.
const path = require('node:path');

const APP_DIR = path.resolve(__dirname, '..');
const HOME = process.env.HOME || '';

module.exports = {
  apps: [
    {
      name: 'linkbot-renderer',
      cwd: path.join(APP_DIR, 'renderer'),
      script: 'src/server.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      // one render at a time inside the service; a second process would only compete for CPU
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '2G',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        RENDERER_HOST: '127.0.0.1', // only Caddy (HTTPS) reaches it
        RENDERER_PORT: '8787',
        RENDERER_OUTPUT_DIR: path.join(APP_DIR, 'data', 'renderer-jobs'),
        // edge-tts is installed with pipx into ~/.local/bin
        PATH: `${HOME}/.local/bin:${process.env.PATH}`,
      },
    },
  ],
};
