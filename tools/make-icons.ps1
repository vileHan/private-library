# Erzeugt die App-Icons (PNG) mit System.Drawing. Einmalig ausführen:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Icon([int]$size, [string]$file, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $bg = [System.Drawing.Color]::FromArgb(255, 47, 93, 80)
  if ($maskable) {
    $g.Clear($bg)
  } else {
    $g.Clear([System.Drawing.Color]::Transparent)
    $r = [int]($size * 0.22); $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, 2*$r, 2*$r, 180, 90); $path.AddArc($size-2*$r, 0, 2*$r, 2*$r, 270, 90)
    $path.AddArc($size-2*$r, $size-2*$r, 2*$r, 2*$r, 0, 90); $path.AddArc(0, $size-2*$r, 2*$r, 2*$r, 90, 90)
    $path.CloseFigure(); $g.FillPath((New-Object System.Drawing.SolidBrush $bg), $path)
  }
  # Drei Buchrücken + ein gekipptes Buch, innerhalb der Safe-Zone (80 %)
  $s = $size / 100.0
  $books = @(
    @{x=26; w=11; h=46; c=@(244,236,216)},
    @{x=39; w=13; h=52; c=@(232,190,110)},
    @{x=54; w=10; h=42; c=@(244,236,216)}
  )
  $base = 74
  foreach ($b in $books) {
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, $b.c[0], $b.c[1], $b.c[2]))
    $g.FillRectangle($brush, [float]($b.x*$s), [float](($base-$b.h)*$s), [float]($b.w*$s), [float]($b.h*$s))
  }
  $g.TranslateTransform([float](72*$s), [float]($base*$s)); $g.RotateTransform(-16)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 232, 190, 110))
  $g.FillRectangle($brush, [float](-2*$s), [float](-44*$s), [float](10*$s), [float](44*$s))
  $g.ResetTransform()
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 244, 236, 216)), ([float](2.5*$s))
  $g.DrawLine($pen, [float](22*$s), [float](($base+1)*$s), [float](80*$s), [float](($base+1)*$s))
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 'icon-192.png' $false
New-Icon 512 'icon-512.png' $false
New-Icon 512 'icon-maskable-512.png' $true
New-Icon 180 'apple-touch-icon.png' $true
New-Icon 32  'favicon-32.png' $false
Write-Host "Icons erstellt in $out"
