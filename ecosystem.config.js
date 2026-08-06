module.exports = {
  apps: [
    {
      // Windows-safe: runs Vite's JS entrypoint via node directly,
      // instead of spawning `npm`/`npm.cmd`, which pm2 on Windows
      // often can't attach logs to (shows "online" but no output).
      name: 'dashboard-dev',
      cwd: './apps/dashboard',
      script: './node_modules/vite/bin/vite.js',
      watch: false,
    },
    {
      name: 'overlay-dev',
      cwd: './apps/overlay',
      script: './node_modules/vite/bin/vite.js',
      args: '--port 5174',
      watch: false,
    },
  ],
};
