const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    phone: String,

    location: String,

    password: {
        type: String,
        required: false
    },

    // Email verification
    isVerified: {
        type: Boolean,
        default: false
    },

    verificationToken: String,
    verificationTokenExpires: Date,
    // Password reset fields
    passwordResetToken: String,
    passwordResetExpires: Date,
    // Google OAuth fields
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },

    googleEmail: String,
    googleName: String,
    googleProfilePicture: String,
    // Store refresh token so server can re-fetch Google profile when needed
    googleRefreshToken: String,

    // Authentication method
    authMethod: {
        type: String,
        enum: ['email', 'google'],
        default: 'email'
    },

    // Email notification preference
    emailNotifications: {
        type: Boolean,
        default: true
    },

    // Donation tracking
    donationsMade: {
        type: Number,
        default: 0
    },

    donationsReceived: {
        type: Number,
        default: 0
    },

    // Aggregate rating fields
    averageRating: {
        type: Number,
        default: 0
    },

    ratingCount: {
        type: Number,
        default: 0
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

module.exports = mongoose.model("User", userSchema);