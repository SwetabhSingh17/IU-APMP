@echo off
title IU-APMP Server
setlocal

echo ==========================================================
echo    IU-APMP - Academic Project Management Portal (v2.3.2)
echo    Integral University - One-Click Production Server
echo    By Swetabh Singh
echo ==========================================================
echo.

REM ----------------------------------------------------------
REM Step 0: Verify Node.js is installed
REM ----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Install the LTS version from https://nodejs.org and run this file again.
    goto :fail
)

REM ----------------------------------------------------------
REM Step 1: Ensure .env exists (bootstrap from template on first run)
REM ----------------------------------------------------------
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [ACTION REQUIRED] First run detected: created .env from .env.example
        echo.
        echo   1. Open the .env file in this folder with Notepad
        echo   2. Set DATABASE_URL to your PostgreSQL credentials, e.g.
        echo      DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/integral_project_hub
        echo   3. Change SESSION_SECRET to a long random string
        echo   4. Save the file and run start_server.bat again
        echo.
        pause
        exit /b 1
    ) else (
        echo [ERROR] Neither .env nor .env.example found in this folder.
        goto :fail
    )
)

REM ----------------------------------------------------------
REM Step 2: Install / update dependencies
REM ----------------------------------------------------------
echo [1/5] Installing dependencies...
call npm install
if errorlevel 1 goto :fail
echo.

REM ----------------------------------------------------------
REM Step 3: Prepare database (creates schema + admin on fresh installs,
REM         safely syncs schema changes on updates - never wipes data)
REM ----------------------------------------------------------
echo [2/5] Preparing database...
call npm run db:ensure
if errorlevel 1 goto :fail
echo.

REM ----------------------------------------------------------
REM Step 4: Build production bundle
REM ----------------------------------------------------------
echo [3/5] Building production bundle...
call npm run build
if errorlevel 1 goto :fail
echo.

REM ----------------------------------------------------------
REM Step 5: Check / Configure Windows Firewall for Port 3000
REM ----------------------------------------------------------
echo [4/5] Checking Windows Firewall rule for Port 3000...
netsh advfirewall firewall show rule name="IU-APMP Server Port 3000" >nul 2>nul
if not errorlevel 1 (
    echo [INFO] Inbound firewall rule for Port 3000 is active.
    goto :fw_done
)

netsh advfirewall firewall add rule name="IU-APMP Server Port 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>nul
if not errorlevel 1 (
    echo [INFO] Inbound firewall rule for Port 3000 configured successfully.
    goto :fw_done
)

echo [INFO] Could not automatically add firewall rule - requires Administrator privileges.
echo        If remote PCs cannot open http://YOUR-IP:3000, please run this once
echo        in an Administrator Command Prompt:
echo        netsh advfirewall firewall add rule name="IU-APMP Server Port 3000" dir=in action=allow protocol=TCP localport=3000

:fw_done
echo.

REM ----------------------------------------------------------
REM Step 6: Start the server
REM ----------------------------------------------------------
echo [5/5] Starting IU-APMP server...
echo.
echo   Local access:   http://localhost:3000
echo   Network access: Check console below for your IP, e.g. http://192.168.6.11:3000
echo.
echo       Press Ctrl+C to stop the server
echo.
call npm start

echo.
echo Server stopped.
pause
exit /b 0

:fail
echo.
echo [ERROR] Startup failed. Fix the problem shown above and run start_server.bat again.
pause
exit /b 1
