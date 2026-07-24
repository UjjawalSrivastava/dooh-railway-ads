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
            maxPoolSize: 50,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 0,
            connectTimeoutMS: 10000,
            maxIdleTimeMS: 60000,
            retryWrites: true,
            retryReads: true,
        });

        // Initialize GridFS bucket
        gfsBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, {
            bucketName: 'videos'
        });

        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
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
            try {
                const bucket = getGFSBucket();
                const uploadStream = bucket.openUploadStream(filename, {
                    metadata: metadata
                });

                uploadStream.on('error', (err) => {
                    console.error('[GridFS] Upload error:', err);
                    reject(err);
                });

                uploadStream.on('finish', () => {
                    // The file id is available on the stream object
                    const file = {
                        _id: uploadStream.id,
                        filename: filename,
                        length: fileBuffer.length,
                        metadata: metadata
                    };
                    resolve(file);
                });

                uploadStream.end(fileBuffer);
            } catch (err) {
                console.error('[GridFS] Upload setup error:', err);
                reject(err);
            }
        });
    },

    // Download file from GridFS
    downloadFile(fileId, options = {}) {
        try {

            const bucket = getGFSBucket();

            if (!fileId) {
                throw new Error('fileId is null or undefined');
            }
            if (!mongoose.Types.ObjectId.isValid(fileId)) {
                throw new Error('Invalid fileId format: ' + fileId + ' (length: ' + fileId.length + ')');
            }
            const objectId = new mongoose.Types.ObjectId(fileId);

            if (options.start !== undefined || options.end !== undefined) {
                return bucket.openDownloadStream(objectId, options);
            }
            return bucket.openDownloadStream(objectId);
        } catch (err) {
            console.error('[GridFS] downloadFile error:', err.message);
            throw err;
        }
    },

    // Delete file from GridFS
    async deleteFile(fileId) {
        const bucket = getGFSBucket();
        await bucket.delete(new mongoose.Types.ObjectId(fileId));
        return true;
    },

    // Find file by ID
    async findFile(fileId) {
        try {
            const bucket = getGFSBucket();

            // Validate fileId format
            if (!fileId || typeof fileId !== 'string') {
                console.error('[GridFS] Invalid fileId:', fileId);
                return null;
            }

            // Check if valid ObjectId
            if (!mongoose.Types.ObjectId.isValid(fileId)) {
                console.error('[GridFS] Invalid ObjectId format:', fileId);
                return null;
            }

            const objectId = new mongoose.Types.ObjectId(fileId);

            const files = await bucket.find({ _id: objectId }).toArray();
            return files[0] || null;
        } catch (err) {
            console.error('[GridFS] findFile error:', err.message, err.stack);
            throw err;
        }
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
    bookingId: { type: String, default: null },
    gridfsFileId: { type: String, default: null }
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
    async getAds(options = {}) {
        const { page = 1, limit = 10 } = options;
        const skip = (page - 1) * limit;
        const [ads, total] = await Promise.all([
            Ad.find().skip(skip).limit(limit).lean(),
            Ad.countDocuments()
        ]);
        return { ads, total, page, totalPages: Math.ceil(total / limit) };
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

    async deleteAd(id) {
        return await Ad.findOneAndDelete({ id });
    },

    async deleteAds(ids) {
        return await Ad.deleteMany({ id: { $in: ids } });
    },

    // Booking operations
    async getBookings(options = {}) {
        const { page = 1, limit = 10 } = options;
        const skip = (page - 1) * limit;
        const [bookings, total] = await Promise.all([
            Booking.find().skip(skip).limit(limit).lean(),
            Booking.countDocuments()
        ]);
        return { bookings, total, page, totalPages: Math.ceil(total / limit) };
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

    async deleteBooking(id) {
        return await Booking.findOneAndDelete({ id });
    },

    async deleteBookings(ids) {
        return await Booking.deleteMany({ id: { $in: ids } });
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
