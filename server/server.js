/**
 * DOOH Platform - Production Multi-Screen Server
 * Railway Station Ad System with Multi-Display Support
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../player')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root route - redirect to booking page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../player/booking.html'));
});

// Admin route - serve admin.html
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/admin.html'));
});

// Ensure directories exist
['../uploads', '../data'].forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// Database paths
const DB_PATH = path.join(__dirname, '../data/database.json');
const SCREENS_PATH = path.join(__dirname, '../data/screens.json');
const LOGS_PATH = path.join(__dirname, '../data/playback-logs.json');

// Initialize databases
function initDatabases() {
    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            locations: {
                'Delhi': {
                    'New Delhi': {
                        'New Delhi Junction': {
                            platforms: {
                                'Platform 1': { footfall: 'very-high', pricePerHour: 100, type: 'premium', screenId: 'NDLS-P1' },
                                'Platform 2': { footfall: 'very-high', pricePerHour: 100, type: 'premium', screenId: 'NDLS-P2' },
                                'Platform 3': { footfall: 'high', pricePerHour: 80, type: 'premium', screenId: 'NDLS-P3' },
                                'Platform 4': { footfall: 'high', pricePerHour: 70, type: 'standard', screenId: 'NDLS-P4' },
                                'Platform 5': { footfall: 'medium', pricePerHour: 50, type: 'standard', screenId: 'NDLS-P5' },
                                'Platform 6': { footfall: 'low', pricePerHour: 30, type: 'economy', screenId: 'NDLS-P6' }
                            }
                        }
                    }
                },
                'Uttar Pradesh': {
                    'Kanpur': {
                        'Kanpur Central (CNB)': {
                            platforms: {
                                'Platform 1': { footfall: 'very-high', pricePerHour: 80, type: 'premium', screenId: 'CNB-P1' },
                                'Platform 2': { footfall: 'very-high', pricePerHour: 80, type: 'premium', screenId: 'CNB-P2' },
                                'Platform 3': { footfall: 'high', pricePerHour: 65, type: 'premium', screenId: 'CNB-P3' },
                                'Platform 4': { footfall: 'high', pricePerHour: 60, type: 'standard', screenId: 'CNB-P4' },
                                'Platform 5': { footfall: 'high', pricePerHour: 55, type: 'standard', screenId: 'CNB-P5' },
                                'Platform 6': { footfall: 'medium', pricePerHour: 40, type: 'standard', screenId: 'CNB-P6' },
                                'Platform 7': { footfall: 'medium', pricePerHour: 35, type: 'economy', screenId: 'CNB-P7' },
                                'Platform 8': { footfall: 'low', pricePerHour: 30, type: 'economy', screenId: 'CNB-P8' },
                                'Platform 9': { footfall: 'low', pricePerHour: 25, type: 'economy', screenId: 'CNB-P9' },
                                'Platform 10': { footfall: 'low', pricePerHour: 25, type: 'economy', screenId: 'CNB-P10' }
                            }
                        }
                    }
                }
            },
            bookings: [],
            ads: [],
            admin: { username: 'admin', password: 'admin123' }
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    }

    if (!fs.existsSync(SCREENS_PATH)) {
        const screensData = {
            screens: {},
            activeConnections: {}
        };
        fs.writeFileSync(SCREENS_PATH, JSON.stringify(screensData, null, 2));
    }

    if (!fs.existsSync(LOGS_PATH)) {
        fs.writeFileSync(LOGS_PATH, JSON.stringify({ logs: [] }, null, 2));
    }
}

function getDatabase() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDatabase(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getScreens() {
    return JSON.parse(fs.readFileSync(SCREENS_PATH, 'utf8'));
}

function saveScreens(data) {
    fs.writeFileSync(SCREENS_PATH, JSON.stringify(data, null, 2));
}

function logPlayback(screenId, bookingId, status) {
    const logs = JSON.parse(fs.readFileSync(LOGS_PATH, 'utf8'));
    logs.logs.push({
        screenId,
        bookingId,
        status,
        timestamp: new Date().toISOString()
    });
    fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2));
}

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files allowed'));
        }
    }
});

// WebSocket for real-time screen sync
const screens = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const screenId = url.searchParams.get('screenId');
    const station = url.searchParams.get('station');
    const platform = url.searchParams.get('platform');

    if (screenId) {
        screens.set(screenId, { ws, station, platform, connectedAt: new Date() });
        console.log(`Screen connected: ${screenId} (${station} - ${platform})`);

        // Update screen status
        const screensData = getScreens();
        screensData.screens[screenId] = {
            station,
            platform,
            status: 'online',
            lastSeen: new Date().toISOString()
        };
        saveScreens(screensData);

        // Send current playlist
        sendPlaylistToScreen(screenId);
    }

    ws.on('close', () => {
        if (screenId) {
            screens.delete(screenId);
            const screensData = getScreens();
            if (screensData.screens[screenId]) {
                screensData.screens[screenId].status = 'offline';
                screensData.screens[screenId].lastSeen = new Date().toISOString();
                saveScreens(screensData);
            }
            console.log(`Screen disconnected: ${screenId}`);
        }
    });
});

function sendPlaylistToScreen(screenId) {
    const screen = screens.get(screenId);
    if (!screen) return;

    const { station, platform } = screen;
    const playlist = getPlaylistForScreen(station, platform);

    screen.ws.send(JSON.stringify({
        type: 'playlist',
        data: playlist
    }));
}

function getPlaylistForScreen(station, platform) {
    const db = getDatabase();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    const activeBookings = db.bookings.filter(b =>
        b.station === station &&
        b.platforms.includes(platform) &&
        b.paymentStatus === 'completed' &&
        b.date === today &&
        parseInt(b.startTime) <= currentHour &&
        parseInt(b.startTime) + parseInt(b.hours) > currentHour
    );

    return activeBookings.map(b => {
        const ad = db.ads.find(a => a.id === b.adId);
        return {
            bookingId: b.id,
            videoUrl: ad ? ad.path : null,
            duration: ad ? ad.duration : 30,
            customerName: b.customerName,
            startTime: b.startTime,
            hours: b.hours
        };
    });
}

// Broadcast to all screens
function broadcastToScreens(station, platform, message) {
    screens.forEach((screen, screenId) => {
        if (screen.station === station && screen.platform === platform) {
            if (screen.ws.readyState === WebSocket.OPEN) {
                screen.ws.send(JSON.stringify(message));
            }
        }
    });
}

// API Routes

// Get all screens status
app.get('/api/screens', (req, res) => {
    const screensData = getScreens();
    const db = getDatabase();

    const screensWithDetails = Object.entries(screensData.screens).map(([id, screen]) => {
        const location = findLocationByScreenId(db, id);
        return {
            id,
            ...screen,
            ...location,
            isOnline: screens.has(id)
        };
    });

    res.json(screensWithDetails);
});

function findLocationByScreenId(db, screenId) {
    for (const [state, districts] of Object.entries(db.locations)) {
        for (const [district, stations] of Object.entries(districts)) {
            for (const [stationName, stationData] of Object.entries(stations)) {
                for (const [platformName, platformData] of Object.entries(stationData.platforms)) {
                    if (platformData.screenId === screenId) {
                        return { state, district, station: stationName, platform: platformName };
                    }
                }
            }
        }
    }
    return null;
}

// Get locations
app.get('/api/locations', (req, res) => {
    const db = getDatabase();
    res.json(db.locations);
});

// Calculate price
app.post('/api/calculate-price', (req, res) => {
    const { state, district, station, platforms, hours, primeTime } = req.body;
    const db = getDatabase();

    const stationData = db.locations[state]?.[district]?.[station];
    if (!stationData) {
        return res.status(404).json({ error: 'Station not found' });
    }

    let totalPrice = 0;
    const platformDetails = [];

    platforms.forEach(platformName => {
        const platform = stationData.platforms[platformName];
        if (platform) {
            let price = platform.pricePerHour * hours;
            if (primeTime) {
                price *= 1.5;
            }
            totalPrice += price;
            platformDetails.push({
                name: platformName,
                type: platform.type,
                footfall: platform.footfall,
                pricePerHour: platform.pricePerHour,
                hours,
                primeTime: primeTime || false,
                subtotal: price,
                screenId: platform.screenId
            });
        }
    });

    const gst = totalPrice * 0.18;
    const grandTotal = totalPrice + gst;

    res.json({
        platforms: platformDetails,
        subtotal: totalPrice,
        gst,
        total: grandTotal,
        currency: 'INR'
    });
});

// Upload video with error handling
app.post('/api/upload', (req, res) => {
    upload.single('video')(req, res, (err) => {
        if (err) {
            console.error('Upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    error: 'File too large. Max 500MB allowed.',
                    code: 'FILE_TOO_LARGE'
                });
            }
            if (err.message === 'Only video files allowed') {
                return res.status(400).json({
                    error: 'Only video files (MP4, MOV, AVI) are allowed.',
                    code: 'INVALID_FILE_TYPE'
                });
            }
            return res.status(500).json({
                error: 'Upload failed. Please try again.',
                code: 'UPLOAD_ERROR'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: 'No video file received.',
                code: 'NO_FILE'
            });
        }

        try {
            const adId = uuidv4();
            const db = getDatabase();

            const ad = {
                id: adId,
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: `/uploads/${req.file.filename}`,
                size: req.file.size,
                uploadedAt: new Date().toISOString(),
                status: 'pending',
                moderationResult: null,
                duration: req.body.duration || 30
            };

            db.ads.push(ad);
            saveDatabase(db);

            // Simulate AI moderation
            setTimeout(() => runAIModeration(adId), 2000);

            res.json({
                success: true,
                adId,
                message: 'Video uploaded successfully. AI moderation in progress...'
            });
        } catch (error) {
            console.error('Server error during upload:', error);
            res.status(500).json({
                error: 'Server error. Please try again.',
                code: 'SERVER_ERROR'
            });
        }
    });
});

function runAIModeration(adId) {
    const db = getDatabase();
    const ad = db.ads.find(a => a.id === adId);

    if (ad) {
        ad.status = 'analyzing';
        saveDatabase(db);

        setTimeout(() => {
            const db2 = getDatabase();
            const ad2 = db2.ads.find(a => a.id === adId);

            if (ad2) {
                const isApproved = Math.random() > 0.1;
                ad2.status = isApproved ? 'approved' : 'rejected';
                ad2.moderationResult = {
                    checkedAt: new Date().toISOString(),
                    nsfw: false,
                    violence: false,
                    political: false,
                    confidence: 0.98,
                    approved: isApproved,
                    reason: isApproved ? 'Content meets guidelines' : 'Low quality content'
                };
                saveDatabase(db2);
            }
        }, 3000);
    }
}

// Get ad status
app.get('/api/ad/:adId/status', (req, res) => {
    const db = getDatabase();
    const ad = db.ads.find(a => a.id === req.params.adId);

    if (!ad) {
        return res.status(404).json({ error: 'Ad not found' });
    }

    res.json({
        adId: ad.id,
        status: ad.status,
        moderationResult: ad.moderationResult,
        previewUrl: ad.path
    });
});

// Create booking
app.post('/api/book', (req, res) => {
    const { adId, state, district, station, platforms, hours, startTime, date, primeTime,
            customerName, customerEmail, customerPhone, priceDetails } = req.body;

    const db = getDatabase();
    const ad = db.ads.find(a => a.id === adId);

    if (!ad || ad.status !== 'approved') {
        return res.status(400).json({ error: 'Ad not approved' });
    }

    // Check for existing bookings in same slot (for information)
    const existingBookings = db.bookings.filter(b =>
        b.station === station &&
        b.platforms.some(p => platforms.includes(p)) &&
        b.date === date &&
        parseInt(b.startTime) <= parseInt(startTime) + parseInt(hours) &&
        parseInt(b.startTime) + parseInt(b.hours) > parseInt(startTime) &&
        b.paymentStatus === 'completed'
    );

    const bookingId = 'BK' + Date.now().toString(36).toUpperCase();

    const booking = {
        id: bookingId,
        adId,
        state, district, station, platforms,
        hours, startTime, date, primeTime,
        customerName, customerEmail, customerPhone,
        priceDetails,
        paymentStatus: 'pending',
        bookingStatus: 'pending',
        createdAt: new Date().toISOString(),
        scheduledAt: null,
        completedAt: null
    };

    db.bookings.push(booking);
    ad.status = 'scheduled';
    ad.bookingId = bookingId;

    saveDatabase(db);

    // Prepare message
    let message = 'Booking created';
    if (existingBookings.length > 0) {
        message = `Booking created. Your ad will be in rotation with ${existingBookings.length} other ad(s) during this time slot.`;
    }

    res.json({
        success: true,
        bookingId,
        message,
        existingAds: existingBookings.length,
        rotationEnabled: true
    });
});

// Process payment
app.post('/api/payment', (req, res) => {
    const { bookingId, paymentMethod } = req.body;
    const db = getDatabase();
    const booking = db.bookings.find(b => b.id === bookingId);

    if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
    }

    setTimeout(() => {
        const db2 = getDatabase();
        const booking2 = db2.bookings.find(b => b.id === bookingId);

        if (booking2) {
            booking2.paymentStatus = 'completed';
            booking2.bookingStatus = 'confirmed';
            booking2.paymentMethod = paymentMethod;
            booking2.paidAt = new Date().toISOString();
            saveDatabase(db2);

            // Notify screens
            booking2.platforms.forEach(platform => {
                broadcastToScreens(booking2.station, platform, {
                    type: 'new-booking',
                    bookingId: booking2.id
                });
            });
        }
    }, 1500);

    res.json({
        success: true,
        transactionId: 'TXN' + Date.now(),
        message: 'Payment processed'
    });
});

// Get booking
app.get('/api/booking/:bookingId', (req, res) => {
    const db = getDatabase();
    const booking = db.bookings.find(b => b.id === req.params.bookingId);

    if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
    }

    const ad = db.ads.find(a => a.id === booking.adId);

    res.json({
        ...booking,
        ad: ad ? { path: ad.path, duration: ad.duration } : null
    });
});

// Get playlist for player (HTTP polling fallback)
app.get('/api/player/:station/:platform/playlist', (req, res) => {
    const { station, platform } = req.params;
    const playlist = getPlaylistForScreen(station, platform);

    res.json({
        station,
        platform,
        currentTime: new Date().toISOString(),
        playlist: playlist.length > 0 ? playlist : [{
            type: 'filler',
            message: 'No active ads'
        }]
    });
});

// Admin routes
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDatabase();

    if (username === db.admin.username && password === db.admin.password) {
        res.json({ success: true, token: 'admin-token-' + Date.now() });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/admin/bookings', (req, res) => {
    const db = getDatabase();
    const bookings = db.bookings.map(b => {
        const ad = db.ads.find(a => a.id === b.adId);
        return { ...b, ad: ad ? { path: ad.path, status: ad.status } : null };
    });
    res.json(bookings);
});

app.get('/api/admin/stats', (req, res) => {
    const db = getDatabase();
    const screensData = getScreens();

    const totalBookings = db.bookings.length;
    const totalRevenue = db.bookings
        .filter(b => b.paymentStatus === 'completed')
        .reduce((sum, b) => sum + (b.priceDetails?.total || 0), 0);
    const pendingAds = db.ads.filter(a => a.status === 'pending').length;
    const approvedAds = db.ads.filter(a => a.status === 'approved').length;
    const scheduledAds = db.ads.filter(a => a.status === 'scheduled').length;
    const onlineScreens = Array.from(screens.values()).filter(s => s.ws.readyState === WebSocket.OPEN).length;

    res.json({
        totalBookings,
        totalRevenue,
        pendingAds,
        approvedAds,
        scheduledAds,
        activeStations: 2,
        totalPlatforms: 16,
        onlineScreens,
        totalScreens: Object.keys(screensData.screens).length
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Server error' });
});

// Initialize and start
initDatabases();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     DOOH Platform - Production Multi-Screen Server         ║
╚════════════════════════════════════════════════════════════╝

🌐 Server running on:
   Local:   http://localhost:${PORT}
   Network: http://0.0.0.0:${PORT}

📺 Screen URLs:
   Kanpur Platform 1:  http://YOUR_IP:${PORT}/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%201&screenId=CNB-P1
   Kanpur Platform 2:  http://YOUR_IP:${PORT}/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%202&screenId=CNB-P2
   ...
   Kanpur Platform 10: http://YOUR_IP:${PORT}/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%2010&screenId=CNB-P10

🔧 Admin Panel: http://YOUR_IP:${PORT}/admin.html

💡 Multi-Screen Setup:
   1. Find your IP: ipconfig (Windows) / ifconfig (Mac/Linux)
   2. Open player URLs on different laptops
   3. Each screen auto-connects via WebSocket
   4. Ads sync automatically across all screens

⚡ Features:
   ✓ WebSocket real-time sync
   ✓ HTTP polling fallback
   ✓ Screen status monitoring
   ✓ Playback logging
   ✓ Multi-platform support

═══════════════════════════════════════════════════════════════
    `);
});
