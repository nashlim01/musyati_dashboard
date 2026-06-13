@echo off
REM Musyati Tracking Monitor - one-click launcher for Windows.
REM Double-click this file to start the dashboard like an app.
REM It serves the UI + API on a single local port and opens your browser.

setlocal
set "PORT=4000"
set "URL=http://localhost:%PORT%"

REM always run from this script's own folder
cd /d "%~dp0"

title Musyati Tracking Monitor
cls
echo ===================================================
echo    Musyati Tracking Monitor
echo ===================================================
echo.

REM check Node / npm is installed
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js / npm not found.
  echo Install Node from https://nodejs.org then double-click this file again.
  echo.
  pause
  exit /b 1
)

REM if it's already running, just open the browser and stop
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '%URL%/api/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Already running - opening dashboard...
  start "" "%URL%"
  echo.
  echo Dashboard is open in your browser. You can close this window.
  pause
  exit /b 0
)

REM first run (or after copying a fresh copy): install dependencies
if not exist "node_modules" (
  echo First-time setup - installing components ^(one-time, a minute or two^)...
  call npm install
  echo.
)

REM build the UI if it hasn't been built yet
if not exist "client\dist\index.html" (
  echo Preparing the dashboard...
  call npm run build
  echo.
)

echo Starting the dashboard server...
echo.

REM wait in the background until the server answers, then open the browser
start "" powershell -NoProfile -WindowStyle Hidden -Command ^
  "for($i=0;$i -lt 40;$i++){ try { Invoke-WebRequest -UseBasicParsing '%URL%/api/health' -TimeoutSec 2 | Out-Null; Start-Process '%URL%'; break } catch { Start-Sleep -Milliseconds 500 } }"

echo ===================================================
echo    Musyati Tracking Monitor is running
echo    %URL%
echo ===================================================
echo.
echo Your data is saved in:  server\data\musyati-data.xlsx
echo.
echo ^>^>^> Keep this window open while you use the dashboard. ^<^<^<
echo ^>^>^> Close this window to shut it down.                 ^<^<^<
echo.

REM run the server in the foreground; closing this window stops everything
call npm run start

endlocal
