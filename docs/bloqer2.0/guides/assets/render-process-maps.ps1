$ErrorActionPreference = "Stop"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -AssemblyName System.Drawing
$paper = [System.Drawing.Color]::FromArgb(244,247,251)

$jobs = @(
  @{ Folder = "laminas"; Names = @(
    "mapa-puesta-en-marcha",
    "mapa-pago-corporativo",
    "mapa-tesoreria-conciliacion",
    "mapa-cerrar-el-mes",
    "mapa-presupuesto-edt",
    "mapa-circuito-compra-sc-oc",
    "mapa-subcontrato",
    "mapa-certificar-cobrar",
    "mapa-cargar-edt-apu",
    "mapa-armar-cronograma"
  )},
  @{ Folder = "flujos"; Names = @(
    "mapa-flujo-compras-si-no",
    "mapa-flujo-sueldo-si-no",
    "mapa-flujo-gasto-empresa-si-no",
    "mapa-flujo-costo-obra-si-no",
    "mapa-flujo-subcontrato-si-no",
    "mapa-flujo-certificar-cobrar-si-no"
  )}
)

function Render-Map($folder, $name) {
  $html = Join-Path $root "$folder\$name.html"
  $png = Join-Path $root "$folder\$name.png"
  $url = "http://127.0.0.1:8769/$folder/$name.html"
  if (-not (Test-Path $html)) { throw "missing $html" }
  if (Test-Path $png) { Remove-Item $png -Force }
  & $chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1600,1300 --screenshot="$png" --force-device-scale-factor=2 $url | Out-Null
  $ok = $false
  for ($i = 0; $i -lt 25; $i++) {
    if ((Test-Path $png) -and ((Get-Item $png).Length -gt 10000)) { $ok = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ok) { throw "chrome did not write $png" }
  $src = [System.Drawing.Bitmap]::FromFile($png)
  $last = 0
  for ($y = $src.Height - 1; $y -ge 0; $y--) {
    $c = $src.GetPixel(80, $y)
    $same = [Math]::Abs($c.R - $paper.R) -lt 8 -and [Math]::Abs($c.G - $paper.G) -lt 8 -and [Math]::Abs($c.B - $paper.B) -lt 8
    if (-not $same) { $last = $y; break }
  }
  $cropH = [Math]::Min($src.Height, $last + 16)
  $tmp = Join-Path $root "$folder\$name.crop.png"
  $cropped = $src.Clone((New-Object System.Drawing.Rectangle 0, 0, $src.Width, $cropH), $src.PixelFormat)
  $src.Dispose()
  $cropped.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $cropped.Dispose()
  Remove-Item $png -Force
  Move-Item $tmp $png
  Copy-Item $png "c:\Dev\bloqer-v2\apps\web\public\help\$name.png" -Force
  Write-Output "$folder/$name $($cropH)px"
}

$only = $args
foreach ($job in $jobs) {
  foreach ($name in $job.Names) {
    if ($only.Count -gt 0 -and $only -notcontains $name) { continue }
    Render-Map $job.Folder $name
  }
}
