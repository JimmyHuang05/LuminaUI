# Serve the introduction before the machine has a Python runtime.
param([switch]$NoWindow)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $root '.runtime'
[IO.Directory]::CreateDirectory($runtime) | Out-Null
$urlFile = Join-Path $runtime 'intro-url'
try {
    $lock = [IO.File]::Open("$runtime/intro.lock",'OpenOrCreate','ReadWrite','None')
} catch [IO.IOException] {
    if (Test-Path $urlFile) {
        $existing = [IO.File]::ReadAllText($urlFile)
        if ($existing -match '^http://127\.0\.0\.1:\d+/[a-f0-9]{32}/$') { Start-Process $existing }
    }
    return
}
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$encoding = [Text.UTF8Encoding]::new($false)
$prefix = '/' + [Guid]::NewGuid().ToString('N') + '/'
$worker = $null
$started = $false
$ready = $false
$finished = $false
$models = Get-Content "$root/workflows/qwen21_model_manifest.json" -Raw | ConvertFrom-Json
function Get-State {
    if (!$started) { return @{state='idle'} }
    $phase = if (Test-Path "$runtime/prepare-phase") { Get-Content "$runtime/prepare-phase" -Raw }
    if ($phase -eq 'engine' -or $worker.HasExited) {
        try {
            $app = Invoke-RestMethod 'http://127.0.0.1:18290/api/config' -TimeoutSec 2
            $system = Invoke-RestMethod 'http://127.0.0.1:18288/system_stats' -TimeoutSec 2
            if ($app.edition -eq 'qwen21' -and $system.system.argv -contains (Join-Path $root 'ComfyUI')) {
                return @{state='ready'}
            }
        } catch {}
    }
    if ($worker.HasExited) {
        $message = (Get-Content "$runtime/first-run-error.log" -Tail 12 -ErrorAction SilentlyContinue) -join ' '
        return @{state='failed';message=$message}
    }
    $state = @{state='working';phase=$phase}
    if ($phase -eq 'runtime') {
        $partial = "$runtime/downloads/comfy-v0.46.0.7z.part"
        $total = 2085169944
    } else {
        foreach ($model in $models) {
            if ($model.file.Replace('\','/') -eq "ComfyUI/models/$phase") {
                $partial = (Join-Path $root $model.file) + '.part'
                $total = $model.bytes
            }
        }
    }
    if ($partial -and (Test-Path -LiteralPath $partial)) {
        $state.bytes = (Get-Item -LiteralPath $partial).Length
        $state.total = $total
    }
    return $state
}
try {
    $listener.Start()
    $url = "http://127.0.0.1:$($listener.LocalEndpoint.Port)$prefix"
    [IO.File]::WriteAllText($urlFile,$url)
    if (!$NoWindow) {
        $edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'
        if (Test-Path $edge) {
            Start-Process $edge -ArgumentList "--app=$url","--start-fullscreen",("--user-data-dir=`"$runtime/intro-browser`"")
        } else { Start-Process $url }
    }
    while (!$finished) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 2500
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new($stream)
            $line = $reader.ReadLine()
            if (!$line) { continue }
            $method,$path,$protocol = $line.Split(' ')
            $internal = $false
            for ($i=0;$i -lt 80;$i++) {
                $header = $reader.ReadLine()
                if (!$header) { break }
                if ($header -eq 'X-Lumina-Setup: 1') { $internal = $true }
            }
            $status='200 OK'; $type='application/json'; $body=$null
            if ($method -eq 'GET' -and $path -eq $prefix) {
                $type='text/html; charset=utf-8'; $body=[IO.File]::ReadAllBytes("$root/first-run.html")
            } elseif ($method -eq 'GET' -and $path -eq ($prefix+'canvas-intro.js')) {
                $type='text/javascript; charset=utf-8'; $body=[IO.File]::ReadAllBytes("$root/canvas-intro.js")
            } elseif ($method -eq 'GET' -and $path -eq ($prefix+'canvas-intro.css')) {
                $type='text/css; charset=utf-8'; $body=[IO.File]::ReadAllBytes("$root/canvas-intro.css")
            } elseif ($method -eq 'GET' -and $path -eq ($prefix+'docs/images/glass-study.jpg')) {
                $type='image/jpeg'; $body=[IO.File]::ReadAllBytes("$root/docs/images/glass-study.jpg")
            } elseif ($method -eq 'GET' -and $path -eq ($prefix+'docs/images/qwen-studio.jpg')) {
                $type='image/jpeg'; $body=[IO.File]::ReadAllBytes("$root/docs/images/qwen-studio.jpg")
            } elseif ($method -eq 'GET' -and $path -eq ($prefix+'docs/images/index.png')) {
                $type='image/png'; $body=[IO.File]::ReadAllBytes("$root/docs/images/index.png")
            } elseif ($method -eq 'GET' -and $path -eq ($prefix+'docs/images/resources.png')) {
                $type='image/png'; $body=[IO.File]::ReadAllBytes("$root/docs/images/resources.png")
            } elseif ($method -eq 'GET' -and $path -eq ($prefix+'status')) {
                $state=Get-State; $ready=$state.state -eq 'ready'
                $body=$encoding.GetBytes(($state | ConvertTo-Json -Compress))
            } elseif ($internal -and $method -eq 'POST' -and $path -eq ($prefix+'prepare')) {
                if (!$started -or $worker.HasExited) {
                    $worker=Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',('.\Start-Lumina.ps1'),'-NoBrowser' -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput "$runtime/first-run.log" -RedirectStandardError "$runtime/first-run-error.log"
                    $started=$true
                }
            } elseif ($internal -and $method -eq 'POST' -and $path -match ('^'+[regex]::Escape($prefix)+'finish(?:\?appearance=(dark|light|system))?$') -and $ready -and (Get-State).state -eq 'ready') {
                $appearance = if ($path.Contains('=')) { $path.Split('=')[-1] } else { 'dark' }
                [IO.File]::WriteAllText("$runtime/appearance",$appearance)
                [IO.File]::WriteAllText("$runtime/intro-complete",'1')
                $finished=$true
            } else { $status='404 Not Found' }
            if ($null -eq $body) { $body=$encoding.GetBytes('{}') }
            $head=$encoding.GetBytes("HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nReferrer-Policy: no-referrer`r`nConnection: close`r`n`r`n")
            $stream.Write($head,0,$head.Length); $stream.Write($body,0,$body.Length)
        } catch [IO.IOException] {} finally { $client.Close() }
    }
} finally { $listener.Stop(); $lock.Dispose() }
if ($worker -and !$worker.HasExited) { $worker.WaitForExit() }
