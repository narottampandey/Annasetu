const express = require('express');
const router = express.Router();
const { createReview, getReviewsForDonor } = require('../controllers/reviewcontrollers');

// Create review
router.post('/', createReview);

// Get reviews for donor
router.get('/donor/:donorId', getReviewsForDonor);

// Flag a review (user can flag abusive review)
router.post('/:reviewId/flag', require('../controllers/reviewcontrollers').flagReview);

// Resolve flag (admin) - use x-admin-key header for minimal admin auth
router.post('/:reviewId/resolve', require('../controllers/reviewcontrollers').resolveFlag);

module.exports = router;
