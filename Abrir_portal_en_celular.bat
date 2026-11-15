@echo off
rem v03 PRUEBA. Abre el portal para probarlo en un celular conectado al mismo Wi-Fi.
rem Sirve portal\dist con un servidor propio, sin node_modules.
rem Usa Node si lo encuentra; si la PC no tiene Node, usa PowerShell, que viene con Windows.
rem Windows puede pedir permiso de firewall la primera vez: acepta.
rem En el celular NO se escribe 0.0.0.0: se escribe la direccion que muestra esta ventana.
rem Para detenerlo, cierra esta ventana.
set "NODE=%USERPROFILE%\Portal-VDC\herramientas\node-v26.13.0-win-x64\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul && (set "NODE=node") || (set "NODE=")
)
cd /d "%TEMP%"
if defined NODE (
  "%NODE%" "%~dp0scripts\servir_portal.mjs" 4175 0.0.0.0
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\servir_portal.ps1" 4175 red
)
pause
