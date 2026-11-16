/**
 * Coopanion runs on X11 on Linux, through XWayland in a Wayland session: on Wayland a window cannot place itself or
 * stay on top, and the cursor position outside the app's own windows is unknown, which the pet needs.
 *
 * Electron settles the display platform before the main script runs, and only the command line it starts with can
 * choose it, so a start that Electron put on Wayland starts over with the switch.
 */

/**
 * The command for that new start, or null when this start stays: Electron did not pick Wayland (`picked` is the value
 * of `ozone-platform` it settled on), the command line names a platform itself, or no X server is there to run on.
 * An AppImage starts from its own file, because `execPath` lies inside a mount that ends with this process.
 */
function x11RestartCommand({ platform, picked, argv, execPath, env }) {
  if (platform !== 'linux' || picked !== 'wayland' || !env.DISPLAY) return null;
  if (argv.some((arg) => arg.startsWith('--ozone-platform='))) return null;
  return { file: env.APPIMAGE || execPath, args: [...argv.slice(1), '--ozone-platform=x11'] };
}

module.exports = { x11RestartCommand };
