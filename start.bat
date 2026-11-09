@echo off
setlocal
title ValorantMoments
cd /d "%~dp0"

echo ============================================
echo   Valorant Moments - Local Video Wall
echo ============================================
echo.
echo Starting server...
echo.

set "PY="
if exist "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python313\python.exe" set "PY=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python313\python.exe"
if not defined PY if exist "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312\python.exe" set "PY=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312\python.exe"
if not defined PY if exist "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe" set "PY=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe"
if not defined PY (
    for /f "delims=" %%i in ('where python 2^>nul') do (
        if not defined PY set "PY=%%i"
    )
)
if not defined PY (
    echo [ERROR] Python not found.
    echo Please install Python 3.9 or newer.
    echo.
    pause
    exit /b 1
)

echo Using Python: %PY%
echo.

"%PY%" -c "import fastapi, uvicorn, Crypto" >nul 2>nul
if errorlevel 1 (
    echo [INFO] Installing required packages, please wait...
    "%PY%" -m pip install fastapi uvicorn pycryptodome
    echo.
)

echo Server running at http://127.0.0.1:8765
echo Close this window to stop the server.
echo.

"%PY%" app.py

echo.
echo [Server stopped]
pause
