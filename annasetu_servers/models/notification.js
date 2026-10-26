const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Recipient (optional) - used for targeted email notifications
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

module.exports = mongoose.model('Notification', notificationSchema);
