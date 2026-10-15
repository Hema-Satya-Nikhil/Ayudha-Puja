@echo off
setlocal
cd /d "%~dp0"

REM Try python, then python3, then py Launcher
where python >nul 2>&1
if %errorlevel%==0 (
    start "SIET Ayudha Puja Server" /min cmd /c "python -m http.server 8000"
    goto :launched
)
where python3 >nul 2>&1
if %errorlevel%==0 (
    start "SIET Ayudha Puja Server" /min cmd /c "python3 -m http.server 8000"
    goto :launched
)
where py >nul 2>&1
if %errorlevel%==0 (
    start "SIET Ayudha Puja Server" /min cmd /c "py -m http.server 8000"
    goto :launched
)

echo Python not found. Opening directly (some features may be limited).
start "" "%~dp0index.html"
goto :eof

:launched
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000"
endlocal
