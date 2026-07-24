/**
 * Database Seeding Script
 * Auto-installs default data like WordPress
 */

const { AdminConfig } = require('./db');

// Default locations (Kanpur Central + New Delhi)
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

// Seed database with default data
async function seedDatabase() {
    try {

        // Check if already seeded
        const existingLocations = await AdminConfig.findOne({ key: 'locations' });
        if (existingLocations) {
            return true;
        }

        // Seed locations
        await AdminConfig.create({
            key: 'locations',
            value: DEFAULT_LOCATIONS
        });

        // Seed admin credentials
        await AdminConfig.create({
            key: 'admin',
            value: {
                username: process.env.ADMIN_USERNAME || 'admin',
                password: process.env.ADMIN_PASSWORD || 'admin123'
            }
        });

        // Mark setup complete
        await AdminConfig.create({
            key: 'setupComplete',
            value: true
        });

        return true;
    } catch (error) {
        console.error('❌ Database seeding failed:', error.message);
        return false;
    }
}

module.exports = { seedDatabase, DEFAULT_LOCATIONS };
