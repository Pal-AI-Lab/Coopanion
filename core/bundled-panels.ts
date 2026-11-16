/**
 * Panel bundles of the World packages bundled with the app, and of the coopanion World in core/.
 * They are assembled as definitions, so the extension loader never reads their
 * `cortico.webUiClient`; these entries join the extension asset table, which is where the WebUI
 * server serves page bundles from.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionPackageFile } from 'cortico/extensions.ts';
import { parseExtensionManifest, type ExtensionWebUiAsset, type ExtensionPackageJson } from 'cortico/extensions/manifest.ts';
import { pageIdFor } from 'cortico/web/shared/webui-protocol.ts';
import { readTextFile } from 'cortico/core/util.ts';

const NODE_MODULES = fileURLToPath(new URL('../node_modules/', import.meta.url));

export function bundledWebUiAssets(worlds: ReadonlyArray<{ id: string; packageName: string }>): ExtensionWebUiAsset[] {
  const out: ExtensionWebUiAsset[] = [];
  for (const { id, packageName } of worlds) {
    const dir = join(NODE_MODULES, packageName);
    const pkg = JSON.parse(readTextFile(join(dir, 'package.json'))) as ExtensionPackageJson & { version: string };
    const parsed = parseExtensionManifest(pkg);
    if (!parsed.ok || parsed.manifest.webUiClient === undefined) continue;
    // a missing file leaves the page without a bundle; the WebUI manifest names the page and the fix
    const jsFile = extensionPackageFile(dir, parsed.manifest.webUiClient);
    if (!jsFile) continue;
    const cssFile = parsed.manifest.webUiStyle === undefined ? null : extensionPackageFile(dir, parsed.manifest.webUiStyle);
    out.push(asset(pageIdFor('world', id), packageName, pkg.version, jsFile, cssFile));
  }
  return out;
}

/**
 * The panel bundle of a World in core/, `webui.js` and `webui.css` in `dir` as scripts/stage.ts
 * builds them; none when the bundle is not built. `version` with the bundle's hash names its URL.
 */
export function appWebUiAsset(id: string, dir: string, version: string): ExtensionWebUiAsset[] {
  const jsFile = join(dir, 'webui.js');
  if (!existsSync(jsFile)) return [];
  const cssFile = join(dir, 'webui.css');
  return [asset(pageIdFor('world', id), id, version, jsFile, existsSync(cssFile) ? cssFile : null)];
}

/**
 * One asset table entry. The server sends the bytes read here until the process restarts; the
 * browser caches them by URL for a year, so the version carries the bundle's hash.
 */
function asset(pageId: string, packageName: string, version: string, jsFile: string, cssFile: string | null): ExtensionWebUiAsset {
  const jsBytes = readFileSync(jsFile);
  const cssBytes = cssFile ? readFileSync(cssFile) : null;
  const hash = createHash('sha256').update(jsBytes);
  if (cssBytes) hash.update(cssBytes);
  return {
    pageId, packageName, version: `${version}-${hash.digest('hex').slice(0, 10)}`, jsFile, jsBytes,
    ...(cssFile && cssBytes ? { cssFile, cssBytes } : {}),
  };
}
