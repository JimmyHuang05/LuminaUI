$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression.FileSystem
$picker = New-Object Windows.Forms.FolderBrowserDialog
$picker.Description = 'Choose a parent folder for LuminaUI-Qwen21 (40 GB free recommended)'
$picker.SelectedPath = [Environment]::GetFolderPath('LocalApplicationData')
if ($picker.ShowDialog() -ne 'OK') { exit 0 }
$target = Join-Path $picker.SelectedPath 'LuminaUI-Qwen21'
[IO.Directory]::CreateDirectory($target) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $PSScriptRoot 'app.zip'))
try {
    foreach ($entry in $zip.Entries) {
        $file = [IO.Path]::GetFullPath((Join-Path $target $entry.FullName))
        if (!$file.StartsWith(($target + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid package path' }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$file,$true)
    }
} finally { $zip.Dispose() }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'LuminaUI Qwen 2.1.lnk'))
$shortcut.TargetPath = Join-Path $target 'start_desktop.bat'
$shortcut.WorkingDirectory = $target
$shortcut.IconLocation = Join-Path $target 'desktop/lumina.ico'
$shortcut.Save()
Start-Process (Join-Path $target 'start_desktop.bat') -WorkingDirectory $target
