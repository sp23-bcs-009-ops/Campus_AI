@echo off
REM ════════════════════════════════════════════════════════════════
REM  Campus AI — one-click launcher (Windows)
REM  Starts the backend (FastAPI) + the app (Expo web) and opens it.
REM ════════════════════════════════════════════════════════════════
title Campus AI Launcher
cd /d "%~dp0"

echo.
echo  ============================================
echo    Campus AI - starting everything...
echo  ============================================
echo.

REM ── 1. Backend deps (first run only) ─────────────────────────────
if not exist "backend\.deps_installed" (
    echo  [1/4] Installing backend dependencies (first run only^)...
    pip install -r backend\requirements.txt -q
    if errorlevel 1 (
        echo  ERROR: pip install failed. Is Python 3.10+ installed and on PATH?
        pause & exit /b 1
    )
    echo done > backend\.deps_installed
) else (
    echo  [1/4] Backend dependencies OK
)

REM ── 2. Frontend deps (first run only) ────────────────────────────
if not exist "Frontend\node_modules" (
    echo  [2/4] Installing app dependencies (first run only, ~2 min^)...
    pushd Frontend
    call npm install --legacy-peer-deps --no-audit --no-fund
    if errorlevel 1 (
        echo  ERROR: npm install failed. Is Node.js 18+ installed?
        popd & pause & exit /b 1
    )
    popd
) else (
    echo  [2/4] App dependencies OK
)

REM ── 3. Start backend in its own window ───────────────────────────
echo  [3/4] Starting Campus AI backend on http://localhost:8000 ...
start "Campus AI Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn API:app --host 0.0.0.0 --port 8000"

REM ── 4. Start the app (Expo web) ──────────────────────────────────
echo  [4/4] Starting the app on http://localhost:19006 ...
timeout /t 3 /nobreak >nul
start "Campus AI App" cmd /k "cd /d %~dp0Frontend && npx expo start --web --port 19006"

echo.
echo  ============================================
echo    All started!
echo    App:      http://localhost:19006
echo    Backend:  http://localhost:8000/health
echo    API docs: http://localhost:8000/docs
echo.
echo    (Optional^) Admin dashboard:
echo       cd dashboard ^&^& npm install ^&^& npm run dev
echo  ============================================
echo.
pause
