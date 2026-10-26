const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/user');

const emailToDelete = 'madhuluck8412@gmail.com';

async function main() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI not set in .env (aborting)');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const found = await User.findOne({ email: emailToDelete });
        if (!found) {
            console.log('No matching user found for deletion.');
        } else {
            console.log(`Found user: ${found.email}`);
            const result = await User.deleteOne({ email: emailToDelete });
            console.log(`Deleted user: ${emailToDelete}`);
        }

    } catch (err) {
        console.error('Error while deleting user:', err);
        process.exit(1);
    } finally {
        try { await mongoose.disconnect(); } catch (e) { }
        process.exit(0);
    }
}

main();
