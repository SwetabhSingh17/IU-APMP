#!/bin/bash

# ============================================================================
# IU-APMP (Integral University Academic Project Management Portal v2.3.1)
# Network Access Server Launcher
# ============================================================================

# Detect local IP address across macOS and Linux
IP=""
if command -v ipconfig &>/dev/null && [ "$(uname)" = "Darwin" ]; then
    IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
fi
if [ -z "$IP" ] && command -v hostname &>/dev/null; then
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$IP" ] && command -v ip &>/dev/null; then
    IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
fi
if [ -z "$IP" ] && command -v ifconfig &>/dev/null; then
    IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
fi
if [ -z "$IP" ]; then
    IP="localhost"
fi

echo "========================================="
echo "Starting IU-APMP Server for Network (v2.3.1)"
echo "========================================="
echo ""
echo "Local IP Address: $IP"
echo ""
echo "Access URLs:"
echo "  - On this machine: http://localhost:3000"
echo "  - From other devices: http://$IP:3000"
echo ""
echo "========================================="
echo ""

# Set environment and start server
export NODE_ENV=development
npm run dev
