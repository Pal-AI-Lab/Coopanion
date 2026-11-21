// Runs with the installed Electron executable in Node mode.
const { fork } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const [app, data] = process.argv.slice(2).map((path) => resolve(path));
const home = join(data, 'home');
const deploy = join(home, 'companion');
mkdirSync(deploy, { recursive: true });
writeFileSync(join(deploy, 'config.json'), JSON.stringify({ companion: { telemetry: false, autoUpdate: false } }));

const core = fork(join(app, 'core', 'boot.ts'), [], {
  cwd: app,
  execArgv: ['--import', 'tsx'],
  env: {
    ...process.env,
    CORTICO_HOME: home,
    CORTICO_EXTENSIONS_DIR: join(data, 'extensions'),
    CORTICO_SUPERVISED: '1',
  },
});
let ready = false;
const deadline = setTimeout(() => {
  console.error('Timed out starting or stopping the installed Core');
  core.kill();
}, 30_000);
core.on('message', (message) => {
  if (message.type === 'companion:ready' && message.port > 0) {
    ready = true;
    core.send({ type: 'companion:shutdown' });
  }
});
core.on('exit', (code) => {
  clearTimeout(deadline);
  if (ready && code === 0) console.log('The installed Core started and shut down');
  else {
    console.error('The installed Core exited with code', code, 'after reporting ready:', ready);
    process.exitCode = 1;
  }
});
