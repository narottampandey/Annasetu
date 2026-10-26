const express = require("express");
const router = express.Router();

const {
  createDonation,
  getUserDonations,
  getAllDonations,
  updateDonation,
  deleteDonation,
  claimDonation,
  unclaimDonation,
  acceptClaim,
  rejectClaim,
  getUserClaims,
  completeDonationAndRate,
  confirmDelivery,
  editDonation,
  debugClearAllDonations,
  debugGetAllDonationsWithUsers
} = require("../controllers/donationcontrollers");

// Debug logging middleware
router.use((req, res, next) => {
  console.log(`[DONATION] ${req.method} ${req.path} - Auth: ${req.headers.authorization ? 'Yes' : 'No'}`);
  next();
});

// Create new donation
router.post("/create", (req, res, next) => {
  console.log("[DONATION] POST /create - Body size:", JSON.stringify(req.body).length, "bytes");
  next();
}, createDonation);

// Get current user's donations
router.get("/my-donations", getUserDonations);

// Get all available donations (for browsing)
router.get("/available", getAllDonations);

// Update donation status
router.put("/:donationId", updateDonation);

// Delete donation
router.delete("/:donationId", deleteDonation);

// Edit donation (owner only, before being claimed)
router.patch("/:donationId", editDonation);

// Claim/Unclaim
router.post("/:donationId/claim", claimDonation);
router.delete("/:donationId/claim", unclaimDonation);

// Accept/Reject claims (donor only)
router.post("/:donationId/claims/:claimUserId/accept", acceptClaim);
router.post("/:donationId/claims/:claimUserId/reject", rejectClaim);

// Confirm delivery by claimant
router.post('/:donationId/confirm-delivery', confirmDelivery);

// Get user's claims
router.get("/user/my-claims", getUserClaims);

// Complete donation and rate
router.post("/:donationId/complete", completeDonationAndRate);

// DEBUG ENDPOINTS (development only - REMOVE OR SECURE IN PRODUCTION)
// These endpoints are useful for testing but should NEVER be exposed in production
// Only available when NODE_ENV === 'development'
router.delete("/debug/clear-all", debugClearAllDonations);
router.get("/debug/all-with-users", debugGetAllDonationsWithUsers);

module.exports = router;
