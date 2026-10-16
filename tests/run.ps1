# Reproduce las pruebas de DeckAI en un navegador real (Brave/Chrome headless).
#
#   powershell -ExecutionPolicy Bypass -File tests\run.ps1 -TestName t-design.js
#   powershell -ExecutionPolicy Bypass -File tests\run.ps1                 # todas las t-*.js
#   powershell -ExecutionPolicy Bypass -File tests\run.ps1 -Browser "C:\ruta\chrome.exe"
#
# Cada prueba es un IIFE en tests\t-*.js que devuelve el texto con el resultado.
# Se controla el navegador por CDP (Runtime.evaluate + awaitPromise), asi que valen
# tests sync y async. Autodetecta el navegador si no se pasa -Browser.
param([int]$Port = 9440, [string]$Setup = '', [string]$SetupFile = '', [string]$Size = '1500,940', [string]$Test = '', [string]$TestFile = '', [string]$TestName = '', [string]$Browser = '')
$ErrorActionPreference = 'Stop'
if ($TestName -and -not $TestFile) { $TestFile = Join-Path $PSScriptRoot $TestName }
if ($SetupFile) { $Setup = (Get-Content -LiteralPath $SetupFile -Raw -Encoding UTF8) }
if ($TestFile)  { $Test  = (Get-Content -LiteralPath $TestFile  -Raw -Encoding UTF8) }
$brave = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
if (-not (Test-Path -LiteralPath $brave)) {
  foreach ($c in @('C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe',
      'C:\Program Files\Google\Chrome\Application\chrome.exe',
      'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')) {
    if (Test-Path -LiteralPath $c) { $brave = $c; break }
  }
}
if ($Browser -and (Test-Path -LiteralPath $Browser)) { $brave = $Browser }
$profile = Join-Path $env:TEMP ('opencode\cdp-' + $Port)
$root = Split-Path -Parent $PSScriptRoot
$url = 'file:///' + ((Join-Path $root 'index.html') -replace '\\', '/')

# --- sin prueba concreta: ejecuta cada t-*.js en su propio proceso (aislado) ---
if (-not $TestName -and -not $TestFile) {
  $puerto = $Port
  foreach ($f in (Get-ChildItem -LiteralPath $PSScriptRoot -Filter 't-*.js' | Sort-Object Name)) {
    Write-Output ("=== " + $f.Name + " ===")
    $child = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Port', $puerto, '-TestName', $f.Name)
    if ($Browser) { $child += @('-Browser', $Browser) }
    & powershell @child
    $puerto++
  }
  Write-Output '=== FIN ==='
  exit 0
}

$p = Start-Process -FilePath $brave -PassThru -ArgumentList @(
  "--remote-debugging-port=$Port", "--user-data-dir=$profile",
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--allow-file-access-from-files',"--window-size=$Size",$url)
Start-Sleep -Seconds 5
$target = $null
foreach ($i in 1..20) {
  try {
    $t = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list"
    $target = $t | Where-Object { $_.url -like '*index.html*' -and $_.webSocketDebuggerUrl } | Select-Object -First 1
    if ($target) { break }
  } catch { }
  Start-Sleep -Milliseconds 700
}
if (-not $target) { 'NO_TARGET'; Stop-Process -Id $p.Id -Force; exit 1 }

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$script:id = 0
$script:errores = New-Object System.Collections.ArrayList

function Send-Cdp($id,$method,$params){
  $m = @{id=$id;method=$method;params=$params}|ConvertTo-Json -Depth 14 -Compress
  $b=[Text.Encoding]::UTF8.GetBytes($m); $sg=New-Object ArraySegment[byte] (,$b)
  $ws.SendAsync($sg,'Text',$true,[Threading.CancellationToken]::None).Wait()
}
function Read-Cdp {
  $buf=New-Object byte[] 33554432; $ms=New-Object IO.MemoryStream
  do { $sg=New-Object ArraySegment[byte] (,$buf); $t=$ws.ReceiveAsync($sg,[Threading.CancellationToken]::None); $t.Wait(); $r=$t.Result
       if ($r.Count -gt 0) { $ms.Write($buf,0,$r.Count) } } while (-not $r.EndOfMessage)
  [Text.Encoding]::UTF8.GetString($ms.ToArray())
}
function Eval($id, $expr, [switch]$Quiet) {
  Send-Cdp $id 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true; awaitPromise = $true }
  while ($true) {
    $raw = Read-Cdp
    $m = $raw | ConvertFrom-Json
    if ($m.method -eq 'Runtime.exceptionThrown') {
      $d = $m.params.exceptionDetails
      $txt = if ($d.exception -and $d.exception.description) { $d.exception.description } else { '' }
      $frames = ($d.stackTrace.callFrames | Select-Object -First 4 | ForEach-Object { "$($_.functionName)@$($_.url | Split-Path -Leaf):$($_.lineNumber)" }) -join ' <- '
      [void]$script:errores.Add('EXCEPCION: ' + $d.text + ' ' + $txt + ' :: ' + $frames)
      continue
    }
    if ($m.method -eq 'Log.entryAdded' -and $m.params.entry.level -in @('error','warning')) {
      [void]$script:errores.Add('LOG ' + $m.params.entry.level.ToUpper() + ': ' + $m.params.entry.text)
      continue
    }
    if ($m.method -eq 'Runtime.consoleAPICalled' -and $m.params.type -in @('error','warning')) {
      $txt = ($m.params.args | ForEach-Object { $_.value; $_.description } | Where-Object { $_ }) -join ' '
      [void]$script:errores.Add('CONSOLA ' + $m.params.type.ToUpper() + ': ' + $txt)
      continue
    }
    if ($m.id -eq $id) {
      if ($m.result.exceptionDetails) {
        $d = $m.result.exceptionDetails
        $txt = if ($d.exception -and $d.exception.description) { $d.exception.description } else { '' }
        return 'EXCEPCION: ' + $d.text + ' ' + $txt
      }
      return $m.result.result.value
    }
  }
}

Send-Cdp 1 'Runtime.enable' @{}
Send-Cdp 2 'Log.enable' @{}
Eval 3 '1' | Out-Null          # vacía el arranque

foreach ($i in 1..30) {
  if ((Eval 10 'typeof App === "object" && typeof Providers === "object" && document.getElementById("deck")') -eq 'true') { break }
  Start-Sleep -Milliseconds 400
}
Start-Sleep -Milliseconds 1200
Eval 11 '1' | Out-Null          # recoge errores del arranque

$errores.Add('--- ARRANQUE ---') | Out-Null
if ($Setup) { Eval 12 $Setup | Out-Null; Start-Sleep -Milliseconds 1200 }
$errores.Add('--- TRAS SETUP ---') | Out-Null
if ($Test)  { $r = Eval 13 $Test; $errores.Add('--- PRUEBA ---') | Out-Null; $errores.Add([string]$r) | Out-Null }
Start-Sleep -Milliseconds 400
Eval 14 '1' | Out-Null

$ws.CloseAsync('NormalClosure','bye',[Threading.CancellationToken]::None).Wait()
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
$errores -join "`n"
