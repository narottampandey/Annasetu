#!/usr/bin/env node
'use strict';

/**
 * check-donations.js
 * Usage:
 *  node scripts/check-donations.js "<MONGO_URI>" [userIdOrEmail]
 * OR set env var MONGO_URI and run without args.
 *
 * Connects to MongoDB using mongoose and lists donations. If a user identifier
 * (ObjectId or email) is provided, it will try to find donations belonging to
 * that user, using defensive fallbacks (ObjectId, string-id, or email).
 */

const mongoose = require('mongoose');
const path = require('path');

async function main() {
    const argv = process.argv.slice(2);
    const uri = argv[0] || process.env.MONGO_URI || process.env.MONGODB_URI;
    const userIdent = argv[1];

    if (!uri) {
        console.error('ERROR: No Mongo URI provided. Pass it as first arg or set MONGO_URI.');
        console.error('Example: node scripts/check-donations.js "mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/mydb"');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    try {
        // Mongoose v7+ no longer requires/use these legacy options
        await mongoose.connect(uri);
        console.log('Connected to MongoDB.');
    } catch (err) {
        console.error('Failed to connect:', err.message || err);
        process.exit(2);
    }

    // Load models relative to annasetu_servers
    const Donation = require(path.join(__dirname, '..', 'models', 'donation'));
    const User = require(path.join(__dirname, '..', 'models', 'user'));

    try {
        // Summary counts
        const total = await Donation.countDocuments();
        console.log(`Total donations in DB: ${total}`);

        // Show distribution of stored `userId` types (string vs objectId)
        try {
            const ag = await Donation.collection.aggregate([
                { $project: { userIdType: { $type: '$userId' } } },
                { $group: { _id: '$userIdType', count: { $sum: 1 } } }
            ]).toArray();

            console.log('userId type distribution:');
            ag.forEach(g => console.log(`  ${g._id}: ${g.count}`));
        } catch (e) {
            console.warn('Could not run userId type aggregation:', e.message || e);
        }

        // If a user identifier was provided, try to locate that user's donations
        if (userIdent) {
            console.log(`\nLooking up donations for identifier: ${userIdent}`);

            let user = null;
            // Try email lookup if it looks like an email
            if (/@/.test(userIdent)) {
                user = await User.findOne({ email: userIdent }).lean();
                if (user) console.log(`Found user by email: ${user._id} (${user.email})`);
            }

            // If not found and looks like ObjectId, try findById
            if (!user && mongoose.Types.ObjectId.isValid(userIdent)) {
                try {
                    user = await User.findById(userIdent).lean();
                    if (user) console.log(`Found user by id: ${user._id} (${user.email || 'no-email'})`);
                } catch (e) {
                    // ignore
                }
            }

            // Build a defensive query that matches ObjectId, string-id, or email
            const orClauses = [];
            if (user && user._id) {
                orClauses.push({ userId: user._id });
                orClauses.push({ userId: String(user._id) });
                if (user.email) orClauses.push({ userId: user.email });
            } else {
                // If we couldn't find a user document, still try direct matches
                if (mongoose.Types.ObjectId.isValid(userIdent)) orClauses.push({ userId: mongoose.Types.ObjectId(userIdent) });
                orClauses.push({ userId: String(userIdent) });
                if (/@/.test(userIdent)) orClauses.push({ userId: userIdent });
            }

            const query = { $or: orClauses };
            console.log('Using query:', JSON.stringify(query));

            const docs = await Donation.find(query).limit(200).sort({ createdAt: -1 }).populate('userId', 'name email').lean();

            console.log(`Found ${docs.length} donations matching identifier.`);
            docs.forEach((d, i) => {
                const uid = d.userId && (d.userId._id || d.userId) ? (d.userId._id ? String(d.userId._id) + (d.userId.email ? ` (${d.userId.email})` : '') : String(d.userId)) : 'NO_USER';
                console.log(`\n#${i + 1}  id:${d._id}\n  food: ${d.food}\n  qty: ${d.quantity}\n  status: ${d.status}\n  userId: ${uid}\n  createdAt: ${d.createdAt}`);
            });

            if (docs.length === 0) console.log('No donations found for the provided identifier.');

        } else {
            // No user filter: show a sample of donations
            console.log('\nListing up to 50 most recent donations:');
            const sample = await Donation.find({}).limit(50).sort({ createdAt: -1 }).populate('userId', 'name email').lean();
            sample.forEach((d, i) => {
                const uid = d.userId && (d.userId._id || d.userId) ? (d.userId._id ? String(d.userId._id) + (d.userId.email ? ` (${d.userId.email})` : '') : String(d.userId)) : 'NO_USER';
                console.log(`\n#${i + 1}  id:${d._id}\n  food: ${d.food}\n  qty: ${d.quantity}\n  status: ${d.status}\n  userId: ${uid}\n  createdAt: ${d.createdAt}`);
            });
        }

    } catch (err) {
        console.error('Error while querying donations:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
        process.exit(0);
    }
}

main();
