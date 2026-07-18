# 🚂 DOOH Multi-Screen Platform - Production Ready

Complete Digital Out-of-Home advertising system with multi-screen support for railway stations.

## ✨ Features

- ✅ **Multi-Screen Support** - Connect unlimited screens/laptops
- ✅ **Real-time Sync** - WebSocket + HTTP fallback
- ✅ **Screen Management** - Monitor all screens from admin panel
- ✅ **Auto-Reconnect** - Screens reconnect automatically if connection drops
- ✅ **Queue Display** - Show upcoming ads on screen
- ✅ **Connection Status** - Visual indicator of screen connectivity
- ✅ **Playback Logging** - Track every ad that plays

## 🏗️ Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Laptop 1      │      │   Laptop 2      │      │   Laptop 3      │
│   (Server)      │◄────►│   (Screen P1)   │◄────►│   (Screen P2)   │
│                 │      │                 │      │                 │
│ - Admin Panel   │      │ - Player View   │      │ - Player View   │
│ - Booking Form  │      │ - WebSocket     │      │ - WebSocket     │
│ - Database      │      │ - Auto-sync     │      │ - Auto-sync     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │
        │ (More screens...)
        ▼
┌─────────────────┐
│   Laptop N      │
│   (Screen PN)   │
└─────────────────┘
```

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 16+ installed
- 2 or more laptops for multi-screen demo
- Same WiFi network or LAN connection

### 2. Installation

```bash
# Clone or extract the project
cd production-multi-screen

# Run setup script
chmod +x scripts/setup.sh
./scripts/setup.sh

# Or manually:
npm install
mkdir -p uploads data logs
```

### 3. Start Server

```bash
# Option 1: Using npm
npm start

# Option 2: Using script
./start-server.sh

# Option 3: Direct
node server/server.js
```

### 4. Access URLs

After starting, you'll see:

```
Server running on:
   Local:   http://localhost:3001
   Network: http://192.168.1.105:3001  (Your IP)
```

## 📺 Multi-Screen Setup

### Scenario: Kanpur Central with 10 Platforms

**Laptop 1 (Server + Admin)**
```
URL: http://localhost:3001/admin.html
Role: Admin panel + booking management
```

**Laptop 2 (Platform 1 Screen)**
```
URL: http://192.168.1.105:3001/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%201&screenId=CNB-P1
Role: Display ads for Platform 1
```

**Laptop 3 (Platform 2 Screen)**
```
URL: http://192.168.1.105:3001/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%202&screenId=CNB-P2
Role: Display ads for Platform 2
```

**Laptop 4-11 (Platforms 3-10)**
```
Follow same pattern, change platform number and screenId
```

### URL Format

```
http://SERVER_IP:3001/player.html?station=STATION_NAME&platform=PLATFORM_NAME&screenId=SCREEN_ID
```

**Examples:**
- Platform 1: `...player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%201&screenId=CNB-P1`
- Platform 2: `...player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%202&screenId=CNB-P2`
- Platform 10: `...player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%2010&screenId=CNB-P10`

## 🎬 Demo Flow

### Step 1: Setup All Screens

1. Start server on Laptop 1
2. Open player URLs on all other laptops
3. Each screen shows: "Waiting for advertisements..."

### Step 2: Create Booking

1. On Laptop 1, open booking page: `http://localhost:3001/player/booking.html`
2. Upload video
3. Select: Uttar Pradesh → Kanpur → Kanpur Central → Platform 1
4. Complete payment

### Step 3: Watch Sync

1. Laptop 2 (Platform 1) automatically starts playing the ad
2. 🔴 LIVE badge appears
3. Queue shows upcoming ads
4. Other screens remain on default content

### Step 4: Admin Monitoring

1. Open admin panel
2. See all connected screens
3. View playback logs
4. Monitor revenue

## 🛠️ Configuration

### Adding New Stations

Edit `data/database.json`:

```json
{
  "locations": {
    "Your State": {
      "Your City": {
        "Your Station": {
          "platforms": {
            "Platform 1": {
              "footfall": "very-high",
              "pricePerHour": 100,
              "type": "premium",
              "screenId": "STATION-P1"
            }
          }
        }
      }
    }
  }
}
```

### Screen ID Format

Recommended: `STATIONCODE-PLATFORM`
- Kanpur Platform 1: `CNB-P1`
- Kanpur Platform 2: `CNB-P2`
- Delhi Platform 1: `NDLS-P1`

## 🔧 Troubleshooting

### Screens Not Connecting

1. Check firewall settings
2. Ensure port 3001 is open
3. Try accessing via IP: `http://SERVER_IP:3001`

### Video Not Playing

1. Check browser console for errors
2. Ensure video format is MP4
3. Try clicking on screen to enable audio

### Connection Drops

- System auto-reconnects in 5 seconds
- Falls back to HTTP polling if WebSocket fails

### Multiple Screens on Same Laptop

Open different browsers or incognito windows:
- Chrome: Platform 1
- Firefox: Platform 2
- Chrome Incognito: Platform 3

## 📊 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |
| `Space` | Play/Pause |
| `M` | Toggle mute |
| `D` | Toggle debug stats |
| `R` | Force refresh playlist |

## 🔒 Production Checklist

Before real deployment:

- [ ] Replace JSON database with PostgreSQL
- [ ] Integrate real AI moderation (AWS Rekognition)
- [ ] Add Razorpay/Stripe payment
- [ ] Setup AWS S3 for video storage
- [ ] Add user authentication
- [ ] Enable HTTPS/WSS
- [ ] Add SMS/Email notifications
- [ ] Create Android player app
- [ ] Setup monitoring & alerts

## 📁 Folder Structure

```
production-multi-screen/
├── server/
│   └── server.js          # Main server with WebSocket
├── player/
│   ├── player.html        # Screen display
│   └── booking.html       # User booking form
├── admin/
│   └── admin.html         # Admin dashboard
├── uploads/               # Video storage
├── data/                  # Database files
├── logs/                  # Playback logs
├── scripts/
│   └── setup.sh           # Setup script
├── docs/
│   └── SETUP_GUIDE.md     # This file
├── package.json
└── README.md
```

## 💡 Tips for Railway Pitch

1. **Use 3-4 laptops minimum** for impressive demo
2. **Book ad on Platform 1**, show it playing on Laptop 2
3. **Show admin panel** on Laptop 1 with real-time stats
4. **Highlight auto-sync** - no manual refresh needed
5. **Show connection status** - proves reliability

## 📞 Support

For issues or questions:
1. Check browser console for errors
2. Verify all laptops on same network
3. Ensure port 3001 not blocked by firewall

---

**Ready to deploy!** 🚀
