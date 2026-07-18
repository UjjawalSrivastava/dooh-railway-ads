#!/bin/bash

# DOOH Multi-Screen Platform - Setup Script
# Run this script to setup the production environment

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     DOOH Platform - Multi-Screen Setup                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found."
    exit 1
fi

echo "✅ npm version: $(npm -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p uploads data logs

# Get IP address
echo ""
echo "🌐 Network Information:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# For different OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    IP=$(hostname -I | awk '{print $1}')
elif [[ "$OSTYPE" == "darwin"* ]]; then
    IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    IP=$(ipconfig | grep "IPv4" | head -n 1 | awk '{print $NF}')
else
    IP="YOUR_IP_ADDRESS"
fi

echo "Server IP: $IP"
echo "Port: 3001"
echo ""

# Generate screen URLs
echo "📺 Screen URLs for Multi-Laptop Setup:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in {1..10}; do
    echo "Platform $i: http://$IP:3001/player.html?station=Kanpur%20Central%20(CNB)\&platform=Platform%20$i\&screenId=CNB-P$i"
done

echo ""
echo "🔧 Admin Panel: http://$IP:3001/admin.html"
echo "📝 Booking Page: http://$IP:3001/player/booking.html"
echo ""

# Create startup script
cat > start-server.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "Starting DOOH Multi-Screen Server..."
node server/server.js
EOF

chmod +x start-server.sh

# Create Windows startup script
cat > start-server.bat << 'EOF'
@echo off
echo Starting DOOH Multi-Screen Server...
node server/server.js
pause
EOF

echo "✅ Setup complete!"
echo ""
echo "🚀 To start the server:"
echo "   Linux/Mac: ./start-server.sh"
echo "   Windows:   start-server.bat"
echo ""
echo "📖 For detailed instructions, see docs/SETUP_GUIDE.md"
