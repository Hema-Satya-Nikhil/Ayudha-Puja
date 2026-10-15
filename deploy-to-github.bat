@echo off
setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo   SIET Ayudha Puja - GitHub Deploy Helper
echo ========================================
echo.

git remote -r | findstr "github" >nul 2>&1
if %errorlevel% neq 0 (
    echo No GitHub remote configured.
    echo.
    echo Steps:
    echo 1. Create a NEW public repository on github.com
    echo    (Example: siet-ayudha-puja-showcase)
    echo 2. Run the following commands:
    echo.
    echo    git remote add origin https://github.com/USERNAME/REPO.git
    echo    git branch -M main
    echo    git push -u origin main
    echo.
    echo 3. GitHub Pages will deploy automatically via the
    echo    workflow in .github/workflows/pages.yml
    echo.
    echo Opening https://github.com/new in your browser...
    start "" "https://github.com/new"
    goto :eof
)

echo Pushing to GitHub...
git add -A
git commit -m "Update showcase" 2>nul
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo Successfully pushed to GitHub!
    echo GitHub Pages will deploy automatically.
    echo Check: https://USERNAME.github.io/REPO/
) else (
    echo.
    echo Push failed. Check your credentials.
    echo You may need to set up GitHub authentication:
    echo   - Use a Personal Access Token (PAT) as password
    echo   - Or install GitHub CLI (gh) and authenticate
)
endlocal
