const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  food: {
    type: String,
    required: true
  },

  quantity: {
    type: String,
    required: true
  },

  foodType: {
    type: String,
    enum: ["Vegetarian", "Non-Veg", "Vegan"],
    required: true
  },

  description: {
    type: String,
    required: true
  },

  location: {
    type: String,
    required: true
  },

  coordinates: {
    latitude: Number,
    longitude: Number
  },

  cookedTime: {
    type: Date,
    required: true
  },

  images: {
    type: [String], // Array of base64 or image URLs
    default: []
  },

  aiAnalysis: {
    human: Number,
    cattle: Number,
    fertilizer: Number,
    recommendation: String,
    confidence: String
  },

  status: {
    type: String,
    enum: ["Available", "Cattle Feed", "Organic Compost", "Claimed", "Completed", "Expired"],
    default: "Available"
  },

  // Claim tracking
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  claims: [{
    userId: mongoose.Schema.Types.ObjectId,
    userName: String,
    userEmail: String,
    userPhone: String,
    claimedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    // Request details
    purpose: String, // e.g., "Personal use", "Community center", "Hostel", "Event"
    beneficiaries: Number, // How many people will benefit
    notes: String, // Additional notes/requirements
    address: String, // Delivery address
    preferredPickupTime: String // When they want to pick up
  }],

  // Rating after completion
  rating: {
    score: { type: Number, min: 1, max: 5, default: null },
    foodQuality: { type: String },
    packagingQuality: { type: String },
    review: String,
    ratedBy: mongoose.Schema.Types.ObjectId,
    ratedAt: Date
  },

  isCompleted: {
    type: Boolean,
    default: false
  },

  // Delivery metadata
  deliveredAt: {
    type: Date,
    default: null
  },

  reviewSubmitted: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Donation", donationSchema);
