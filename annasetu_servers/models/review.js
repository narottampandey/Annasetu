const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    donationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    foodQuality: { type: String },
    packagingQuality: { type: String },
    comments: { type: String },
    flags: [{
        flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: String,
        createdAt: { type: Date, default: Date.now },
        resolved: { type: Boolean, default: false },
        resolvedAt: Date,
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        moderatorNote: String
    }],
    flagsCount: { type: Number, default: 0 },
    isHidden: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
