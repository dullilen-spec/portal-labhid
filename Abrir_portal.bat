@echo off
rem v03 PRUEBA. Abre esta version del portal en http://localhost:4175/ (v01 usa el 4173 y v02 el 4174).
rem Sirve portal\dist con un servidor propio, sin node_modules.
rem Usa Node si lo encuentra (portatil de %USERPROFILE%\Portal-VDC o instalado);
rem si la PC no tiene Node, usa PowerShell, que viene con Windows.
rem Para detenerlo, cierra esta ventana.
set "NODE=%USERPROFILE%\Portal-VDC\herramientas\node-v26.13.0-win-x64\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul && (set "NODE=node") || (set "NODE=")
)
cd /d "%TEMP%"
rem Abre en el inventario (en computadora: lista y ficha lado a lado). El mapa 3D esta en la barra superior.
start "" "http://127.0.0.1:4175/?q="
if defined NODE (
  "%NODE%" "%~dp0scripts\servir_portal.mjs" 4175
) else (
  echo Esta PC no tiene Node: se usa PowerShell.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\servir_portal.ps1" 4175
)
pause
