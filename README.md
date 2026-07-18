# 🚂 DOOH Multi-Screen Platform v2.0

**Production-Ready Digital Advertising System for Railway Stations**

---

## 🎯 What's New in v2.0

| Feature | Demo (v1) | Production (v2) |
|---------|-----------|-----------------|
| **Multi-Screen** | Manual refresh | ✅ WebSocket real-time sync |
| **Connection** | No status | ✅ Visual connection indicator |
| **Fallback** | None | ✅ HTTP polling backup |
| **Queue Display** | No | ✅ Shows upcoming ads |
| **Screen IDs** | Manual | ✅ Auto-assigned |
| **Reconnect** | Manual | ✅ Auto-reconnect |
| **Logging** | No | ✅ Playback logs |

---

## 📦 Installation

### Step 1: Download/Extract

```bash
cd production-multi-screen
```

### Step 2: Run Setup

```bash
# Linux/Mac
chmod +x scripts/setup.sh
./scripts/setup.sh

# Windows
npm install
mkdir uploads data logs
```

### Step 3: Start Server

```bash
npm start
```

Server starts on:
- Local: http://localhost:3001
- Network: http://YOUR_IP:3001

---

## 🖥️ Multi-Laptop Setup

### Minimum Setup (3 Laptops)

| Laptop | Role | URL |
|--------|------|-----|
| **Laptop 1** | Server + Admin | http://localhost:3001/admin.html |
| **Laptop 2** | Screen - Platform 1 | `http://SERVER_IP:3001/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%201&screenId=CNB-P1` |
| **Laptop 3** | Screen - Platform 2 | `http://SERVER_IP:3001/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%202&screenId=CNB-P2` |

### Full Setup (11 Laptops - Kanpur Central)

```
Laptop 1:  Server + Admin Panel
Laptop 2:  Platform 1 Screen (CNB-P1)
Laptop 3:  Platform 2 Screen (CNB-P2)
Laptop 4:  Platform 3 Screen (CNB-P3)
Laptop 5:  Platform 4 Screen (CNB-P4)
Laptop 6:  Platform 5 Screen (CNB-P5)
Laptop 7:  Platform 6 Screen (CNB-P6)
Laptop 8:  Platform 7 Screen (CNB-P7)
Laptop 9:  Platform 8 Screen (CNB-P8)
Laptop 10: Platform 9 Screen (CNB-P9)
Laptop 11: Platform 10 Screen (CNB-P10)
```

---

## 🎬 Demo Script for Railway Officials

### Phase 1: Introduction (2 min)
```
"Sir, ye hamara DOOH platform hai. Multiple screens ek saath 
control ho sakti hain. Dekhiye..."

→ Show admin panel with screen status
→ Show all 10 platforms connected
```

### Phase 2: Live Booking (3 min)
```
"Ek customer ad book karta hai..."

1. Open booking.html
2. Upload video
3. Select: Kanpur Central → Platform 1
4. Complete payment
5. Show confirmation
```

### Phase 3: Magic Moment (2 min)
```
"Ab dekhiye Platform 1 ki screen..."

→ Switch to Laptop 2
→ Video automatically playing 🔴
→ Show queue: "Agla ad yeh hai"
```

### Phase 4: Admin Control (2 min)
```
"Aapke paas full control hai..."

→ Show screen status (online/offline)
→ Show revenue stats
→ Show playback logs
```

### Phase 5: Scale (1 min)
```
"Aur platforms bhi add kar sakte hain..."

→ Open Platform 2, 3, 4 screens
→ Show different content on each
```

---

## 🌟 Key Features

### 1. Real-Time Sync
- WebSocket connection
- Instant playlist updates
- No refresh needed

### 2. Connection Status
- 🟢 Connected
- 🟡 Connecting
- 🔴 Disconnected

### 3. Auto-Recovery
- Connection drop? Auto-reconnect in 5s
- WebSocket fail? HTTP polling backup
- Video error? Auto-skip to next

### 4. Queue Display
- Shows upcoming ads
- Current position highlighted
- Customer names visible

### 5. Playback Logging
- Every ad tracked
- Time-stamped
- Export for reporting

---

## 📋 Pre-Presentation Checklist

**1 Day Before:**
- [ ] All laptops charged
- [ ] WiFi/LAN tested
- [ ] Server IP noted
- [ ] URLs bookmarked on all laptops
- [ ] Test video ready (30 sec MP4)

**1 Hour Before:**
- [ ] Start server
- [ ] Open all player URLs
- [ ] Verify green "Connected" status
- [ ] Test one booking
- [ ] Fullscreen all screens

**Backup Plan:**
- [ ] Mobile hotspot ready
- [ ] HDMI cable (if TV available)
- [ ] Screenshot/video recording

---

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| Screen shows "Connecting..." | Check firewall, port 3001 |
| Video not loading | Check file exists in uploads/ |
| Laptop can't connect | Use IP instead of localhost |
| Server crash | Run `npm start` again |
| Booking not showing | Refresh player page |

---

## 💻 Development Commands

```bash
# Start server
npm start

# Development mode (auto-reload)
npm run dev

# Reset database
npm run reset

# Setup
npm run setup
```

---

## 📊 Production vs Demo

| Aspect | This Demo | Real Production |
|--------|-----------|-----------------|
| Database | JSON file | PostgreSQL |
| AI Moderation | 3s auto-approve | AWS Rekognition |
| Payment | Mock | Razorpay |
| Storage | Local folder | AWS S3 |
| Player | Browser | Android App |
| Scale | 10 screens | 1000+ screens |

---

## 🎁 What You Get

✅ Complete working system  
✅ Multi-screen architecture  
✅ WebSocket real-time sync  
✅ Admin dashboard  
✅ Booking system  
✅ Player with queue  
✅ Setup scripts  
✅ Documentation  

---

## 📝 Next Steps

1. **Test locally** with 2-3 laptops
2. **Practice demo flow** 3-4 times
3. **Prepare pitch deck** with screenshots
4. **Contact railway officials** for meeting
5. **Show demo** → Get feedback → Iterate

---

## 🙏 Credits

Built for Indian Railways Digital Advertising Initiative

---

**Ready to revolutionize railway advertising!** 🚀
