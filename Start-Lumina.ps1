# First launch of the Windows NVIDIA distribution. No system Python is required.
[CmdletBinding()]
param([switch]$PrepareOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $root '.runtime'
$bundle = Join-Path $runtime 'v0.46.0'
$archiveHash = '6a5255c7ec01fdc54bdbd8e4507073cf6acda2fbeea74ae1829a50681af5fac6'
$archiveSize = 2085169944
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-VerifiedFile($Url, $Path, [long]$Size, $Hash) {
    $stamp = "$Path.verified"
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $item = Get-Item -LiteralPath $Path
        $identity = "$Hash $Size $($item.LastWriteTimeUtc.Ticks)"
        if ($item.Length -eq $Size) {
            if ((Test-Path $stamp) -and [IO.File]::ReadAllText($stamp) -eq $identity) { return }
            if ((Get-FileHash -LiteralPath $Path).Hash -eq $Hash) {
                [IO.File]::WriteAllText($stamp, $identity, $utf8)
                return
            }
        }
    }
    [IO.Directory]::CreateDirectory((Split-Path $Path)) | Out-Null
    $part = "$Path.part"
    $have = 0
    if (Test-Path $part) { $have = (Get-Item $part).Length }
    if ($have -gt $Size) { [IO.File]::Delete($part); $have = 0 }
    if ($have -lt $Size) {
        $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($Path))
        if ($drive.AvailableFreeSpace -lt ($Size - $have)) { throw "Insufficient disk space for $Path" }
        Write-Host "Downloading $(Split-Path $Path -Leaf) ($Size bytes)"
        & curl.exe --fail --location --retry 3 --connect-timeout 30 --speed-limit 1024 --speed-time 120 --progress-bar --continue-at - --output $part $Url
        if ($LASTEXITCODE -ne 0) { throw "Download interrupted. Open LuminaUI again to resume: $part" }
    }
    if ((Get-Item $part).Length -ne $Size -or (Get-FileHash -LiteralPath $part).Hash -ne $Hash) {
        [IO.File]::Delete($part)
        throw "Integrity check failed. Open LuminaUI again to retry: $Path"
    }
    if (Test-Path $Path) {
        [IO.File]::Replace($part,$Path,[System.Management.Automation.Language.NullString]::Value)
    } else { [IO.File]::Move($part,$Path) }
    [IO.File]::WriteAllText($stamp, "$Hash $Size $((Get-Item $Path).LastWriteTimeUtc.Ticks)", $utf8)
}

[IO.Directory]::CreateDirectory($runtime) | Out-Null
try {
    $lock = [IO.File]::Open((Join-Path $runtime 'startup.lock'),'OpenOrCreate','ReadWrite','None')
} catch [IO.IOException] {
    try { $info = Invoke-RestMethod 'http://127.0.0.1:18290/api/config' -TimeoutSec 2 } catch { $info = $null }
    if ($info.edition -eq 'qwen21' -and !$PrepareOnly -and !$NoBrowser) { Start-Process 'http://127.0.0.1:18290/workbench' }
    else { Write-Host 'LuminaUI is already preparing or running. Check its first launch window.' }
    exit 0
}
try {
    $python = Join-Path $bundle 'ComfyUI_windows_portable/python_embeded/python.exe'
    if (!(Test-Path $python)) {
        $archive = Join-Path $runtime 'downloads/comfy-v0.46.0.7z'
        Get-VerifiedFile 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.46.0/ComfyUI_windows_portable_nvidia.7z' $archive $archiveSize $archiveHash
        $stage = Join-Path $runtime 'extract-v0.46.0'
        [IO.Directory]::CreateDirectory($stage) | Out-Null
        Write-Host 'Preparing Python, PyTorch and ComfyUI...'
        & tar.exe -xf $archive -C $stage
        if ($LASTEXITCODE -ne 0 -or !(Test-Path "$stage/ComfyUI_windows_portable/ComfyUI/main.py")) { throw 'Runtime extraction failed. Check free space and retry.' }
        [IO.Directory]::Move($stage,$bundle)
    }
    & $python -s -c "import torch; assert torch.cuda.is_available(), 'CUDA unavailable. Check the NVIDIA driver.'; print(torch.cuda.get_device_name())"
    if ($LASTEXITCODE -ne 0) { throw 'CUDA runtime check failed.' }
    & $python -s -c 'import aiohttp, PIL, numpy, psutil, safetensors, scipy'
    if ($LASTEXITCODE -ne 0) {
        & $python -s -m pip install -r "$root/requirements.txt"
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    $manifest = Get-Content -LiteralPath "$root/workflows/qwen21_model_manifest.json" -Raw | ConvertFrom-Json
    foreach ($model in $manifest) {
        $path = $model.file.Replace('\','/')
        $relative = $path.Substring('ComfyUI/models/'.Length)
        Get-VerifiedFile "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/$($model.revision)/$relative" (Join-Path $root $path) $model.bytes $model.sha256
    }
    if (!$PrepareOnly) {
        $options = @()
        if (!$NoBrowser) { $options += '--open' }
        & $python -s "$root/launch_qwen.py" @options
        if ($LASTEXITCODE -ne 0) { throw 'LuminaUI stopped. See webui/data/comfyui.log.' }
    }
} finally { $lock.Dispose() }
