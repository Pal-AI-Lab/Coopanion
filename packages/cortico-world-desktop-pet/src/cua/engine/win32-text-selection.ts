/** UI Automation reports whether the focused selection accepts text, including for controls
 * without a child HWND. Only the selection's read-only attribute and focus are queried. */
import koffi from 'koffi';

const ptrSize = koffi.sizeof('void *');

// Slots in the Windows SDK's UIAutomationClient.h. All interfaces start with IUnknown.
function method(slot: number, signature: string) {
  const type = koffi.proto(signature);
  return (self: unknown, ...args: unknown[]) => {
    const table = koffi.decode(self, 'void *');
    return koffi.call(koffi.decode(table, slot * ptrSize, 'void *'), type, self, ...args);
  };
}
const release = method(2, 'uint32_t __stdcall Release(void *)');
const focusedElement = method(8, 'long __stdcall GetFocusedElement(void *, _Out_ void **)');
const connectionTimeout = method(61, 'long __stdcall SetConnectionTimeout(void *, uint32_t)');
const transactionTimeout = method(63, 'long __stdcall SetTransactionTimeout(void *, uint32_t)');
const patternAs = method(14, 'long __stdcall GetCurrentPatternAs(void *, int, void *, _Out_ void **)');
const processId = method(20, 'long __stdcall CurrentProcessId(void *, _Out_ int *)');
const hasFocus = method(26, 'long __stdcall CurrentHasKeyboardFocus(void *, _Out_ int *)');
const isPassword = method(35, 'long __stdcall CurrentIsPassword(void *, _Out_ int *)');
const selection = method(5, 'long __stdcall GetSelection(void *, _Out_ void **)');
const length = method(3, 'long __stdcall RangeCount(void *, _Out_ int *)');
const rangeAt = method(4, 'long __stdcall RangeAt(void *, int, _Out_ void **)');
const attribute = method(9, 'long __stdcall GetAttributeValue(void *, int, void *)');

const ole = koffi.load('ole32.dll');
const initialize = ole.func('long __stdcall CoInitializeEx(void *, uint32_t)');
const uninitialize = ole.func('void __stdcall CoUninitialize()');
const create = ole.func('long __stdcall CoCreateInstance(void *, void *, uint32_t, void *, _Out_ void **)');
const parseGuid = ole.func('long __stdcall CLSIDFromString(str16 text, void *guid)');
const clearVariant = koffi.load('oleaut32.dll').func('long __stdcall VariantClear(void *)');
function guid(text: string): Buffer {
  const buf = Buffer.alloc(16);
  parseGuid(text, buf);
  return buf;
}
const textPattern = guid('{32EBA289-3583-42C9-9C59-3B6D9A1E9B6A}');
let client: unknown;

function automation() {
  if (client !== undefined) return client;
  client = null;
  if (initialize(null, 0) < 0) return null;
  const out = [null];
  if (create(guid('{E22AD333-B25F-460C-83D0-0581107395C9}'), null, 1, guid('{34723AFF-0C9D-49D0-9896-7AB52DF8CD8A}'), out) >= 0 && out[0]) {
    client = out[0];
    connectionTimeout(client, 300);
    transactionTimeout(client, 300);
  }
  process.once('exit', () => { if (client) release(client); uninitialize(); });
  return client;
}

export interface FocusedSelection { focused(): boolean; close(): void }

export function writableSelection(pid: number): FocusedSelection | undefined {
  const uia = automation();
  const element = [null], pattern = [null], ranges = [null], range = [null];
  if (!uia || focusedElement(uia, element) < 0 || !element[0]) return;
  const target = element[0];
  let retained = false;
  try {
    const owner = [0], password = [0], count = [0];
    const focused = () => {
      const flag = [0];
      return hasFocus(target, flag) === 0 && flag[0] !== 0;
    };
    if (processId(target, owner) !== 0 || owner[0] !== pid || !focused() || isPassword(target, password) !== 0 || password[0] !== 0) return;
    if (patternAs(target, 10014, textPattern, pattern) !== 0 || !pattern[0]) return;
    if (selection(pattern[0], ranges) !== 0 || !ranges[0] || length(ranges[0], count) !== 0 || count[0] !== 1) return;
    if (rangeAt(ranges[0], 0, range) !== 0 || !range[0]) return;
    const value = Buffer.alloc(ptrSize === 8 ? 24 : 16); // VARIANT
    try {
      // UIA_IsReadOnlyAttributeId must be explicitly VARIANT_FALSE (VT_BOOL).
      if (attribute(range[0], 40015, value) !== 0 || value.readUInt16LE(0) !== 11 || value.readInt16LE(8) !== 0) return;
    } finally { clearVariant(value); }
    retained = true;
    return { focused, close: () => release(target) };
  } finally {
    for (const ptr of [range[0], ranges[0], pattern[0]]) if (ptr) release(ptr);
    if (!retained) release(target);
  }
}
