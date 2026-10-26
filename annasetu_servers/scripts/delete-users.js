const mongoose = require('mongoose');
const path = require('path');
// load .env from annasetu_servers
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/user');

const emailsToDelete = [
    'madhuluck8412@gmail.com',
    'mamit264448@gmail.com'
];

async function main() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI not set in .env (aborting)');
        process.exit(1);
    }

    try {
        // Mongoose 6+ does not require legacy connect options
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const found = await User.find({ email: { $in: emailsToDelete } }).select('email _id');
        if (!found || found.length === 0) {
            console.log('No matching users found for deletion.');
        } else {
            console.log(`Found ${found.length} user(s):`, found.map(u => u.email));
            const result = await User.deleteMany({ email: { $in: emailsToDelete } });
            console.log(`Deleted ${result.deletedCount} user(s).`);
        }

    } catch (err) {
        console.error('Error while deleting users:', err);
        process.exit(1);
    } finally {
        try { await mongoose.disconnect(); } catch (e) { }
        process.exit(0);
    }
}

main();
