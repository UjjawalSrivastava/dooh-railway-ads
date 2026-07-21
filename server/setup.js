/**
 * DOOH Platform Setup Wizard
 * Auto-installation like WordPress
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const CONFIG_PATH = path.join(__dirname, '../data/config.json');

// Default locations (same as before)
const DEFAULT_LOCATIONS = {
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

// Check if setup is complete
function isSetupComplete() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            return config.setupComplete === true && config.mongoUri;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// Get config
function getConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        return null;
    }
    return null;
}

// Save config
function saveConfig(config) {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Test MongoDB connection
async function testConnection(mongoUri) {
    try {
        const conn = await mongoose.createConnection(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 1
        }).asPromise();
        await conn.close();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Initialize database with default data
async function initializeDatabase(mongoUri) {
    try {
        await mongoose.connect(mongoUri);

        // Import models
        const { AdminConfig } = require('./db');

        // Store locations config
        await AdminConfig.findOneAndUpdate(
            { key: 'locations' },
            { key: 'locations', value: DEFAULT_LOCATIONS },
            { upsert: true }
        );

        // Store admin credentials
        await AdminConfig.findOneAndUpdate(
            { key: 'admin' },
            { key: 'admin', value: { username: 'admin', password: 'admin123' } },
            { upsert: true }
        );

        // Store setup completion
        await AdminConfig.findOneAndUpdate(
            { key: 'setupComplete' },
            { key: 'setupComplete', value: true },
            { upsert: true }
        );

        await mongoose.disconnect();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Setup routes for Express
function setupRoutes(app) {
    // Check setup status
    app.get('/api/setup/status', (req, res) => {
        const config = getConfig();
        res.json({
            setupComplete: isSetupComplete(),
            hasConfig: !!config
        });
    });

    // Test database connection
    app.post('/api/setup/test-db', async (req, res) => {
        const { mongoUri } = req.body;
        if (!mongoUri) {
            return res.status(400).json({ error: 'MongoDB URI required' });
        }

        const result = await testConnection(mongoUri);
        res.json(result);
    });

    // Complete setup
    app.post('/api/setup/complete', async (req, res) => {
        const { mongoUri, adminUsername, adminPassword } = req.body;

        if (!mongoUri) {
            return res.status(400).json({ error: 'MongoDB URI required' });
        }

        // Test connection first
        const testResult = await testConnection(mongoUri);
        if (!testResult.success) {
            return res.status(400).json({ error: 'Cannot connect to MongoDB: ' + testResult.error });
        }

        // Initialize database
        const initResult = await initializeDatabase(mongoUri);
        if (!initResult.success) {
            return res.status(500).json({ error: 'Failed to initialize database: ' + initResult.error };
        }

        // Save config locally
        saveConfig({
            setupComplete: true,
            mongoUri: mongoUri,
            adminUsername: adminUsername || 'admin',
            adminPassword: adminPassword || 'admin123',
            setupAt: new Date().toISOString()
        });

        res.json({ success: true, message: 'Setup complete! Restart server to apply changes.' });
    });

    // Serve setup page
    app.get('/setup', (req, res) => {
        if (isSetupComplete()) {
            return res.redirect('/');
        }
        res.sendFile(path.join(__dirname, '../setup/setup.html'));
    });

    // Redirect root to setup if not complete
    app.get('/', (req, res, next) => {
        if (!isSetupComplete() && !req.path.startsWith('/setup')) {
            return res.redirect('/setup');
        }
        next();
    });
}

module.exports = {
    isSetupComplete,
    getConfig,
    saveConfig,
    setupRoutes,
    DEFAULT_LOCATIONS
};
