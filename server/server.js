/**
 * DOOH Platform - Production Multi-Screen Server
 * Railway Station Ad System with Multi-Display Support
 * MongoDB Persistence Enabled
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
const mongoose = require('mongoose');
require('dotenv').config();

const { connectDB, dbHelpers, gridfsHelpers } = require('./db');
const { seedDatabase } = require('./seed');
// const setupWizard = require('./setup');  // Temporarily disabled

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3002;
let useMongoDB = false;

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

// File-based database paths (fallback when MongoDB unavailable)
const DB_PATH = path.join(__dirname, '../data/database.json');
const SCREENS_PATH = path.join(__dirname, '../data/screens.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize file-based database
function initFileDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            locations: LOCATIONS,
            bookings: [],
            ads: [],
            admin: { username: 'admin', password: 'admin123' }
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    }

    if (!fs.existsSync(SCREENS_PATH)) {
        fs.writeFileSync(SCREENS_PATH, JSON.stringify({ screens: {} }, null, 2));
    }
}

// File-based DB helpers
function getFileDatabase() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveFileDatabase(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getFileScreens() {
    return JSON.parse(fs.readFileSync(SCREENS_PATH, 'utf8'));
}

function saveFileScreens(data) {
    fs.writeFileSync(SCREENS_PATH, JSON.stringify(data, null, 2));
}

// Admin credentials (fallback)
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
        console.log(`Screen connected: ${screenId} (${station} - ${platform})`);

        // Update screen status in DB
        if (useMongoDB) {
            dbHelpers.updateScreen(screenId, { station, platform, status: 'online', connectedAt: new Date() });
        }

        sendPlaylistToScreen(screenId);
    }

    ws.on('close', () => {
        if (screenId) {
            screens.delete(screenId);
            if (useMongoDB) {
                dbHelpers.updateScreen(screenId, { status: 'offline' });
            }
            console.log(`Screen disconnected: ${screenId}`);
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

    console.log(`[Playlist] Request for ${station}/${platform}, IST: ${today} ${currentHour}:00`);

    let bookings = [];
    let ads = [];

    if (useMongoDB) {
        const bookingsResult = await dbHelpers.getBookings();
        const adsResult = await dbHelpers.getAds();
        // Handle both old format (array) and new format (object with data)
        bookings = bookingsResult.bookings || bookingsResult || [];
        ads = adsResult.ads || adsResult || [];
    }

    // 1) Find active bookings
    const activeBookings = bookings.filter(b =>
        b.station === station &&
        b.platforms.includes(platform) &&
        b.paymentStatus === 'completed' &&
        b.date === today &&
        parseInt(b.startTime) <= currentHour &&
        parseInt(b.startTime) + parseInt(b.hours) > currentHour
    );

    console.log(`[Playlist] Found ${activeBookings.length} active bookings for current slot`);

    // 2) Build playlist
    const playlist = [];
    for (const b of activeBookings) {
        const ad = ads.find(a => a.id === b.adId);
        if (!ad) {
            console.log(`[Playlist] Warning: Ad not found for booking ${b.id}`);
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

        // Backward compatibility - try old flat path
        if (!fileExists && ad.path.includes('/uploads/') && ad.path.split('/').length > 2) {
            const filename = path.basename(ad.path);
            const oldPath = path.join(__dirname, '../uploads', filename);
            try {
                if (fs.existsSync(oldPath)) {
                    fileExists = true;
                    actualPath = `/uploads/${filename}`;
                    console.log(`[Playlist] Found at legacy path: ${oldPath}`);
                }
            } catch (e) {}
        }

        console.log(`[Playlist] Ad ${ad.id}: exists=${fileExists}`);

        if (fileExists) {
            playlist.push({
                bookingId: b.id,
                videoUrl: actualPath,
                duration: ad.duration || 30,
                customerName: b.customerName,
                startTime: b.startTime,
                hours: b.hours,
                fileExists
            });
        }
    }

    console.log(`[Playlist] Built playlist with ${playlist.length} items`);

    // 3) Fallback to any confirmed bookings for this platform
    if (playlist.length === 0) {
        console.log(`[Playlist] No active bookings, checking fallback`);

        const platformBookings = bookings.filter(b =>
            b.station === station &&
            b.platforms.includes(platform) &&
            b.paymentStatus === 'completed'
        );

        for (const b of platformBookings) {
            const ad = ads.find(a => a.id === b.adId);
            if (!ad || (ad.status !== 'approved' && ad.status !== 'scheduled')) continue;

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

            if (fileExists) {
                playlist.push({
                    bookingId: b.id,
                    videoUrl: actualPath,
                    duration: ad.duration || 30,
                    customerName: b.customerName,
                    startTime: b.startTime,
                    hours: b.hours,
                    fileExists: true
                });
            }
        }

        console.log(`[Playlist] Fallback added ${playlist.length} items`);
    }

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
    let screensList = [];
    if (useMongoDB) {
        screensList = await dbHelpers.getScreens();
    }

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

            let videoUrl;
            let gridfsFileId = null;

            // Upload to GridFS if MongoDB is available
            if (useMongoDB && gridfsHelpers.isAvailable()) {
                const fileBuffer = fs.readFileSync(req.file.path);
                const gridFile = await gridfsHelpers.uploadFile(
                    fileBuffer,
                    req.file.filename,
                    {
                        originalName: req.file.originalname,
                        platformFolder: platformFolder,
                        adId: adId,
                        contentType: req.file.mimetype
                    }
                );
                gridfsFileId = gridFile._id.toString();
                videoUrl = `/api/video/${gridfsFileId}`;

                // Delete temp file after GridFS upload
                fs.unlinkSync(req.file.path);
            } else {
                // Fallback to file system (ephemeral on Render)
                videoUrl = `/uploads/${platformFolder}/${req.file.filename}`;
            }

            const adData = {
                id: adId,
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: videoUrl,
                gridfsFileId: gridfsFileId,
                platforms: req.platforms || ['default'],
                platformFolder: platformFolder,
                size: req.file.size,
                status: 'approved',
                duration: req.body.duration || 30
            };

            if (useMongoDB) {
                await dbHelpers.createAd(adData);
            }

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

// GridFS Video Streaming Endpoint
app.get('/api/video/:fileId', async (req, res) => {
    const requestedFileId = req.params.fileId;
    console.log('[Video] Request for fileId:', requestedFileId, '| Length:', requestedFileId ? requestedFileId.length : 0);

    // Log first few chars to see if truncated
    if (requestedFileId) {
        console.log('[Video] FileId preview:', requestedFileId.substring(0, 10) + '...');
    }
    try {
        if (!useMongoDB || !gridfsHelpers.isAvailable()) {
            console.log('[Video] GridFS not available');
            return res.status(503).json({ error: 'Video storage not available' });
        }

        const fileId = req.params.fileId;
        console.log('[Video] Looking up file:', fileId);

        // Validate fileId
        if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
            console.log('[Video] Invalid fileId format:', fileId);
            return res.status(400).json({ error: 'Invalid video ID format' });
        }

        const file = await gridfsHelpers.findFile(fileId);
        console.log('[Video] File lookup result:', file ? { id: file._id, length: file.length, metadata: file.metadata } : 'not found');

        if (!file) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const contentType = file.metadata?.contentType || 'video/mp4';
        const fileLength = file.length;

        // Handle range requests for video seeking
        const range = req.headers.range;
        console.log('[Video] Range header:', range);

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileLength - 1;
            const chunksize = end - start + 1;

            console.log('[Video] Range request:', { start, end, chunksize, fileLength });

            res.status(206);
            res.set({
                'Content-Range': `bytes ${start}-${end}/${fileLength}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
            });

            const downloadOptions = { start, end: end < fileLength - 1 ? end : undefined };
            console.log('[Video] Download options:', downloadOptions);

            const downloadStream = gridfsHelpers.downloadFile(fileId, downloadOptions);
            console.log('[Video] Stream created, piping...');

            downloadStream.on('error', (err) => {
                console.error('[GridFS] Stream error:', err.message, err.stack);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Stream error' });
                } else {
                    // If headers already sent, destroy the response to end it
                    res.destroy();
                }
            });
            downloadStream.on('end', () => {
                console.log('[Video] Stream ended successfully');
            });
            downloadStream.pipe(res);
        } else {
            // Full file request
            console.log('[Video] Full file request, length:', fileLength);
            res.set({
                'Content-Length': fileLength,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=3600'
            });

            const downloadStream = gridfsHelpers.downloadFile(fileId);
            console.log('[Video] Stream created for full file, piping...');

            downloadStream.on('error', (err) => {
                console.error('[GridFS] Stream error:', err.message, err.stack);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Stream error' });
                } else {
                    res.destroy();
                }
            });
            downloadStream.on('end', () => {
                console.log('[Video] Stream ended successfully');
            });

            downloadStream.pipe(res);
        }
    } catch (error) {
        console.error('[GridFS] Error streaming video:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to stream video: ' + error.message });
    }
});

async function runAIModeration(adId) {
    if (!useMongoDB) return;

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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

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
        if (!useMongoDB) {
            return res.status(503).json({ error: 'Database not available. Cannot create booking.' });
        }

        const { adId, state, district, station, platforms, hours, startTime, date, primeTime,
                customerName, customerEmail, customerPhone, priceDetails } = req.body;

        console.log('[Booking] Request:', { adId, state, station, platforms, customerEmail });

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
        console.log('[Booking] Found ad:', ad ? { id: ad.id, status: ad.status } : 'not found');

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
        parseInt(b.startTime) <= parseInt(startTime) + parseInt(hours) &&
        parseInt(b.startTime) + parseInt(b.hours) > parseInt(startTime) &&
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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

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
    if (!useMongoDB) {
        return res.json([]);
    }

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const { bookings, total, totalPages } = await dbHelpers.getBookings({ page, limit });
        const ads = await dbHelpers.getAds({ page: 1, limit: 1000 }); // Get all ads for mapping

        const bookingsWithAds = bookings.map(b => {
            const ad = ads.ads.find(a => a.id === b.adId);
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
    if (!useMongoDB) {
        return res.json([]);
    }

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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

    try {
        const ad = await dbHelpers.getAdById(req.params.adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        // Delete from GridFS if gridfsFileId exists
        if (ad.gridfsFileId && gridfsHelpers.isAvailable()) {
            try {
                await gridfsHelpers.deleteFile(ad.gridfsFileId);
                console.log('[Admin] Deleted GridFS file:', ad.gridfsFileId);
            } catch (err) {
                console.error('[Admin] GridFS delete error:', err.message);
            }
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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }

        // Get ads to delete GridFS files
        const ads = await dbHelpers.getAds({ page: 1, limit: 1000 });
        const adsToDelete = ads.ads.filter(a => ids.includes(a.id));

        // Delete GridFS files
        for (const ad of adsToDelete) {
            if (ad.gridfsFileId && gridfsHelpers.isAvailable()) {
                try {
                    await gridfsHelpers.deleteFile(ad.gridfsFileId);
                    console.log('[Admin] Deleted GridFS file:', ad.gridfsFileId);
                } catch (err) {
                    console.error('[Admin] GridFS delete error:', err.message);
                }
            }
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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

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
    if (!useMongoDB) {
        return res.status(503).json({ error: 'Database not available' });
    }

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
    if (!useMongoDB) {
        return res.json({
            totalBookings: 0, totalRevenue: 0, pendingAds: 0,
            approvedAds: 0, scheduledAds: 0, onlineScreens: 0,
            activeStations: 2, totalPlatforms: 16, totalScreens: 0
        });
    }

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
    // Check for MongoDB URI
    const mongoUri = process.env.MONGODB_URI;

    if (mongoUri) {
        // Try to connect to MongoDB
        useMongoDB = await connectDB();

        if (useMongoDB) {
            // Seed database with default data
            await seedDatabase();
            console.log('✅ Using MongoDB for persistent storage');
        } else {
            console.log('⚠️ MongoDB connection failed, using file-based storage (ephemeral)');
            initFileDatabase();
        }
    } else {
        console.log('⚠️ MONGODB_URI not set, using file-based storage (ephemeral)');
        initFileDatabase();
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║     DOOH Platform - Production Multi-Screen Server         ║
╚════════════════════════════════════════════════════════════╝

🌐 Server running on:
   Local:   http://localhost:${PORT}
   Network: http://0.0.0.0:${PORT}

💾 Database: ${useMongoDB ? '✅ MongoDB (Persistent)' : '⚠️  File-based (Ephemeral)'}
${!useMongoDB ? '   Set MONGODB_URI for persistent storage' : ''}

📺 Screen URLs:
   Kanpur Platform 1:  http://YOUR_IP:${PORT}/player.html?station=Kanpur%20Central%20(CNB)&platform=Platform%201&screenId=CNB-P1

🔧 Admin Panel: http://YOUR_IP:${PORT}/admin.html
   Default Login: admin / admin123

═══════════════════════════════════════════════════════════════
        `);
    });
}

startServer();
