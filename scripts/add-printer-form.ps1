# Add a custom paper size (form) to a printer: "Bazarey80mmRoll" = 80mm wide, 200mm tall
# Idempotent — if the form already exists, returns without error.
param(
    [string]$PrinterName = "Xprinter XP-350BM",
    [string]$FormName = "Bazarey80mmRoll",
    [int]$WidthMm = 80,
    [int]$HeightMm = 200
)

# Convert mm to 0.001 inch units used by the form API (1 mm = 0.0393701 inch)
$widthUnits = [int]($WidthMm * 39.3701)
$heightUnits = [int]($HeightMm * 39.3701)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinSpool {
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern int SetForm(
        IntPtr hPrinter,
        [MarshalAs(UnmanagedType.LPWStr)] string pFormName,
        int Level,
        ref FORM_INFO_1 pFormInfo
    );
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern int AddForm(
        IntPtr hPrinter,
        int Level,
        ref FORM_INFO_1 pFormInfo
    );
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern int OpenPrinter(
        [MarshalAs(UnmanagedType.LPWStr)] string pPrinterName,
        out IntPtr phPrinter,
        IntPtr pDefault
    );
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern int ClosePrinter(IntPtr hPrinter);

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct FORM_INFO_1 {
        public uint Flags;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pName;
        public SIZEL Size;
        public RECTL ImageableArea;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct SIZEL {
        public int cx;
        public int cy;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct RECTL {
        public int left, top, right, bottom;
    }
}
"@

$printerHandle = [IntPtr]::Zero
$res = [WinSpool]::OpenPrinter($PrinterName, [ref]$printerHandle, [IntPtr]::Zero)
if ($res -eq 0) {
    Write-Output "Failed to open printer: $PrinterName"
    exit 1
}

# FORM_INFO_1: Flags=0, Name, Size in 0.0001 inch units, ImageableArea
$formInfo = New-Object WinSpool+FORM_INFO_1
$formInfo.Flags = 0
$formInfo.pName = $FormName
$formInfo.Size = New-Object WinSpool+SIZEL
$formInfo.Size.cx = $widthUnits
$formInfo.Size.cy = $heightUnits
$formInfo.ImageableArea = New-Object WinSpool+RECTL
$formInfo.ImageableArea.left = 0
$formInfo.ImageableArea.top = 0
$formInfo.ImageableArea.right = $widthUnits
$formInfo.ImageableArea.bottom = $heightUnits

$res = [WinSpool]::AddForm($printerHandle, 1, [ref]$formInfo)
[WinSpool]::ClosePrinter($printerHandle) | Out-Null

if ($res -ne 0) {
    Write-Output "OK: Added form '$FormName' ($WidthMm mm x $HeightMm mm)"
    exit 0
} else {
    # May already exist — that's fine, not an error
    Write-Output "Form '$FormName' may already exist (errno=$([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
    exit 0
}