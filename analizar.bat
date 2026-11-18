@echo off
rem Doble clic para descargar tus partidas nuevas, analizarlas y abrir el informe.
rem La primera vez pregunta tu usuario de chess.com y lo guarda en usuario.txt
rem (ese archivo no se sube a GitHub). Para cambiarlo, borra usuario.txt.
chcp 65001 >nul
set PYTHONUTF8=1
rem Trabajar siempre en la carpeta donde esta este archivo.
cd /d "%~dp0"

if exist usuario.txt (
  set /p USUARIO=<usuario.txt
) else (
  set /p USUARIO=Escribe tu usuario de chess.com:
)
if "%USUARIO%"=="" goto error
if not exist usuario.txt echo %USUARIO%>usuario.txt

echo === 1/3 Descargando partidas de chess.com (%USUARIO%) ===
python descargar.py %USUARIO%
if errorlevel 1 goto error

echo.
echo === 2/3 Analizando partidas nuevas con Stockfish ===
python analizar.py
if errorlevel 1 goto error

echo.
echo === 3/3 Generando el informe ===
python informe.py
if errorlevel 1 goto error

echo.
echo Listo. El informe se ha abierto en tu navegador.
pause
exit /b 0

:error
echo.
echo Algo ha fallado. Copia el mensaje de arriba y pasaselo a Claude.
pause
exit /b 1
