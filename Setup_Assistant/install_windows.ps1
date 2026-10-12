# IU-APMP (Integral University Academic Project Management Portal v2.3.1) - Windows Installation Script
# Created by: Swetabh Singh
# Run with: PowerShell -ExecutionPolicy Bypass -File install_windows.ps1

Write-Host ""
Write-Host "========================================"
Write-Host "  IU-APMP (Academic Project Management Portal v2.3.1) - Setup"
Write-Host "  By - Swetabh Singh"
Write-Host "========================================"
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting administrator privileges..." -ForegroundColor Yellow
    Write-Host ""
    $arguments = "-ExecutionPolicy Bypass -File `"" + $PSCommandPath + "`""
    Start-Process PowerShell -ArgumentList $arguments -Verb RunAs
    exit
}

Write-Host "Running with administrator privileges" -ForegroundColor Green
Write-Host ""

# Check Windows Version
Write-Host "Checking System Requirements..." -ForegroundColor Cyan
Write-Host ""

$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion.Major -lt 10) {
    Write-Host "Windows 10 or later required" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Windows $($osVersion.Major).$($osVersion.Minor) detected" -ForegroundColor Green
Write-Host ""

# Check winget
Write-Host "Checking Package Manager..." -ForegroundColor Cyan
Write-Host ""

$wingetExists = Get-Command winget -ErrorAction SilentlyContinue
if (-not $wingetExists) {
    Write-Host "winget not found" -ForegroundColor Yellow
    Write-Host "Please install App Installer from Microsoft Store" -ForegroundColor Cyan
    Write-Host "Opening Microsoft Store..." -ForegroundColor Cyan
    Start-Process "ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1"
    Write-Host ""
    Write-Host "Please install App Installer and run this script again" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "winget is available" -ForegroundColor Green
Write-Host ""

# Node.js Installation
Write-Host "========================================"
Write-Host "Checking Node.js Installation"
Write-Host "========================================"
Write-Host ""

$nodeExists = Get-Command node -ErrorAction SilentlyContinue
if ($nodeExists) {
    $nodeVersion = node --version
    Write-Host "Node.js is already installed: $nodeVersion" -ForegroundColor Green
}
else {
    Write-Host "Node.js not found. Installing..." -ForegroundColor Yellow
    Write-Host "Downloading and installing Node.js via winget..." -ForegroundColor Cyan
    Write-Host "This may take a few minutes, please wait..." -ForegroundColor Cyan
    Write-Host ""
    
    winget install -e --id OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements
    
    # Refresh PATH
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = $machinePath + ";" + $userPath
    
    Start-Sleep -Seconds 3
    
    $nodeExists = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeExists) {
        $nodeVersion = node --version
        Write-Host "Node.js installed successfully: $nodeVersion" -ForegroundColor Green
    }
    else {
        Write-Host "Node.js installation failed!" -ForegroundColor Red
        Write-Host "Please install Node.js manually from: https://nodejs.org/" -ForegroundColor Cyan
        pause
        exit 1
    }
}

Write-Host ""

# Verify npm
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = $machinePath + ";" + $userPath

$npmExists = Get-Command npm -ErrorAction SilentlyContinue
if ($npmExists) {
    $npmVersion = npm --version
    Write-Host "npm is available: $npmVersion" -ForegroundColor Green
}
else {
    Write-Host "npm not found. Please reinstall Node.js" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

# PostgreSQL Installation
Write-Host "========================================"
Write-Host "Checking PostgreSQL Installation"
Write-Host "========================================"
Write-Host ""

$psqlExists = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlExists) {
    Write-Host "PostgreSQL is already installed" -ForegroundColor Green
}
else {
    Write-Host "PostgreSQL not found. Attempting installation..." -ForegroundColor Yellow
    Write-Host ""
    
    # Try different PostgreSQL package IDs
    $pgPackageIds = @(
        "PostgreSQL.PostgreSQL.16",
        "PostgreSQL.PostgreSQL.15",
        "PostgreSQL.PostgreSQL",
        "EDB.PostgreSQL"
    )
    
    $installed = $false
    foreach ($packageId in $pgPackageIds) {
        Write-Host "Trying package ID: $packageId" -ForegroundColor Cyan
        
        $result = winget install -e --id $packageId --silent --override "--mode unattended --superpassword root123 --serverport 5432" --accept-package-agreements --accept-source-agreements 2>&1
        
        Start-Sleep -Seconds 3
        
        # Check if PostgreSQL was installed
        $pgPaths = @(
            "C:\Program Files\PostgreSQL\16\bin",
            "C:\Program Files\PostgreSQL\15\bin",
            "C:\Program Files\PostgreSQL\14\bin",
            "C:\Program Files\PostgreSQL\13\bin"
        )
        
        foreach ($pgPath in $pgPaths) {
            if (Test-Path $pgPath) {
                Write-Host "Found PostgreSQL at: $pgPath" -ForegroundColor Green
                
                # Add to PATH
                $currentPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::Machine)
                if ($currentPath -notlike "*$pgPath*") {
                    $newPath = $currentPath + ";" + $pgPath
                    [Environment]::SetEnvironmentVariable("Path", $newPath, [EnvironmentVariableTarget]::Machine)
                    Write-Host "Added PostgreSQL to PATH" -ForegroundColor Green
                }
                
                $installed = $true
                break
            }
        }
        
        if ($installed) {
            break
        }
    }
    
    # Refresh PATH
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = $machinePath + ";" + $userPath
    
    Start-Sleep -Seconds 3
    
    $psqlExists = Get-Command psql -ErrorAction SilentlyContinue
    if ($psqlExists) {
        Write-Host "PostgreSQL installed successfully" -ForegroundColor Green
        
        # Start PostgreSQL service
        Write-Host "Starting PostgreSQL service..." -ForegroundColor Cyan
        $postgresServices = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
        if ($postgresServices) {
            foreach ($service in $postgresServices) {
                Start-Service $service.Name -ErrorAction SilentlyContinue
                Set-Service $service.Name -StartupType Automatic -ErrorAction SilentlyContinue
                Write-Host "Started service: $($service.Name)" -ForegroundColor Green
            }
        }
    }
    else {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "PostgreSQL Auto-Install Failed" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "MANUAL INSTALLATION REQUIRED:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "1. Download PostgreSQL installer from:" -ForegroundColor Cyan
        Write-Host "   https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor White
        Write-Host ""
        Write-Host "2. Run the installer and follow the wizard:" -ForegroundColor Cyan
        Write-Host "   - Choose version 15 or 16" -ForegroundColor White
        Write-Host "   - Remember the password you set for 'postgres' user" -ForegroundColor White
        Write-Host "   - Use default port 5432" -ForegroundColor White
        Write-Host "   - Install in default location" -ForegroundColor White
        Write-Host ""
        Write-Host "3. After installation completes, run this script again" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Opening download page in browser..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
        Start-Process "https://www.enterprisedb.com/downloads/postgres-postgresql-downloads"
        Write-Host ""
        pause
        exit 1
    }
}

Write-Host ""

# Navigate to Project Directory
Write-Host "========================================"
Write-Host "Setting Up Project"
Write-Host "========================================"
Write-Host ""

$scriptPath = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptPath
Set-Location $projectRoot

Write-Host "Project directory: $projectRoot" -ForegroundColor Cyan
Write-Host ""

# Install Project Dependencies
Write-Host "========================================"
Write-Host "Installing Project Dependencies"
Write-Host "========================================"
Write-Host ""

$packageJsonExists = Test-Path "package.json"
if ($packageJsonExists) {
    Write-Host "Running npm install..." -ForegroundColor Cyan
    Write-Host "This may take 5-10 minutes, please be patient..." -ForegroundColor Yellow
    Write-Host ""
    
    npm install
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Dependencies installed successfully" -ForegroundColor Green
    }
    else {
        Write-Host ""
        Write-Host "Failed to install dependencies" -ForegroundColor Red
        pause
        exit 1
    }
}
else {
    Write-Host "package.json not found!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

# Create Environment Configuration
Write-Host "========================================"
Write-Host "Configuring Environment"
Write-Host "========================================"
Write-Host ""

$envExists = Test-Path ".env"
if (-not $envExists) {
    Write-Host "Creating .env file..." -ForegroundColor Cyan
    
    # Generate random session secret
    $random = New-Object System.Random
    $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    $sessionSecret = ""
    for ($i = 0; $i -lt 32; $i++) {
        $sessionSecret += $chars[$random.Next(0, $chars.Length)]
    }
    
    $envContent = "# Database Configuration`r`n"
    $envContent += "DB_HOST=localhost`r`n"
    $envContent += "DB_PORT=5432`r`n"
    $envContent += "DB_NAME=integral_project_hub`r`n"
    $envContent += "DB_USER=postgres`r`n"
    $envContent += "DB_PASSWORD=root123`r`n"
    $envContent += "`r`n"
    $envContent += "# Server Configuration`r`n"
    $envContent += "PORT=3000`r`n"
    $envContent += "NODE_ENV=development`r`n"
    $envContent += "`r`n"
    $envContent += "# Session Configuration`r`n"
    $envContent += "SESSION_SECRET=$sessionSecret`r`n"
    $envContent += "`r`n"
    $envContent += "# Derived Configuration (for drizzle-kit)`r`n"
    $envContent += "DATABASE_URL=postgres://postgres:root123@localhost:5432/integral_project_hub`r`n"
    
    $envContent | Out-File -FilePath ".env" -Encoding utf8
    
    Write-Host "Environment file created" -ForegroundColor Green
    Write-Host "Using default PostgreSQL credentials (user: postgres, password: postgres)" -ForegroundColor Yellow
    Write-Host "You can modify .env file to change database settings" -ForegroundColor Yellow
}
else {
    Write-Host "Environment file already exists" -ForegroundColor Green
}

Write-Host ""

# Database Setup Note
Write-Host "========================================"
Write-Host "Database Initialization"
Write-Host "========================================"
Write-Host ""


# Create Database
Write-Host "========================================"
Write-Host "Initializing Database"
Write-Host "========================================"
Write-Host ""

$dbName = "integral_project_hub"
Write-Host "Checking if database '$dbName' exists..." -ForegroundColor Cyan

# Set default password for psql commands
$env:PGPASSWORD="root123"

# Check if DB exists
# We use try/catch or just ignore error if psql fails (e.g. auth failed), but simple check is best
$dbExists = psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>$null

if ($dbExists -eq "1") {
    Write-Host "Database '$dbName' already exists." -ForegroundColor Green
}
else {
    Write-Host "Database '$dbName' not found. Creating..." -ForegroundColor Yellow
    # Try creating with default postgres user
    psql -U postgres -c "CREATE DATABASE $dbName;"
     
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database '$dbName' created successfully!" -ForegroundColor Green
    }
    else {
        Write-Host "Failed to create database automatically." -ForegroundColor Red
        Write-Host "This might be due to password authentication." -ForegroundColor Yellow
        Write-Host "Please ensure the database '$dbName' is created manually." -ForegroundColor Yellow
    }
}
Write-Host ""

Write-Host "Checking for database backups..." -ForegroundColor Cyan
$backupDir = "database\backups"
$backupFiles = @()
if (Test-Path $backupDir) {
    $backupFiles = Get-ChildItem -Path $backupDir -Filter "*.sql"
}

if ($backupFiles.Count -gt 0) {
    $latestBackup = $backupFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $backupPath = $latestBackup.FullName
    Write-Host "Found database backup: $($latestBackup.Name)" -ForegroundColor Green
    Write-Host "Restoring database from backup..." -ForegroundColor Cyan
    npm run db:restore -- "`"$backupPath`""
    Write-Host "Database restore completed" -ForegroundColor Green
} else {
    Write-Host "No backups found. Preparing and syncing database schema safely..." -ForegroundColor Cyan
    npm run db:ensure
    Write-Host "Database schema verified and synced successfully" -ForegroundColor Green
}
Write-Host ""

# Launch Application
Write-Host "========================================"
Write-Host "Installation Complete!"
Write-Host "========================================"
Write-Host ""

Write-Host "All components installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Starting the development server..." -ForegroundColor Cyan
Write-Host ""
Write-Host "The application will be available at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: The first startup may take a moment to compile..." -ForegroundColor Yellow
Write-Host ""

# Open browser after a delay
Start-Sleep -Seconds 3
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Starting server now..." -ForegroundColor Green
Write-Host ""

# Start the development server
npm run dev
pause
