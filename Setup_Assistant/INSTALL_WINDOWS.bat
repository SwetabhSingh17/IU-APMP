@echo off
REM ============================================================================
REM IU-APMP (Integral University Academic Project Management Portal) - Windows Installation Launcher
REM Created by: Swetabh Singh
REM This batch file bypasses PowerShell execution policy restrictions
REM ============================================================================

echo.
echo ========================================
echo   IU-APMP Setup (v2.3.2)
echo   Integral University Academic Project Management Portal
echo   By - Swetabh Singh
echo ========================================
echo.
echo Starting installation with administrator privileges...
echo.

REM Get the directory where this batch file is located
cd /d "%~dp0"

REM Run PowerShell with ExecutionPolicy Bypass
PowerShell -ExecutionPolicy Bypass -File "%~dp0install_windows.ps1"

echo.
echo.
echo Press any key to close this window...
pause >nul
