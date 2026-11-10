import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { x11RestartCommand } = require('../app/x11-restart.cjs');

const DEB = '/opt/Coopanion/coopanion';
const waylandStart = (over = {}) => ({
  platform: 'linux', picked: 'wayland', argv: [DEB, '--enable-logging=stderr'], execPath: DEB, env: { DISPLAY: ':0' }, ...over,
});

describe('starting over on X11', () => {
  it('runs the same program with the same switches when Electron picked Wayland', () => {
    expect(x11RestartCommand(waylandStart())).toEqual({ file: DEB, args: ['--enable-logging=stderr', '--ozone-platform=x11'] });
  });

  it('keeps the app path of a run from source', () => {
    const electron = '/repo/node_modules/electron/dist/electron';
    expect(x11RestartCommand(waylandStart({ argv: [electron, '.'], execPath: electron }))).toEqual({ file: electron, args: ['.', '--ozone-platform=x11'] });
  });

  it('starts an AppImage from its own file, outside the mount that ends with this process', () => {
    const inMount = '/tmp/.mount_CoopanXYZ/coopanion';
    const command = x11RestartCommand(waylandStart({ argv: [inMount], execPath: inMount, env: { DISPLAY: ':0', APPIMAGE: '/home/a/Coopanion.AppImage' } }));
    expect(command).toEqual({ file: '/home/a/Coopanion.AppImage', args: ['--ozone-platform=x11'] });
  });

  it('keeps a start Electron already put on X11, so the new start does not restart again', () => {
    const first = x11RestartCommand(waylandStart());
    expect(x11RestartCommand(waylandStart({ picked: 'x11', argv: [first.file, ...first.args] }))).toBeNull();
  });

  it('keeps a start whose command line names a platform', () => {
    expect(x11RestartCommand(waylandStart({ argv: [DEB, '--ozone-platform=wayland'] }))).toBeNull();
  });

  it('stays on Wayland when there is no X server to run on', () => {
    expect(x11RestartCommand(waylandStart({ env: {} }))).toBeNull();
  });

  it('leaves other systems alone', () => {
    expect(x11RestartCommand(waylandStart({ platform: 'darwin' }))).toBeNull();
  });
});
