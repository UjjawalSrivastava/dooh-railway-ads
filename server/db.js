/**
 * MongoDB Database Configuration
 * Persistent storage for DOOH Platform with GridFS for videos
 */

const mongoose = require('mongoose');
let gfsBucket = null;

// MongoDB Connection
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dooh-platform';

        const conn = await mongoose.connect(mongoURI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        // Initialize GridFS bucket
        gfsBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, {
            bucketName: 'videos'
        });

        console.log('✅ MongoDB Connected Successfully');
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.log('⚠️  Falling back to file-based storage (data will be lost on restart)');
        return false;
    }
};

// Get GridFS bucket instance
const getGFSBucket = () => {
    if (!gfsBucket) {
        throw new Error('GridFS not initialized. Connect to MongoDB first.');
    }
    return gfsBucket;
};

// GridFS Helper Functions
const gridfsHelpers = {
    // Upload file to GridFS
    uploadFile(fileBuffer, filename, metadata = {}) {
        return new Promise((resolve, reject) => {
            const bucket = getGFSBucket();
            const uploadStream = bucket.openUploadStream(filename, {
                metadata: metadata
            });

            uploadStream.on('error', (err) => reject(err));
            uploadStream.on('finish', (file) => resolve(file));

            uploadStream.end(fileBuffer);
        });
    },

    // Download file from GridFS
    downloadFile(fileId) {
        const bucket = getGFSBucket();
        return bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    },

    // Delete file from GridFS
    async deleteFile(fileId) {
        const bucket = getGFSBucket();
        await bucket.delete(new mongoose.Types.ObjectId(fileId));
        return true;
    },

    // Find file by ID
    async findFile(fileId) {
        const bucket = getGFSBucket();
        const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
        return files[0] || null;
    },

    // Check if GridFS is available
    isAvailable() {
        return gfsBucket !== null;
    }
};

// Ad Schema
const adSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    platforms: [{ type: String }],
    platformFolder: { type: String, default: 'default' },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['pending', 'analyzing', 'approved', 'rejected', 'scheduled'],
        default: 'pending'
    },
    moderationResult: {
        checkedAt: Date,
        nsfw: Boolean,
        violence: Boolean,
        political: Boolean,
        confidence: Number,
        approved: Boolean,
        reason: String
    },
    duration: { type: Number, default: 30 },
    bookingId: { type: String, default: null }
}, { timestamps: true });

// Booking Schema
const bookingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    adId: { type: String, required: true, ref: 'Ad' },
    state: { type: String, required: true },
    district: { type: String, required: true },
    station: { type: String, required: true },
    platforms: [{ type: String }],
    hours: { type: Number, required: true },
    startTime: { type: String, required: true },
    date: { type: String, required: true },
    primeTime: { type: Boolean, default: false },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },
    priceDetails: {
        platforms: { type: mongoose.Schema.Types.Mixed, default: [] },
        subtotal: Number,
        gst: Number,
        total: Number,
        currency: { type: String, default: 'INR' }
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    bookingStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending'
    },
    paymentMethod: { type: String, default: null },
    paidAt: { type: Date, default: null },
    scheduledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
}, { timestamps: true });

// Screen Schema
const screenSchema = new mongoose.Schema({
    screenId: { type: String, required: true, unique: true },
    station: { type: String, required: true },
    platform: { type: String, required: true },
    status: {
        type: String,
        enum: ['online', 'offline'],
        default: 'offline'
    },
    lastSeen: { type: Date, default: Date.now },
    connectedAt: { type: Date, default: null }
}, { timestamps: true });

// Playback Log Schema
const playbackLogSchema = new mongoose.Schema({
    screenId: { type: String, required: true },
    bookingId: { type: String, required: true },
    status: { type: String, enum: ['started', 'completed', 'error'], required: true },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// Admin Config Schema
const adminConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Models
const Ad = mongoose.model('Ad', adSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Screen = mongoose.model('Screen', screenSchema);
const PlaybackLog = mongoose.model('PlaybackLog', playbackLogSchema);
const AdminConfig = mongoose.model('AdminConfig', adminConfigSchema);

// Database Helper Functions
const dbHelpers = {
    // Ad operations
    async getAds() {
        return await Ad.find().lean();
    },

    async getAdById(id) {
        return await Ad.findOne({ id }).lean();
    },

    async createAd(adData) {
        const ad = new Ad(adData);
        return await ad.save();
    },

    async updateAd(id, updates) {
        return await Ad.findOneAndUpdate({ id }, updates, { new: true }).lean();
    },

    // Booking operations
    async getBookings() {
        return await Booking.find().lean();
    },

    async getBookingById(id) {
        return await Booking.findOne({ id }).lean();
    },

    async createBooking(bookingData) {
        const booking = new Booking(bookingData);
        return await booking.save();
    },

    async updateBooking(id, updates) {
        return await Booking.findOneAndUpdate({ id }, updates, { new: true }).lean();
    },

    // Screen operations
    async getScreens() {
        return await Screen.find().lean();
    },

    async getScreenById(screenId) {
        return await Screen.findOne({ screenId }).lean();
    },

    async updateScreen(screenId, updates) {
        return await Screen.findOneAndUpdate(
            { screenId },
            { ...updates, lastSeen: new Date() },
            { new: true, upsert: true }
        ).lean();
    },

    // Playback log operations
    async addPlaybackLog(logData) {
        const log = new PlaybackLog(logData);
        return await log.save();
    },

    async getPlaybackLogs(limit = 100) {
        return await PlaybackLog.find()
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    },

    // Admin config operations
    async getAdminConfig(key) {
        const config = await AdminConfig.findOne({ key }).lean();
        return config ? config.value : null;
    },

    async setAdminConfig(key, value) {
        return await AdminConfig.findOneAndUpdate(
            { key },
            { key, value },
            { new: true, upsert: true }
        ).lean();
    },

    // Stats
    async getStats() {
        const [totalBookings, totalRevenue, pendingAds, approvedAds, scheduledAds, onlineScreens] = await Promise.all([
            Booking.countDocuments(),
            Booking.aggregate([
                { $match: { paymentStatus: 'completed' } },
                { $group: { _id: null, total: { $sum: '$priceDetails.total' } } }
            ]).then(result => result[0]?.total || 0),
            Ad.countDocuments({ status: 'pending' }),
            Ad.countDocuments({ status: 'approved' }),
            Ad.countDocuments({ status: 'scheduled' }),
            Screen.countDocuments({ status: 'online' })
        ]);

        return {
            totalBookings,
            totalRevenue,
            pendingAds,
            approvedAds,
            scheduledAds,
            onlineScreens
        };
    }
};

module.exports = {
    connectDB,
    getGFSBucket,
    gridfsHelpers,
    Ad,
    Booking,
    Screen,
    PlaybackLog,
    AdminConfig,
    dbHelpers
};
