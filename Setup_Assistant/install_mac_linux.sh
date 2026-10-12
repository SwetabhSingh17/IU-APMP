#!/bin/bash

# ============================================================================
# IU-APMP (Integral University Academic Project Management Portal v2.3.1) - Automatic Installation Script
# Created by: Swetabh Singh
# For macOS and Linux Systems
# ============================================================================

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ============================================================================
# Check System Type
# ============================================================================

print_header "Detecting Your System"

if [[ "$OSTYPE" == "darwin"* ]]; then
    SYSTEM="mac"
    print_success "macOS detected"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    SYSTEM="linux"
    print_success "Linux detected"
else
    print_error "Unsupported operating system: $OSTYPE"
    exit 1
fi

# ============================================================================
# Node.js Installation
# ============================================================================

print_header "Checking Node.js Installation"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js is already installed: $NODE_VERSION"
    
    # Check if version is sufficient (v16+)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -lt 16 ]; then
        print_warning "Node.js version is below v16. Upgrading recommended..."
    fi
else
    print_warning "Node.js not found. Installing..."
    
    if [ "$SYSTEM" = "mac" ]; then
        # Check if Homebrew is installed
        if ! command -v brew &> /dev/null; then
            print_info "Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        
        print_info "Installing Node.js via Homebrew..."
        brew install node
        
    else  # Linux
        print_info "Installing Node.js via NVM (Node Version Manager)..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        
        # Load NVM
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        
        # Install Node.js LTS
        nvm install --lts
        nvm use --lts
    fi
    
    # Verify installation
    if command -v node &> /dev/null; then
        print_success "Node.js installed successfully: $(node --version)"
    else
        print_error "Node.js installation failed!"
        echo ""
        echo "Please install Node.js manually from: https://nodejs.org/"
        exit 1
    fi
fi

# ============================================================================
# PostgreSQL Installation
# ============================================================================

print_header "Checking PostgreSQL Installation"

if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version)
    print_success "PostgreSQL is already installed: $PSQL_VERSION"
else
    print_warning "PostgreSQL not found. Installing..."
    
    if [ "$SYSTEM" = "mac" ]; then
        print_info "Installing PostgreSQL via Homebrew..."
        brew install postgresql@15
        
        # Start PostgreSQL service
        brew services start postgresql@15
        
        # Add to PATH
        export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
        
    else  # Linux
        print_info "Installing PostgreSQL via package manager..."
        
        # Detect Linux distribution
        if [ -f /etc/debian_version ]; then
            # Debian/Ubuntu
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
        elif [ -f /etc/redhat-release ]; then
            # RHEL/CentOS/Fedora
            sudo yum install -y postgresql-server postgresql-contrib
            sudo postgresql-setup --initdb
        else
            print_error "Unable to detect Linux distribution"
            echo "Please install PostgreSQL manually and run this script again."
            exit 1
        fi
        
        # Start PostgreSQL service
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
    fi
    
    # Wait for PostgreSQL to start
    sleep 3
    
    # Verify installation
    if command -v psql &> /dev/null; then
        print_success "PostgreSQL installed successfully"
    else
        print_error "PostgreSQL installation failed!"
        echo ""
        echo "Please install PostgreSQL manually from: https://www.postgresql.org/download/"
        exit 1
    fi
fi

# ============================================================================
# Navigate to Project Directory
# ============================================================================

print_header "Setting Up Project"

# Go to project root (one level up from Setup_Assistant)
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)
print_info "Project directory: $PROJECT_ROOT"

# ============================================================================
# Install Project Dependencies
# ============================================================================

print_header "Installing Project Dependencies"

if [ -f "package.json" ]; then
    print_info "Running npm install... (this may take a few minutes)"
    npm install
    print_success "Dependencies installed successfully"
else
    print_error "package.json not found!"
    exit 1
fi

# ============================================================================
# Create Environment Configuration
# ============================================================================

print_header "Configuring Environment"

if [ ! -f ".env" ]; then
    print_info "Creating .env file..."
    
    # Generate random session secret
    SESSION_SECRET=$(openssl rand -base64 32)
    
    cat > .env << EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=integral_project_hub
DB_USER=postgres
DB_PASSWORD=

# Server Configuration
PORT=3000
NODE_ENV=development

# Session Configuration
SESSION_SECRET=$SESSION_SECRET

# Derived Configuration (for drizzle-kit)
DATABASE_URL=postgres://postgres:@localhost:5432/integral_project_hub
EOF
    
    print_success "Environment file created"
    print_warning "Using default PostgreSQL credentials (no password)"
    print_warning "You can modify .env file to change database settings"
else
    print_success "Environment file already exists"
fi

# ============================================================================
# Initialize Database
# ============================================================================

print_header "Initializing Database"

# Source environment variables
export $(cat .env | grep -v '^#' | xargs)

# Default values
DB_NAME=${DB_NAME:-integral_project_hub}
DB_USER=${DB_USER:-postgres}

print_info "Creating database: $DB_NAME"

# Check if database exists
if [ "$SYSTEM" = "mac" ]; then
    DB_EXISTS=$(psql -U $DB_USER -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw $DB_NAME && echo "yes" || echo "no")
else
    DB_EXISTS=$(sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw $DB_NAME && echo "yes" || echo "no")
fi

if [ "$DB_EXISTS" = "no" ]; then
    if [ "$SYSTEM" = "mac" ]; then
        createdb -U $DB_USER $DB_NAME 2>/dev/null || print_warning "Database may already exist"
    else
        sudo -u postgres createdb $DB_NAME 2>/dev/null || print_warning "Database may already exist"
    fi
    print_success "Database created: $DB_NAME"
else
    print_success "Database already exists: $DB_NAME"
fi

# Check for backups
print_info "Checking for database backups..."
BACKUP_DIR="database/backups"
SKIP_PUSH=false

if [ -d "$BACKUP_DIR" ]; then
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | head -n 1 || true)
    if [ -n "$LATEST_BACKUP" ]; then
        print_success "Found database backup: $(basename "$LATEST_BACKUP")"
        print_info "Restoring database from backup..."
        npm run db:restore -- "$LATEST_BACKUP"
        if [ $? -eq 0 ]; then
            print_success "Database restore completed"
            SKIP_PUSH=true
        else
            print_warning "Database restore failed, falling back to schema sync"
        fi
    fi
fi

if [ "$SKIP_PUSH" = false ]; then
    # Safely prepare and sync database schema using Drizzle (creates schema and default admin without wiping data)
    print_info "Preparing and syncing database schema safely..."
    npm run db:ensure
    if [ $? -eq 0 ]; then
        print_success "Database schema verified and synced successfully"
    else
        print_warning "Database verification failed or skipped"
    fi
fi

# ============================================================================
# Launch Application
# ============================================================================

print_header "🎉 Installation Complete!"

echo -e "${GREEN}Created by: Swetabh Singh${NC}"
echo ""

print_success "All components installed successfully!"
echo ""
print_info "Starting the development server..."
echo ""
print_info "The application will be available at: http://localhost:3000"
print_info "Press Ctrl+C to stop the server"
echo ""
print_warning "Note: The first startup may take a moment to compile..."
echo ""

# Start the development server
npm run dev
