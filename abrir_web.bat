@echo off
rem Abre la web nueva en tu navegador (version local, antes de publicarla en GitHub Pages).
rem Mientras esta ventana este abierta, la web funciona. Cierrala para apagarla.
cd /d "%~dp0"
title Entrenador de ajedrez - web local (cierra esta ventana para apagarla)
start "" http://127.0.0.1:8080
python -m http.server 8080 --bind 127.0.0.1 --directory web
