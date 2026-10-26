const mongoose = require('mongoose');
const Review = require('../models/review');
const Donation = require('../models/donation');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const { sendNotificationEmail } = require('../utils/email');

// Create a review: atomic create + update donor rating + mark donation reviewSubmitted
exports.createReview = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }

        const reviewerId = decoded.id;
        const { donationId, donorId, rating, foodQuality, packagingQuality, comments } = req.body;

        // Basic validation
        if (!donationId || !donorId || !rating) {
            return res.status(400).json({ message: 'donationId, donorId and rating are required' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'rating must be between 1 and 5' });
        }

        const donation = await Donation.findById(donationId);
        if (!donation) return res.status(404).json({ message: 'Donation not found' });

        // Ensure donation is completed/delivered
        if (!donation.deliveredAt && donation.status !== 'Completed') {
            return res.status(400).json({ message: 'Cannot review before delivery is confirmed' });
        }

        // Ensure reviewer is the claimant
        const isClaimant = String(donation.claimedBy) === String(reviewerId) || donation.claims.some(c => String(c.userId) === String(reviewerId));
        if (!isClaimant) return res.status(403).json({ message: 'Only the claimant can submit a review' });

        // Prevent duplicate review for this donation by this reviewer
        const existing = await Review.findOne({ donationId, reviewerId });
        if (existing) return res.status(409).json({ message: 'Review already submitted for this donation by this user' });

        // Start transaction
        let resultReview = null;
        await session.withTransaction(async () => {
            // Create review
            resultReview = await Review.create([{
                reviewerId,
                donorId,
                donationId,
                rating,
                foodQuality,
                packagingQuality,
                comments
            }], { session });

            // Update donor rating atomically
            const donor = await User.findById(donorId).session(session);
            if (!donor) throw new Error('Donor not found');

            const oldAvg = donor.averageRating || 0;
            const oldCount = donor.ratingCount || 0;
            const newCount = oldCount + 1;
            const newAvg = ((oldAvg * oldCount) + rating) / newCount;

            donor.averageRating = newAvg;
            donor.ratingCount = newCount;
            await donor.save({ session });

            // Mark donation as review submitted
            donation.reviewSubmitted = true;
            await donation.save({ session });
        });

        // Emit socket event to donor
        try {
            const io = req.app.get('io');
            if (io) {
                io.sockets.sockets.forEach((socket) => {
                    let socketUserId = null;
                    if (socket.handshake.auth && socket.handshake.auth.token) {
                        try {
                            const decodedSocket = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
                            socketUserId = String(decodedSocket.id);
                        } catch (e) { }
                    }
                    if (socketUserId && socketUserId === String(donorId)) {
                        socket.emit('review_submitted', { donationId, rating });
                    }
                });
            }
        } catch (ioErr) {
            console.error('Failed to emit review_submitted socket event:', ioErr);
        }

        // Send email notification to donor if they opted in
        try {
            const donor = await User.findById(donorId).select('email emailNotifications name');
            if (donor && donor.email && donor.emailNotifications) {
                const subject = 'New review for your donation on AnnaSetu';
                const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 5000}`;
                const link = `${frontendUrl}/profile.html?userId=${donor._id}`;
                const html = `<p>Hi ${donor.name || ''},</p><p>Your donation received a new review (${rating}/5).</p><p><a href="${link}">View reviews</a></p>`;
                sendNotificationEmail({ to: donor.email, subject, html }).catch(err => console.error('Email send failed:', err));
            }
        } catch (emailErr) {
            console.error('Failed to send review notification email:', emailErr);
        }

        return res.status(201).json({ message: 'Review submitted', review: resultReview[0] });

    } catch (error) {
        console.error('createReview error:', error);
        return res.status(500).json({ message: 'Failed to submit review', error: error.message });
    } finally {
        session.endSession();
    }
};

// Optional: list reviews for a donor
exports.getReviewsForDonor = async (req, res) => {
    try {
        const { donorId } = req.params;
        if (!donorId) return res.status(400).json({ message: 'donorId required' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Hide moderated/hidden reviews by default unless explicitly requested
        const showHidden = req.query.showHidden === '1';
        const filter = { donorId };
        if (!showHidden) filter.isHidden = { $ne: true };

        const reviews = await Review.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('reviewerId', 'name email');

        const count = await Review.countDocuments(filter);

        return res.status(200).json({ reviews, count, page, pages: Math.ceil(count / limit) });
    } catch (error) {
        console.error('getReviewsForDonor error:', error);
        return res.status(500).json({ message: 'Failed to fetch reviews', error: error.message });
    }
};

// Flag a review as abusive/problematic
exports.flagReview = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'No token provided' });
        const token = authHeader.split(' ')[1];
        let decoded;
        try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch (e) { return res.status(401).json({ message: 'Invalid token' }); }

        const userId = decoded.id;
        const { reviewId } = req.params;
        const { reason } = req.body;
        if (!reviewId) return res.status(400).json({ message: 'reviewId required' });

        const review = await Review.findById(reviewId);
        if (!review) return res.status(404).json({ message: 'Review not found' });

        review.flags.push({ flaggedBy: userId, reason: reason || 'Flagged by user' });
        review.flagsCount = (review.flagsCount || 0) + 1;

        // Auto-hide if flags exceed threshold
        const FLAG_THRESHOLD = parseInt(process.env.REVIEW_FLAG_THRESHOLD || '3');
        if (review.flagsCount >= FLAG_THRESHOLD) {
            review.isHidden = true;
        }

        await review.save();
        return res.status(200).json({ message: 'Review flagged', flagsCount: review.flagsCount, isHidden: review.isHidden });
    } catch (error) {
        console.error('flagReview error:', error);
        return res.status(500).json({ message: 'Failed to flag review', error: error.message });
    }
};

// Resolve flag (admin only) - set resolved flags and optionally unhide or keep hidden
exports.resolveFlag = async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (!adminKey || adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ message: 'Admin key required' });

        const { reviewId } = req.params;
        const { action, moderatorNote } = req.body; // action: 'keep-hidden' | 'unhide'
        if (!reviewId) return res.status(400).json({ message: 'reviewId required' });

        const review = await Review.findById(reviewId);
        if (!review) return res.status(404).json({ message: 'Review not found' });

        // Mark all flags resolved
        review.flags = review.flags.map(f => ({ ...f.toObject ? f.toObject() : f, resolved: true, resolvedAt: new Date(), resolvedBy: null }));
        review.flagsCount = 0;
        if (action === 'unhide') review.isHidden = false;
        if (action === 'keep-hidden') review.isHidden = true;
        if (moderatorNote) review.moderatorNote = moderatorNote;

        await review.save();
        return res.status(200).json({ message: 'Flags resolved', isHidden: review.isHidden });
    } catch (error) {
        console.error('resolveFlag error:', error);
        return res.status(500).json({ message: 'Failed to resolve flag', error: error.message });
    }
};
