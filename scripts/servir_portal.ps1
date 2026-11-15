# v03 PRUEBA: sirve portal\dist solo con PowerShell (viene con Windows), para PCs sin Node.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\servir_portal.ps1 [puerto] [red]
#   sin "red": solo esta PC (http://localhost:puerto/)
#   con "red": tambien un celular en el mismo Wi-Fi (muestra la IP que hay que escribir)
# Usa un socket TCP simple y no necesita permisos de administrador. Windows puede pedir
# permiso de firewall para PowerShell la primera vez que se usa "red": hay que aceptar.
param([int]$Puerto = 4175, [string]$Modo = "")

$raiz = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\portal\dist"))
if (-not (Test-Path (Join-Path $raiz "index.html"))) {
  Write-Host "No existe $raiz\index.html"
  exit 1
}
$tipos = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".mjs" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8"; ".webmanifest" = "application/manifest+json"
  ".svg" = "image/svg+xml"; ".png" = "image/png"; ".webp" = "image/webp"; ".jpg" = "image/jpeg"; ".pdf" = "application/pdf"
  ".wasm" = "application/wasm"; ".woff2" = "font/woff2"; ".woff" = "font/woff"; ".frag" = "application/octet-stream"
}
$enRed = $Modo -eq "red"
$direccion = if ($enRed) { [Net.IPAddress]::Any } else { [Net.IPAddress]::Loopback }
$oyente = New-Object Net.Sockets.TcpListener($direccion, $Puerto)
try { $oyente.Start() } catch {
  Write-Host "No se pudo usar el puerto $Puerto. Quiza el portal ya esta abierto en otra ventana."
  exit 1
}
if ($enRed) {
  Write-Host ""
  Write-Host "Portal v03 PRUEBA listo. En el celular (mismo Wi-Fi que esta PC) escribe en Chrome:"
  Write-Host ""
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254*" } |
    ForEach-Object { Write-Host "    http://$($_.IPAddress):$Puerto/" }
  Write-Host ""
  Write-Host "No uses 0.0.0.0. Cierra esta ventana para detenerlo."
} else {
  Write-Host "Portal v03 PRUEBA en http://localhost:$Puerto/  (cierra esta ventana para detenerlo)"
}

function Responder($flujo, [int]$codigo, [string]$tipo, [byte[]]$cuerpo) {
  $estado = @{ 200 = "OK"; 404 = "Not Found"; 405 = "Method Not Allowed"; 500 = "Internal Server Error" }[$codigo]
  $cab = "HTTP/1.1 $codigo $estado`r`nContent-Type: $tipo`r`nContent-Length: $($cuerpo.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $b = [Text.Encoding]::ASCII.GetBytes($cab)
  $flujo.Write($b, 0, $b.Length)
  if ($cuerpo.Length) { $flujo.Write($cuerpo, 0, $cuerpo.Length) }
}

while ($true) {
  $cliente = $oyente.AcceptTcpClient()
  try {
    $cliente.ReceiveTimeout = 5000
    $cliente.SendTimeout = 30000
    $flujo = $cliente.GetStream()
    $lector = New-Object IO.StreamReader($flujo, [Text.Encoding]::ASCII, $false, 4096, $true)
    $linea = $lector.ReadLine()
    while ($true) { $h = $lector.ReadLine(); if ([string]::IsNullOrEmpty($h)) { break } }
    $partes = "$linea".Split(" ")
    $vacio = [byte[]]@()
    if ($partes.Length -lt 2) { continue }
    if ($partes[0] -ne "GET" -and $partes[0] -ne "HEAD") { Responder $flujo 405 "text/plain" $vacio; continue }
    $ruta = [Uri]::UnescapeDataString($partes[1].Split("?")[0])
    if ($ruta.EndsWith("/")) { $ruta += "index.html" }
    $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta.TrimStart("/")))
    # No se sirve nada fuera de dist
    if (-not $archivo.StartsWith($raiz + "\", [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $archivo -PathType Leaf)) {
      Responder $flujo 404 "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("No encontrado"))
      continue
    }
    $ext = [IO.Path]::GetExtension($archivo).ToLower()
    $tipo = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { "application/octet-stream" }
    $cuerpo = [IO.File]::ReadAllBytes($archivo)
    if ($partes[0] -eq "HEAD") { $cuerpo = $vacio }
    Responder $flujo 200 $tipo $cuerpo
  } catch {
    # Un cliente que corta la conexion no detiene el servidor
  } finally {
    $cliente.Close()
  }
}
