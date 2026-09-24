/**
 * The model connection as the home page handles it: which service the active endpoint is, and
 * connecting a service through the console's own routes (Coo Pet Provider's `connectVendor`, the
 * same the guide on the desktop uses). Only the provider package's browser-safe files are imported.
 */
import { get, post } from '../../core/api.ts';
import { connectVendor, testEndpoint, type ConnectResult, type ConsoleCall } from 'cortico-provider-coo/src/connect.ts';

export { VENDORS, vendorOf, type Vendor } from 'cortico-provider-coo/src/vendors.ts';
export { VENDOR_ICONS } from 'cortico-provider-coo/src/icons.ts';
export { connectVendor, testEndpoint, type ConnectResult };

export interface Status {
  loop?: { paused?: boolean };
  modelConnection?: { ready: boolean; name: string; model: string | null; moduleTitle: string; baseUrl?: string } | null;
}

/** The console's routes for `connect.ts`: GET without a body, POST with one. */
export const consoleCall = (signal?: AbortSignal): ConsoleCall =>
  (<T>(path: string, body?: unknown) => (body === undefined ? get<T>(path, { signal }) : post<T>(path, body, { signal }))) as ConsoleCall;

export const readStatus = (signal?: AbortSignal) => get<Status>('/api/status', { signal });
