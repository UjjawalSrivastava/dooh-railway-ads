/**
 * DOOH Platform - Production Multi-Screen Server
 * Railway Station Ad System with Multi-Display Support
 * SQLite Persistence Enabled
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const { connectDB, dbHelpers, DB_PATH } = require('./db-sqlite');
// const setupWizard = require('./setup');  // Temporarily disabled

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3002;

// Static locations data (in-memory config)
const LOCATIONS = {
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
};

// Admin credentials
const ADMIN_CREDS = {
    username: 'admin',
    password: 'admin123'
};

// Middleware
app.use(cors());
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, '../player')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config - platform-specific subfolders
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let platforms = ['default'];
        try {
            if (req.body.platforms) {
                platforms = JSON.parse(req.body.platforms);
            }
        } catch (e) {
            console.error('Failed to parse platforms:', e);
        }

        const primaryPlatform = platforms[0] || 'default';
        const platformFolder = primaryPlatform.replace(/\s+/g, '_');
        const uploadPath = path.join(__dirname, '../uploads', platformFolder);

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        req.platforms = platforms;
        req.platformFolder = platformFolder;
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 },
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

        // Update screen status in DB
        dbHelpers.updateScreen(screenId, { station, platform, status: 'online', connectedAt: new Date() });

        sendPlaylistToScreen(screenId);
    }

    ws.on('close', () => {
        if (screenId) {
            screens.delete(screenId);
            dbHelpers.updateScreen(screenId, { status: 'offline' });
        }
    });
});

async function sendPlaylistToScreen(screenId) {
    const screen = screens.get(screenId);
    if (!screen) return;

    const { station, platform } = screen;
    const playlist = await getPlaylistForScreen(station, platform);

    if (screen.ws.readyState === WebSocket.OPEN) {
        screen.ws.send(JSON.stringify({
            type: 'playlist',
            data: playlist
        }));
    }
}

async function getPlaylistForScreen(station, platform) {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split('T')[0];
    const currentHour = istDate.getUTCHours();
    const currentMinute = istDate.getUTCMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute; // Total minutes since midnight


    let bookings = [];
    let ads = [];

    const bookingsResult = await dbHelpers.getBookings({ limit: 1000 });
    const adsResult = await dbHelpers.getAds({ limit: 1000 });
    bookings = bookingsResult.bookings || [];
    ads = adsResult.ads || [];

    // 1) Find active bookings

    // Debug: Log all bookings for this station
    const stationBookings = bookings.filter(b => b.station === station);
    stationBookings.forEach((b, i) => {
        const startParts = String(b.startTime).split(':');
        const startHour = parseInt(startParts[0]) || 0;
        const startMin = parseInt(startParts[1]) || 0;
        const endHour = startHour + parseFloat(b.hours);
    });

    const activeBookings = bookings.filter(b => {
        const stationMatch = b.station === station;
        const platformMatch = Array.isArray(b.platforms) && b.platforms.includes(platform);
        const paymentMatch = b.paymentStatus === 'completed';
        const dateMatch = b.date === today;

        // Parse start time (format: "HH:MM" or "HH")
        const startTimeParts = String(b.startTime).split(':');
        const startHour = parseInt(startTimeParts[0]) || 0;
        const startMinute = parseInt(startTimeParts[1]) || 0;
        const startTimeMinutes = startHour * 60 + startMinute;
        const endTimeMinutes = startTimeMinutes + (parseFloat(b.hours) * 60);

        const timeMatch = startTimeMinutes <= currentTimeMinutes && endTimeMinutes > currentTimeMinutes;

        if (stationMatch && platformMatch) {
        }

        return stationMatch && platformMatch && paymentMatch && dateMatch && timeMatch;
    });


    // 2) Build sequential playlist - each unique ad plays once in rotation
    const playlist = [];
    const uniqueAds = new Set();

    for (const b of activeBookings) {
        const ad = ads.find(a => a.id === b.adId);
        if (!ad || uniqueAds.has(ad.id)) {
            continue;
        }

        let videoPath = path.join(__dirname, '..', ad.path);
        let fileExists = false;
        let actualPath = ad.path;

        try {
            fileExists = fs.existsSync(videoPath);
        } catch (e) {
            fileExists = false;
        }

        if (!fileExists && ad.path.includes('/uploads/') && ad.path.split('/').length > 2) {
            const filename = path.basename(ad.path);
            const oldPath = path.join(__dirname, '../uploads', filename);
            try {
                if (fs.existsSync(oldPath)) {
                    fileExists = true;
                    actualPath = `/uploads/${filename}`;
                }
            } catch (e) {}
        }

        if (!fileExists) {
            continue;
        }

        // Add each unique ad once for sequential rotation
        uniqueAds.add(ad.id);
        const adDuration = ad.duration || 30;

        playlist.push({
            bookingId: b.id,
            videoUrl: actualPath,
            duration: adDuration,
            customerName: b.customerName,
            adId: ad.id
        });
    }

    // No shuffle - keep sequential order for round-robin rotation
    // Player will loop through playlist automatically

    // Log playlist
    playlist.forEach((item, i) => {
    });

    return playlist;
}

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

app.get('/api/screens', async (req, res) => {
    let screensList = await dbHelpers.getScreens();

    const screensWithDetails = screensList.map(screen => {
        const location = findLocationByScreenId(screen.screenId);
        return {
            id: screen.screenId,
            ...screen,
            ...location,
            isOnline: screens.has(screen.screenId)
        };
    });

    res.json(screensWithDetails);
});

function findLocationByScreenId(screenId) {
    for (const [state, districts] of Object.entries(LOCATIONS)) {
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

app.get('/api/locations', (req, res) => {
    res.json(LOCATIONS);
});

app.post('/api/calculate-price', (req, res) => {
    const { state, district, station, platforms, hours, primeTime } = req.body;
    const stationData = LOCATIONS[state]?.[district]?.[station];

    if (!stationData) {
        return res.status(404).json({ error: 'Station not found' });
    }

    let totalPrice = 0;
    const platformDetails = [];

    platforms.forEach(platformName => {
        const platform = stationData.platforms[platformName];
        if (platform) {
            let price = platform.pricePerHour * hours;
            if (primeTime) price *= 1.5;
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

app.post('/api/upload', (req, res) => {
    upload.single('video')(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File too large. Max 500MB allowed.', code: 'FILE_TOO_LARGE' });
            }
            if (err.message === 'Only video files allowed') {
                return res.status(400).json({ error: 'Only video files allowed.', code: 'INVALID_FILE_TYPE' });
            }
            return res.status(500).json({ error: 'Upload failed.', code: 'UPLOAD_ERROR' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No video file received.', code: 'NO_FILE' });
        }

        try {
            const adId = uuidv4();
            const platformFolder = req.platformFolder || 'default';

            // Videos stored on disk only
            const videoUrl = `/uploads/${platformFolder}/${req.file.filename}`;

            console.log('[DEBUG] Upload - Received duration:', req.body.duration, 'from body');
            console.log('[DEBUG] Upload - File:', req.file.originalname, 'size:', req.file.size);

            const adData = {
                id: adId,
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: videoUrl,
                gridfsFileId: null,
                platforms: req.platforms || ['default'],
                platformFolder: platformFolder,
                size: req.file.size,
                status: 'approved',
                duration: req.body.duration || 30
            };

            console.log('[DEBUG] Upload - Storing ad with duration:', adData.duration);

            await dbHelpers.createAd(adData);

            // Simulate AI moderation
            setTimeout(() => runAIModeration(adId), 2000);

            res.json({
                success: true,
                adId,
                message: 'Video uploaded. AI moderation in progress...'
            });
        } catch (error) {
            console.error('Server error:', error);
            res.status(500).json({ error: 'Server error.', code: 'SERVER_ERROR' });
        }
    });
});

// Video Streaming Endpoint - Serve from disk using ad record path
app.get('/api/video/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;

        // Validate fileId
        if (!fileId) {
            return res.status(400).json({ error: 'Video ID required' });
        }

        // Find ad record by gridfsFileId (for backwards compatibility)
        const { ads } = await dbHelpers.getAds({ limit: 1000 });
        const ad = ads.find(a => a.gridfsFileId === fileId || a.path.includes(fileId));

        let diskFilePath = null;

        // If ad found with path, try to serve from disk
        if (ad && ad.path) {
            // Convert relative path to absolute
            const possiblePath = path.join(__dirname, '..', ad.path);
            if (fs.existsSync(possiblePath)) {
                diskFilePath = possiblePath;
            } else {
                // Try alternative: uploads folder + platform + filename
                const platformFolder = ad.platformFolder || 'default';
                const filename = path.basename(ad.path);
                const altPath = path.join(__dirname, '../uploads', platformFolder, filename);
                if (fs.existsSync(altPath)) {
                    diskFilePath = altPath;
                }
            }
        }

        // If found on disk, serve directly
        if (diskFilePath && fs.existsSync(diskFilePath)) {
            const stat = fs.statSync(diskFilePath);
            res.set({
                'Content-Length': stat.size,
                'Content-Type': 'video/mp4',
                'Cache-Control': 'public, max-age=3600',
                'Accept-Ranges': 'bytes'
            });
            return fs.createReadStream(diskFilePath).pipe(res);
        }

        // Video not found
        return res.status(404).json({ error: 'Video not found' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to stream video: ' + error.message });
    }
});

async function runAIModeration(adId) {
    await dbHelpers.updateAd(adId, { status: 'analyzing' });

    setTimeout(async () => {
        await dbHelpers.updateAd(adId, {
            status: 'approved',
            moderationResult: {
                checkedAt: new Date(),
                nsfw: false,
                violence: false,
                political: false,
                confidence: 0.98,
                approved: true,
                reason: 'Content meets guidelines'
            }
        });
    }, 3000);
}

app.get('/api/ad/:adId/status', async (req, res) => {
    const ad = await dbHelpers.getAdById(req.params.adId);
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

// Admin: Approve Ad
app.post('/api/admin/ads/:adId/approve', async (req, res) => {
    try {
        const ad = await dbHelpers.getAdById(req.params.adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        await dbHelpers.updateAd(req.params.adId, {
            status: 'approved',
            moderationResult: {
                checkedAt: new Date(),
                nsfw: false,
                violence: false,
                political: false,
                confidence: 0.98,
                approved: true,
                reason: 'Manually approved by admin'
            }
        });

        res.json({ success: true, message: 'Ad approved' });
    } catch (error) {
        console.error('[Admin] Approve error:', error);
        res.status(500).json({ error: 'Failed to approve ad' });
    }
});

// Admin: Reject Ad
app.post('/api/admin/ads/:adId/reject', async (req, res) => {
    try {
        const ad = await dbHelpers.getAdById(req.params.adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        await dbHelpers.updateAd(req.params.adId, {
            status: 'rejected',
            moderationResult: {
                checkedAt: new Date(),
                nsfw: false,
                violence: false,
                political: false,
                confidence: 0.5,
                approved: false,
                reason: req.body.reason || 'Manually rejected by admin'
            }
        });

        res.json({ success: true, message: 'Ad rejected' });
    } catch (error) {
        console.error('[Admin] Reject error:', error);
        res.status(500).json({ error: 'Failed to reject ad' });
    }
});

app.post('/api/book', async (req, res) => {
    try {
        let { adId, state, district, station, platforms, hours, startTime, date, primeTime,
                customerName, customerEmail, customerPhone, priceDetails } = req.body;

        // Fix: Parse platforms if it's a string
        if (typeof platforms === 'string') {
            try {
                platforms = JSON.parse(platforms);
            } catch (e) {
                console.error('[Booking] Failed to parse platforms:', e.message);
                platforms = [platforms]; // fallback: treat as single platform
            }
        }


        if (!adId) {
            return res.status(400).json({ error: 'Missing adId in request' });
        }

        // Fix: Parse priceDetails if it's a string
        let parsedPriceDetails = priceDetails;
        if (typeof priceDetails === 'string') {
            try {
                parsedPriceDetails = JSON.parse(priceDetails);
            } catch (e) {
                console.error('[Booking] Failed to parse priceDetails:', e.message);
            }
        }

        // Fix: Parse platforms array if it's a string
        if (parsedPriceDetails && typeof parsedPriceDetails.platforms === 'string') {
            try {
                parsedPriceDetails.platforms = JSON.parse(parsedPriceDetails.platforms);
            } catch (e) {
                console.error('[Booking] Failed to parse platforms:', e.message);
            }
        }

        const ad = await dbHelpers.getAdById(adId);

        if (!ad) {
            return res.status(400).json({ error: 'Ad not found with id: ' + adId });
        }

        if (ad.status !== 'approved') {
            return res.status(400).json({ error: 'Ad not approved. Current status: ' + ad.status });
        }

    // Check for existing bookings
    const bookingsResult = await dbHelpers.getBookings();
    const bookings = bookingsResult.bookings || bookingsResult || [];
    const existingBookings = bookings.filter(b =>
        b.station === station &&
        b.platforms.some(p => platforms.includes(p)) &&
        b.date === date &&
        parseFloat(b.startTime) <= parseFloat(startTime) + parseFloat(hours) &&
        parseFloat(b.startTime) + parseFloat(b.hours) > parseFloat(startTime) &&
        b.paymentStatus === 'completed'
    );

    const bookingId = 'BK' + Date.now().toString(36).toUpperCase();

    const bookingData = {
        id: bookingId,
        adId,
        state, district, station, platforms,
        hours, startTime, date, primeTime,
        customerName, customerEmail, customerPhone,
        priceDetails: parsedPriceDetails,
        paymentStatus: 'pending',
        bookingStatus: 'pending'
    };

    await dbHelpers.createBooking(bookingData);
    await dbHelpers.updateAd(adId, { status: 'scheduled', bookingId });

        res.json({
            success: true,
            bookingId,
            message: existingBookings.length > 0
                ? `Booking created. Your ad will rotate with ${existingBookings.length} other ad(s).`
                : 'Booking created',
            existingAds: existingBookings.length,
            rotationEnabled: true
        });
    } catch (error) {
        console.error('[Booking] Error:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: 'Booking failed: ' + error.message });
    }
});

app.post('/api/payment', async (req, res) => {
    const { bookingId, paymentMethod } = req.body;
    const booking = await dbHelpers.getBookingById(bookingId);

    if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
    }

    // Process payment asynchronously
    setTimeout(async () => {
        await dbHelpers.updateBooking(bookingId, {
            paymentStatus: 'completed',
            bookingStatus: 'confirmed',
            paymentMethod,
            paidAt: new Date()
        });

        // Notify screens
        booking.platforms.forEach(platform => {
            broadcastToScreens(booking.station, platform, {
                type: 'new-booking',
                bookingId
            });
        });
    }, 1500);

    res.json({
        success: true,
        transactionId: 'TXN' + Date.now(),
        message: 'Payment processed'
    });
});

app.get('/api/booking/:bookingId', async (req, res) => {
    const booking = await dbHelpers.getBookingById(req.params.bookingId);
    if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
    }

    const ad = await dbHelpers.getAdById(booking.adId);
    res.json({
        ...booking,
        ad: ad ? { path: ad.path, duration: ad.duration } : null
    });
});

app.get('/api/player/:station/:platform/playlist', async (req, res) => {
    const { station, platform } = req.params;
    const playlist = await getPlaylistForScreen(station, platform);

    res.json({
        station,
        platform,
        currentTime: new Date().toISOString(),
        playlist: playlist.length > 0 ? playlist : [{ type: 'filler', message: 'No active ads' }]
    });
});

// Admin routes
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_CREDS.username && password === ADMIN_CREDS.password) {
        res.json({ success: true, token: 'admin-token-' + Date.now() });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/admin/bookings', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const { bookings, total, totalPages } = await dbHelpers.getBookings({ page, limit });
        const { ads } = await dbHelpers.getAds({ page: 1, limit: 1000 }); // Get all ads for mapping

        const bookingsWithAds = bookings.map(b => {
            const ad = ads.find(a => a.id === b.adId);
            return { ...b, ad: ad ? { path: ad.path, status: ad.status } : null };
        });

        res.json({
            data: bookingsWithAds,
            pagination: { page, limit, total, totalPages }
        });
    } catch (error) {
        console.error('[Admin] Get bookings error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

app.get('/api/admin/ads', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const { ads, total, totalPages } = await dbHelpers.getAds({ page, limit });
        res.json({
            data: ads,
            pagination: { page, limit, total, totalPages }
        });
    } catch (error) {
        console.error('[Admin] Get ads error:', error);
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

// Delete individual ad
app.delete('/api/admin/ads/:adId', async (req, res) => {
    try {
        const ad = await dbHelpers.getAdById(req.params.adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        await dbHelpers.deleteAd(req.params.adId);
        res.json({ success: true, message: 'Ad deleted successfully' });
    } catch (error) {
        console.error('[Admin] Delete ad error:', error);
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

// Bulk delete ads
app.post('/api/admin/ads/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }

        const result = await dbHelpers.deleteAds(ids);
        res.json({ success: true, message: `${result.deletedCount} ads deleted` });
    } catch (error) {
        console.error('[Admin] Bulk delete ads error:', error);
        res.status(500).json({ error: 'Failed to delete ads' });
    }
});

// Delete individual booking
app.delete('/api/admin/bookings/:bookingId', async (req, res) => {
    try {
        const booking = await dbHelpers.getBookingById(req.params.bookingId);
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        await dbHelpers.deleteBooking(req.params.bookingId);
        res.json({ success: true, message: 'Booking deleted successfully' });
    } catch (error) {
        console.error('[Admin] Delete booking error:', error);
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

// Bulk delete bookings
app.post('/api/admin/bookings/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }

        const result = await dbHelpers.deleteBookings(ids);
        res.json({ success: true, message: `${result.deletedCount} bookings deleted` });
    } catch (error) {
        console.error('[Admin] Bulk delete bookings error:', error);
        res.status(500).json({ error: 'Failed to delete bookings' });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    const stats = await dbHelpers.getStats();
    const screensList = await dbHelpers.getScreens();

    res.json({
        ...stats,
        activeStations: 2,
        totalPlatforms: 16,
        totalScreens: screensList.length
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Server error' });
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../player/booking.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/admin.html'));
});

// Start server
async function startServer() {
    // Connect to SQLite
    try {
        await connectDB();
    } catch (err) {
        console.error('Failed to connect to SQLite:', err);
        process.exit(1);
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`✅ SQLite database: ${DB_PATH}`);
    });
}

startServer();
