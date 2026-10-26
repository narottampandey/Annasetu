const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const jwt = require('jsonwebtoken');

// GET all notifications (optionally for a user)
router.get('/', async (req, res) => {
    try {
        // Optionally require auth
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (e) { }
        }
        // If user is authenticated, return notifications relevant to them only
        // (either targeted to them or created by them). If not authenticated,
        // return public/broadcast notifications (recipient == null).
        let query = {};
        if (userId) {
            query = { $or: [{ recipient: userId }, { addedBy: userId }] };
        } else {
            query = { recipient: null };
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ notifications });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
    }
});

module.exports = router;
