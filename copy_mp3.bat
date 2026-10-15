@echo off
setlocal
set "SOURCE=C:\Users\akhil\Downloads\Aigiri Nandini With Lyrics Mahishasura Mardini Stotram For Spiritual Growth Rajalakshmee Sanjay.mp3"
set "DEST=%~dp0assets\durga-devotional.mp3"
if not exist "%SOURCE%" (
    echo ERROR: Source MP3 not found at:
    echo   %SOURCE%
    echo Copy the file manually or check the path, then re-run this script.
    pause
    exit /b 1
)
if not exist "%~dp0assets" mkdir "%~dp0assets"
copy /Y "%SOURCE%" "%DEST%" >nul
if exist "%DEST%" (
    echo Copied:
    echo   %DEST%
    echo Size: %~Z.DEST bytes
) else (
    echo ERROR: Copy failed.
    pause
    exit /b 1
)
endlocal
