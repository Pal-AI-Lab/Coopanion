# The Google TV remote's voice key as a line protocol, started by src/vokie/remote.ts.
# Read-only: it registers a Raw Input sink for the remote's HID collections and never
# writes to the device, installs anything, or shows a window.
#
# Arguments (also read from the environment, which is how a -EncodedCommand start passes
# them): -VendorId / -ProductId match the HID device, 0 means the Google TV remote
# (18d1:9450); -Seconds bounds a manual run, 0 means until the process is killed.
# Environment names: PET_REMOTE_VENDOR_ID, PET_REMOTE_PRODUCT_ID, PET_REMOTE_SECONDS.
#
# stdout, one JSON line each, non-ASCII escaped as \uXXXX so no console code page can
# garble it:
#   {"t":"hello","vid":6353,"pid":37968,"usages":[{"page":12,"usage":233,"name":"consumer"}]}
#     once per matched device: its button usages, as the HID report declares them.
#   {"t":"key","page":12,"usage":233,"down":true,"ts":1730000000123,"raw":"01 04 00"}
#     one line per pressed or released usage edge; `raw` is the input report it came from.
#   {"t":"error","code":"no-device"}  (also `register-failed`, `open-failed`, `decode-failed`)
#     a handled failure; the listener keeps running except after `register-failed`.
#
# The decoder uses HidP_GetUsages on each report rather than guessing bit positions, so a
# firmware or descriptor change does not need a new mapping here.
param(
  [int]$Seconds = 0,
  [int]$VendorId = 0,
  [int]$ProductId = 0
)

$ErrorActionPreference = 'Stop'
# module loading would otherwise write progress records to stderr
$ProgressPreference = 'SilentlyContinue'

if ($VendorId -le 0) { $VendorId = if ($env:PET_REMOTE_VENDOR_ID) { [int]$env:PET_REMOTE_VENDOR_ID } else { 0x18d1 } }
if ($ProductId -le 0) { $ProductId = if ($env:PET_REMOTE_PRODUCT_ID) { [int]$env:PET_REMOTE_PRODUCT_ID } else { 0x9450 } }
if ($Seconds -le 0 -and $env:PET_REMOTE_SECONDS) { $Seconds = [int]$env:PET_REMOTE_SECONDS }

Add-Type -AssemblyName System.Windows.Forms | Out-Null

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public class PetRemoteForm : Form
{
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICE { public ushort usUsagePage; public ushort usUsage; public uint dwFlags; public IntPtr hwndTarget; }
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICELIST { public IntPtr hDevice; public uint dwType; }
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTHEADER { public uint dwType; public uint dwSize; public IntPtr hDevice; public IntPtr wParam; }
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWMOUSE { public ushort usFlags; public ushort pad; public uint ulButtons; public uint ulRawButtons; public int lLastX; public int lLastY; public uint ulExtraInformation; }
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWKEYBOARD { public ushort MakeCode; public ushort Flags; public ushort Reserved; public ushort VKey; public uint Message; public uint ExtraInformation; }
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWHID { public uint dwSizeHid; public uint dwCount; public IntPtr bRawData; }
    [StructLayout(LayoutKind.Explicit)]
    private struct RAWINPUTUNION
    {
        [FieldOffset(0)] public RAWMOUSE mouse;
        [FieldOffset(0)] public RAWKEYBOARD keyboard;
        [FieldOffset(0)] public RAWHID hid;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUT { public RAWINPUTHEADER header; public RAWINPUTUNION data; }

    // cbSize must be sizeof(RID_DEVICE_INFO) (32 on x64: the keyboard arm is the widest union member).
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct RID_DEVICE_INFO
    {
        public uint cbSize; public uint dwType;
        public uint dwVendorId; public uint dwProductId; public uint dwVersionNumber;
        public ushort usUsagePage; public ushort usUsage;
        public uint pad1; public uint pad2;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HIDP_CAPS
    {
        public ushort Usage; public ushort UsagePage;
        public ushort InputReportByteLength; public ushort OutputReportByteLength; public ushort FeatureReportByteLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
        public ushort NumberLinkCollectionNodes;
        public ushort NumberInputButtonCaps; public ushort NumberInputValueCaps; public ushort NumberInputDataIndices;
        public ushort NumberOutputButtonCaps; public ushort NumberOutputValueCaps; public ushort NumberOutputDataIndices;
        public ushort NumberFeatureButtonCaps; public ushort NumberFeatureValueCaps; public ushort NumberFeatureDataIndices;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HIDP_BUTTON_CAPS
    {
        public ushort UsagePage; public byte ReportID; public byte IsAlias;
        public ushort BitField; public ushort LinkCollection; public ushort LinkUsage; public ushort LinkUsagePage;
        public byte IsRange; public byte IsStringRange; public byte IsDesignatorRange; public byte IsAbsolute;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 10)] public uint[] Reserved;
        public ushort UsageMin, UsageMax, StringMin, StringMax, DesignatorMin, DesignatorMax, DataIndexMin, DataIndexMax;
    }

    [DllImport("user32.dll")] private static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] p, uint n, uint size);
    [DllImport("user32.dll")] private static extern uint GetRawInputData(IntPtr hRawInput, uint cmd, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);
    [DllImport("user32.dll")] private static extern uint GetRawInputDeviceList(IntPtr pRawInputDeviceList, ref uint puiNumDevices, uint cbSize);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint GetRawInputDeviceInfoW(IntPtr hDevice, uint uiCommand, IntPtr pData, ref uint pcbSize);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr h);
    [DllImport("hid.dll", SetLastError = true)] private static extern bool HidD_GetPreparsedData(IntPtr h, out IntPtr preparsed);
    [DllImport("hid.dll")] private static extern bool HidD_FreePreparsedData(IntPtr preparsed);
    [DllImport("hid.dll")] private static extern int HidP_GetCaps(IntPtr preparsed, ref HIDP_CAPS caps);
    [DllImport("hid.dll")] private static extern int HidP_GetButtonCaps(int reportType, IntPtr caps, ref ushort length, IntPtr preparsed);
    [DllImport("hid.dll")] private static extern uint HidP_MaxUsageListLength(int reportType, ushort usagePage, IntPtr preparsed);
    [DllImport("hid.dll")] private static extern int HidP_GetUsages(int reportType, ushort usagePage, ushort linkCollection, ushort[] list, ref uint length, IntPtr preparsed, byte[] report, uint reportLength);

    private const uint WM_INPUT = 0x00FF;
    private const uint RID_INPUT = 0x10000003;
    private const uint RIDI_DEVICEINFO = 0x2000000b;
    private const uint RIDI_DEVICENAME = 0x20000007;
    private const uint RIDEV_INPUTSINK = 0x00000100;
    private const uint FILE_SHARE_RW = 3;
    private const uint OPEN_EXISTING = 3;
    private const uint GENERIC_READ = 0x80000000;
    private const int RIM_TYPEHID = 2;
    private const int HIDP_INPUT = 0;
    private const int HIDP_STATUS_SUCCESS = 0x00110000;
    /** Hello lists at most this many declared usages, so a keyboard-sized range stays short. */
    private const int MAX_DECLARED = 64;

    private class Combo
    {
        public ushort Page;
        public ushort Link;
        public ushort[] Buffer;
    }

    private class Device
    {
        public bool Matches;
        public bool Helloed;
        public string Name;
        public IntPtr Preparsed = IntPtr.Zero;
        public int ReportLength;
        public List<Combo> Combos = new List<Combo>();
        public List<int> Declared = new List<int>();
    }

    public int VendorId = 0x18d1;
    public int ProductId = 0x9450;

    private readonly object outLock = new object();
    private readonly Dictionary<IntPtr, Device> devices = new Dictionary<IntPtr, Device>();
    private readonly HashSet<string> reported = new HashSet<string>();
    private HashSet<int> pressed = new HashSet<int>();
    private bool anyMatch = false;
    private bool noDeviceReported = false;

    /** Registers the sink and announces the remote if it is already present. False if the sink could not be registered. */
    public bool Start()
    {
        this.Text = "pet-remote";
        this.ShowInTaskbar = false;
        this.WindowState = FormWindowState.Minimized;
        this.Opacity = 0;
        this.CreateControl();
        IntPtr hwnd = this.Handle;
        RAWINPUTDEVICE[] regs = new RAWINPUTDEVICE[2];
        regs[0].usUsagePage = 0x01; regs[0].usUsage = 0x06; regs[0].dwFlags = RIDEV_INPUTSINK; regs[0].hwndTarget = hwnd;
        regs[1].usUsagePage = 0x0C; regs[1].usUsage = 0x01; regs[1].dwFlags = RIDEV_INPUTSINK; regs[1].hwndTarget = hwnd;
        if (!RegisterRawInputDevices(regs, 2, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))))
        {
            EmitError("register-failed");
            return false;
        }
        PollDevices();
        return true;
    }

    /** Retries the device enumeration until a matching device is found; harmless once one was. */
    public void PollDevices()
    {
        if (anyMatch) return;
        uint count = 0;
        uint stride = (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICELIST));
        GetRawInputDeviceList(IntPtr.Zero, ref count, stride);
        if (count > 0)
        {
            IntPtr list = Marshal.AllocHGlobal((int)(count * stride));
            try
            {
                uint got = count;
                if (GetRawInputDeviceList(list, ref got, stride) != uint.MaxValue) count = got;
                for (uint i = 0; i < count && !anyMatch; i++)
                {
                    RAWINPUTDEVICELIST e = (RAWINPUTDEVICELIST)Marshal.PtrToStructure(new IntPtr(list.ToInt64() + (long)i * stride), typeof(RAWINPUTDEVICELIST));
                    if (e.dwType == RIM_TYPEHID) GetDevice(e.hDevice);
                }
            }
            finally { Marshal.FreeHGlobal(list); }
        }
        if (!anyMatch && !noDeviceReported)
        {
            noDeviceReported = true;
            EmitError("no-device");
        }
    }

    /** Drops the last report of a device that went away, so its stale pressed set cannot leak into the next one. */
    public void Forget()
    {
        pressed.Clear();
    }

    private Device GetDevice(IntPtr hDevice)
    {
        Device d;
        if (devices.TryGetValue(hDevice, out d)) return d;
        d = new Device();
        devices[hDevice] = d;
        RID_DEVICE_INFO info;
        if (!QueryInfo(hDevice, out info) || info.dwType != RIM_TYPEHID) return d;
        d.Matches = info.dwVendorId == (uint)VendorId && info.dwProductId == (uint)ProductId;
        if (!d.Matches) return d;
        d.Name = DeviceName(hDevice);
        if (d.Name == null || !Open(d))
        {
            // the device matched but its reports cannot be decoded; a later one may work
            PressedReset();
            EmitError("open-failed");
            return d;
        }
        EmitHello(d, (int)info.dwVendorId, (int)info.dwProductId);
        PressedReset();
        anyMatch = true;
        return d;
    }

    private bool QueryInfo(IntPtr hDevice, out RID_DEVICE_INFO info)
    {
        info = new RID_DEVICE_INFO();
        int size = Marshal.SizeOf(typeof(RID_DEVICE_INFO));
        IntPtr buf = Marshal.AllocHGlobal(size);
        try
        {
            RID_DEVICE_INFO blank = new RID_DEVICE_INFO();
            blank.cbSize = (uint)size;
            Marshal.StructureToPtr(blank, buf, false);
            uint len = (uint)size;
            if (GetRawInputDeviceInfoW(hDevice, RIDI_DEVICEINFO, buf, ref len) == uint.MaxValue) return false;
            info = (RID_DEVICE_INFO)Marshal.PtrToStructure(buf, typeof(RID_DEVICE_INFO));
            return true;
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    private static string DeviceName(IntPtr hDevice)
    {
        uint size = 0;
        GetRawInputDeviceInfoW(hDevice, RIDI_DEVICENAME, IntPtr.Zero, ref size);
        if (size == 0) return null;
        IntPtr buf = Marshal.AllocHGlobal((int)size * 2);
        try
        {
            uint chars = size;
            if (GetRawInputDeviceInfoW(hDevice, RIDI_DEVICENAME, buf, ref chars) == uint.MaxValue) return null;
            return Marshal.PtrToStringUni(buf);
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    private bool Open(Device d)
    {
        IntPtr file = CreateFileW(d.Name, GENERIC_READ, FILE_SHARE_RW, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
        if (file == new IntPtr(-1)) return false;
        try
        {
            IntPtr preparsed;
            if (!HidD_GetPreparsedData(file, out preparsed)) return false;
            d.Preparsed = preparsed;
            HIDP_CAPS caps = new HIDP_CAPS();
            caps.Reserved = new ushort[17];
            if (HidP_GetCaps(preparsed, ref caps) != HIDP_STATUS_SUCCESS) return false;
            d.ReportLength = caps.InputReportByteLength;
            if (caps.NumberInputButtonCaps == 0) return true;

            int stride = Marshal.SizeOf(typeof(HIDP_BUTTON_CAPS));
            IntPtr capBuf = Marshal.AllocHGlobal(stride * caps.NumberInputButtonCaps);
            try
            {
                ushort capLen = caps.NumberInputButtonCaps;
                if (HidP_GetButtonCaps(HIDP_INPUT, capBuf, ref capLen, preparsed) != HIDP_STATUS_SUCCESS) return true;
                for (int i = 0; i < capLen; i++)
                {
                    HIDP_BUTTON_CAPS b = (HIDP_BUTTON_CAPS)Marshal.PtrToStructure(new IntPtr(capBuf.ToInt64() + (long)i * stride), typeof(HIDP_BUTTON_CAPS));
                    AddCombo(d, b.UsagePage, b.LinkCollection);
                    if (d.Declared.Count < MAX_DECLARED)
                    {
                        int first = b.IsRange != 0 ? b.UsageMin : b.UsageMin;
                        int last = b.IsRange != 0 ? b.UsageMax : b.UsageMin;
                        for (int u = first; u <= last && d.Declared.Count < MAX_DECLARED; u++) d.Declared.Add((b.UsagePage << 16) | u);
                    }
                }
            }
            finally { Marshal.FreeHGlobal(capBuf); }
            return true;
        }
        finally { CloseHandle(file); }
    }

    private void AddCombo(Device d, ushort page, ushort link)
    {
        foreach (Combo c in d.Combos) if (c.Page == page && c.Link == link) return;
        uint max = HidP_MaxUsageListLength(HIDP_INPUT, page, d.Preparsed);
        if (max == 0) return;
        Combo combo = new Combo();
        combo.Page = page;
        combo.Link = link;
        combo.Buffer = new ushort[max];
        d.Combos.Add(combo);
    }

    private void EmitHello(Device d, int vid, int pid)
    {
        d.Helloed = true;
        StringBuilder sb = new StringBuilder();
        sb.Append("{\"t\":\"hello\",\"vid\":").Append(vid).Append(",\"pid\":").Append(pid).Append(",\"usages\":[");
        for (int i = 0; i < d.Declared.Count; i++)
        {
            if (i > 0) sb.Append(',');
            int page = (d.Declared[i] >> 16) & 0xFFFF;
            int usage = d.Declared[i] & 0xFFFF;
            sb.Append("{\"page\":").Append(page).Append(",\"usage\":").Append(usage).Append(",\"name\":").Append(Json(PageName(page))).Append('}');
        }
        sb.Append("]}");
        Emit(sb.ToString());
    }

    private void PressedReset()
    {
        pressed = new HashSet<int>();
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == (int)WM_INPUT)
        {
            try { HandleReport(m.LParam); }
            catch (Exception err) { Fail("decode-failed", err.Message); }
        }
        base.WndProc(ref m);
    }

    private void HandleReport(IntPtr hRawInput)
    {
        uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
        uint size = 0;
        GetRawInputData(hRawInput, RID_INPUT, IntPtr.Zero, ref size, headerSize);
        if (size == 0) return;
        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try
        {
            uint got = GetRawInputData(hRawInput, RID_INPUT, buf, ref size, headerSize);
            if (got != size) return;
            RAWINPUT raw = (RAWINPUT)Marshal.PtrToStructure(buf, typeof(RAWINPUT));
            if (raw.header.dwType != RIM_TYPEHID) return;
            Device d = GetDevice(raw.header.hDevice);
            if (!d.Matches || d.Preparsed == IntPtr.Zero) return;
            Decode(d, raw.data.hid.bRawData, raw.data.hid.dwSizeHid, raw.data.hid.dwCount);
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    private void Decode(Device d, IntPtr rawData, uint sizeHid, uint count)
    {
        if (sizeHid == 0 || count == 0) return;
        long ts = NowMs();
        for (uint i = 0; i < count; i++)
        {
            byte[] raw = new byte[sizeHid];
            Marshal.Copy(new IntPtr(rawData.ToInt64() + (long)i * sizeHid), raw, 0, (int)sizeHid);
            int len = d.ReportLength > 0 ? d.ReportLength : (int)sizeHid;
            byte[] report = new byte[len];
            Array.Copy(raw, report, Math.Min(len, raw.Length));
            DecodeReport(d, report, raw, ts);
        }
    }

    private void DecodeReport(Device d, byte[] report, byte[] raw, long ts)
    {
        HashSet<int> now = new HashSet<int>();
        foreach (Combo c in d.Combos)
        {
            uint len = (uint)c.Buffer.Length;
            if (HidP_GetUsages(HIDP_INPUT, c.Page, c.Link, c.Buffer, ref len, d.Preparsed, report, (uint)report.Length) != HIDP_STATUS_SUCCESS) continue;
            for (uint k = 0; k < len; k++) now.Add(((int)c.Page << 16) | (int)c.Buffer[k]);
        }
        if (now.Count == 0 && pressed.Count == 0) return;
        foreach (int key in pressed) if (!now.Contains(key)) EmitKey(key, false, raw, ts);
        foreach (int key in now) if (!pressed.Contains(key)) EmitKey(key, true, raw, ts);
        pressed = now;
    }

    private void EmitKey(int key, bool down, byte[] raw, long ts)
    {
        int page = (key >> 16) & 0xFFFF;
        int usage = key & 0xFFFF;
        string line = "{\"t\":\"key\",\"page\":" + page + ",\"usage\":" + usage
            + ",\"down\":" + (down ? "true" : "false") + ",\"ts\":" + ts + ",\"raw\":" + Json(Hex(raw)) + "}";
        Emit(line);
    }

    private void Fail(string code, string message)
    {
        lock (outLock)
        {
            if (reported.Add(code)) EmitError(code);
        }
        if (!string.IsNullOrEmpty(message)) Console.Error.WriteLine(message);
        PressedReset();
    }

    private void EmitError(string code)
    {
        Emit("{\"t\":\"error\",\"code\":" + Json(code) + "}");
    }

    private void Emit(string line)
    {
        lock (outLock)
        {
            Console.Out.WriteLine(line);
            Console.Out.Flush();
        }
    }

    private static long NowMs()
    {
        return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
    }

    private static string Hex(byte[] bytes)
    {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bytes.Length; i++)
        {
            if (i > 0) sb.Append(' ');
            sb.Append(bytes[i].ToString("x2"));
        }
        return sb.ToString();
    }

    private static string PageName(int page)
    {
        if (page == 0x01) return "keyboard";
        if (page == 0x02) return "mouse";
        if (page == 0x07) return "keypad";
        if (page == 0x0C) return "consumer";
        if (page == 0x0D) return "digitizer";
        if (page >= 0xFF00) return "vendor";
        return "other";
    }

    /** ASCII-only JSON string: outside 32..126 becomes \\uXXXX, like the SAPI helper's output. */
    private static string Json(string value)
    {
        StringBuilder sb = new StringBuilder("\"");
        foreach (char c in value ?? "")
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 32 || c > 126) sb.AppendFormat("\\u{0:x4}", (int)c);
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }
}
'@ -ReferencedAssemblies System.Windows.Forms, System.Drawing | Out-Null

$form = New-Object PetRemoteForm
$form.VendorId = $VendorId
$form.ProductId = $ProductId

try {
  if (-not $form.Start()) { exit 1 }
  $deadline = if ($Seconds -gt 0) { (Get-Date).AddSeconds($Seconds) } else { $null }
  $refreshed = Get-Date
  while ($true) {
    if ($null -ne $deadline -and (Get-Date) -ge $deadline) { break }
    [System.Windows.Forms.Application]::DoEvents()
    if (((Get-Date) - $refreshed).TotalSeconds -ge 2) {
      $refreshed = Get-Date
      $form.PollDevices()
    }
    Start-Sleep -Milliseconds 20
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  $form.Forget()
  $form.Dispose()
}
exit 0
