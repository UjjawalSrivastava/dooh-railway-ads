/**
 * SQLite Database Configuration
 * Lightweight file-based storage for DOOH Platform
 * Videos stay on disk, only metadata in SQLite
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'dooh.db');

let db = null;

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize SQLite database
const connectDB = async () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ SQLite Connection Error:', err.message);
                reject(err);
                return;
            }
            console.log('✅ SQLite connected');
            initializeTables().then(() => resolve(true)).catch(reject);
        });
    });
};

// Create tables if not exist
const initializeTables = async () => {
    const tables = [
        // Ads table
        `CREATE TABLE IF NOT EXISTS ads (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            originalName TEXT NOT NULL,
            path TEXT NOT NULL,
            platforms TEXT,
            platformFolder TEXT DEFAULT 'default',
            size INTEGER NOT NULL,
            uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            moderationResult TEXT,
            duration INTEGER DEFAULT 30,
            bookingId TEXT,
            gridfsFileId TEXT
        )`,
        // Bookings table
        `CREATE TABLE IF NOT EXISTS bookings (
            id TEXT PRIMARY KEY,
            adId TEXT NOT NULL,
            state TEXT NOT NULL,
            district TEXT NOT NULL,
            station TEXT NOT NULL,
            platforms TEXT,
            hours INTEGER NOT NULL,
            startTime TEXT NOT NULL,
            date TEXT NOT NULL,
            primeTime INTEGER DEFAULT 0,
            customerName TEXT NOT NULL,
            customerEmail TEXT NOT NULL,
            customerPhone TEXT NOT NULL,
            priceDetails TEXT,
            paymentStatus TEXT DEFAULT 'pending',
            bookingStatus TEXT DEFAULT 'pending',
            paymentMethod TEXT,
            paidAt DATETIME,
            scheduledAt DATETIME,
            completedAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // Screens table
        `CREATE TABLE IF NOT EXISTS screens (
            screenId TEXT PRIMARY KEY,
            station TEXT NOT NULL,
            platform TEXT NOT NULL,
            status TEXT DEFAULT 'offline',
            lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
            connectedAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // Playback logs table
        `CREATE TABLE IF NOT EXISTS playback_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            screenId TEXT NOT NULL,
            bookingId TEXT NOT NULL,
            status TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // Admin config table
        `CREATE TABLE IF NOT EXISTS admin_config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    for (const sql of tables) {
        await run(sql);
    }

    // Insert default admin config
    await run(`INSERT OR IGNORE INTO admin_config (key, value) VALUES (?, ?)`,
        ['admin', JSON.stringify({ username: 'admin', password: 'admin123' })]);

    console.log('✅ SQLite tables initialized');
};

// Helper: run SQL
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

// Helper: get single row
const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// Helper: get all rows
const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// Parse JSON fields
const parseJSON = (obj, fields) => {
    if (!obj) return obj;
    fields.forEach(field => {
        if (obj[field] && typeof obj[field] === 'string') {
            try {
                obj[field] = JSON.parse(obj[field]);
            } catch (e) {
                // Keep as string if not valid JSON
            }
        }
    });
    return obj;
};

// Database Helper Functions
const dbHelpers = {
    // Ad operations
    async getAds(options = {}) {
        const { page = 1, limit = 10 } = options;
        const offset = (page - 1) * limit;

        const ads = await all(
            `SELECT * FROM ads ORDER BY uploadedAt DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        const { count } = await get(`SELECT COUNT(*) as count FROM ads`);

        return {
            ads: ads.map(a => parseJSON(a, ['platforms', 'moderationResult'])),
            total: count,
            page,
            totalPages: Math.ceil(count / limit)
        };
    },

    async getAdById(id) {
        const ad = await get(`SELECT * FROM ads WHERE id = ?`, [id]);
        return parseJSON(ad, ['platforms', 'moderationResult']);
    },

    async createAd(adData) {
        const sql = `INSERT INTO ads (id, filename, originalName, path, platforms, platformFolder, size, status, duration, bookingId, gridfsFileId)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await run(sql, [
            adData.id,
            adData.filename,
            adData.originalName,
            adData.path,
            JSON.stringify(adData.platforms || ['default']),
            adData.platformFolder || 'default',
            adData.size,
            adData.status || 'pending',
            adData.duration || 30,
            adData.bookingId || null,
            adData.gridfsFileId || null
        ]);
        return adData;
    },

    async updateAd(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'platforms' || key === 'moderationResult') {
                fields.push(`${key} = ?`);
                values.push(JSON.stringify(value));
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return null;

        values.push(id);
        await run(`UPDATE ads SET ${fields.join(', ')} WHERE id = ?`, values);
        return this.getAdById(id);
    },

    async deleteAd(id) {
        const result = await run(`DELETE FROM ads WHERE id = ?`, [id]);
        return { deletedCount: result.changes };
    },

    async deleteAds(ids) {
        const placeholders = ids.map(() => '?').join(',');
        const result = await run(`DELETE FROM ads WHERE id IN (${placeholders})`, ids);
        return { deletedCount: result.changes };
    },

    // Booking operations
    async getBookings(options = {}) {
        const { page = 1, limit = 10 } = options;
        const offset = (page - 1) * limit;

        const bookings = await all(
            `SELECT * FROM bookings ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        const { count } = await get(`SELECT COUNT(*) as count FROM bookings`);

        return {
            bookings: bookings.map(b => parseJSON(b, ['platforms', 'priceDetails'])),
            total: count,
            page,
            totalPages: Math.ceil(count / limit)
        };
    },

    async getBookingById(id) {
        const booking = await get(`SELECT * FROM bookings WHERE id = ?`, [id]);
        return parseJSON(booking, ['platforms', 'priceDetails']);
    },

    async createBooking(bookingData) {
        const sql = `INSERT INTO bookings (id, adId, state, district, station, platforms, hours, startTime, date, primeTime,
                     customerName, customerEmail, customerPhone, priceDetails, paymentStatus, bookingStatus)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await run(sql, [
            bookingData.id,
            bookingData.adId,
            bookingData.state,
            bookingData.district,
            bookingData.station,
            JSON.stringify(bookingData.platforms || []),
            bookingData.hours,
            bookingData.startTime,
            bookingData.date,
            bookingData.primeTime ? 1 : 0,
            bookingData.customerName,
            bookingData.customerEmail,
            bookingData.customerPhone,
            JSON.stringify(bookingData.priceDetails || {}),
            bookingData.paymentStatus || 'pending',
            bookingData.bookingStatus || 'pending'
        ]);
        return bookingData;
    },

    async updateBooking(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'platforms' || key === 'priceDetails') {
                fields.push(`${key} = ?`);
                values.push(JSON.stringify(value));
            } else if (key === 'primeTime') {
                fields.push(`${key} = ?`);
                values.push(value ? 1 : 0);
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return null;

        values.push(id);
        await run(`UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`, values);
        return this.getBookingById(id);
    },

    async deleteBooking(id) {
        const result = await run(`DELETE FROM bookings WHERE id = ?`, [id]);
        return { deletedCount: result.changes };
    },

    async deleteBookings(ids) {
        const placeholders = ids.map(() => '?').join(',');
        const result = await run(`DELETE FROM bookings WHERE id IN (${placeholders})`, ids);
        return { deletedCount: result.changes };
    },

    // Screen operations
    async getScreens() {
        return await all(`SELECT * FROM screens ORDER BY lastSeen DESC`);
    },

    async getScreenById(screenId) {
        return await get(`SELECT * FROM screens WHERE screenId = ?`, [screenId]);
    },

    async updateScreen(screenId, updates) {
        const existing = await this.getScreenById(screenId);

        if (existing) {
            const fields = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }

            fields.push('lastSeen = ?');
            values.push(new Date().toISOString());

            values.push(screenId);
            await run(`UPDATE screens SET ${fields.join(', ')} WHERE screenId = ?`, values);
        } else {
            await run(`INSERT INTO screens (screenId, station, platform, status, connectedAt, lastSeen)
                       VALUES (?, ?, ?, ?, ?, ?)`,
                [screenId, updates.station || '', updates.platform || '',
                 updates.status || 'offline', updates.connectedAt || null,
                 new Date().toISOString()]);
        }

        return this.getScreenById(screenId);
    },

    // Playback log operations
    async addPlaybackLog(logData) {
        await run(`INSERT INTO playback_logs (screenId, bookingId, status, timestamp)
                   VALUES (?, ?, ?, ?)`,
            [logData.screenId, logData.bookingId, logData.status, new Date().toISOString()]);
        return logData;
    },

    async getPlaybackLogs(limit = 100) {
        return await all(`SELECT * FROM playback_logs ORDER BY timestamp DESC LIMIT ?`, [limit]);
    },

    // Admin config operations
    async getAdminConfig(key) {
        const row = await get(`SELECT value FROM admin_config WHERE key = ?`, [key]);
        if (row && row.value) {
            try {
                return JSON.parse(row.value);
            } catch (e) {
                return row.value;
            }
        }
        return null;
    },

    async setAdminConfig(key, value) {
        await run(`INSERT OR REPLACE INTO admin_config (key, value, updatedAt) VALUES (?, ?, ?)`,
            [key, JSON.stringify(value), new Date().toISOString()]);
        return { key, value };
    },

    // Stats
    async getStats() {
        const [bookingStats, adStats, screenStats] = await Promise.all([
            all(`SELECT paymentStatus, COUNT(*) as count FROM bookings GROUP BY paymentStatus`),
            all(`SELECT status, COUNT(*) as count FROM ads GROUP BY status`),
            all(`SELECT status, COUNT(*) as count FROM screens GROUP BY status`)
        ]);

        const totalBookings = bookingStats.reduce((sum, r) => sum + r.count, 0);
        const totalRevenue = await get(
            `SELECT COALESCE(SUM(
                CAST(json_extract(priceDetails, '$.total') AS REAL)
            ), 0) as total FROM bookings WHERE paymentStatus = 'completed'`
        );

        return {
            totalBookings,
            totalRevenue: totalRevenue?.total || 0,
            pendingAds: adStats.find(r => r.status === 'pending')?.count || 0,
            approvedAds: adStats.find(r => r.status === 'approved')?.count || 0,
            scheduledAds: adStats.find(r => r.status === 'scheduled')?.count || 0,
            onlineScreens: screenStats.find(r => r.status === 'online')?.count || 0
        };
    }
};

// GridFS stub (for compatibility - videos on disk only)
const gridfsHelpers = {
    isAvailable: () => false,
    uploadFile: () => Promise.reject(new Error('GridFS not available with SQLite')),
    downloadFile: () => { throw new Error('GridFS not available'); },
    deleteFile: () => Promise.resolve(),
    findFile: () => Promise.resolve(null)
};

module.exports = {
    connectDB,
    dbHelpers,
    gridfsHelpers
};
