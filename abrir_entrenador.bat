@echo off
rem Doble clic para abrir el entrenador en el navegador.
rem Mientras esta ventana este abierta, el entrenador funciona. Cierrala para apagarlo.
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"
title Entrenador de ajedrez (cierra esta ventana para apagarlo)
python servidor.py
if errorlevel 1 (
  echo.
  echo Algo ha fallado. Copia el mensaje de arriba y pasaselo a Claude.
  pause
)
