const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

// Helper function to detect and handle MongoDB network errors
function handleDatabaseError(error) {
    if (error.name === 'MongoNetworkError' || error.name === 'MongoNetworkTimeoutError') {
        return {
            status: 503,
            message: "Database temporarily unavailable. Please check your internet connection and try again.",
            isDatabaseError: true
        };
    }
    return null;
}

// REGISTER

exports.registerUser = async (req, res) => {

    try {

        const { name, email, phone, password } = req.body;

        // Validate input
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: "Please provide all required fields" });
        }

        // check if user exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "User already exists with this email" });
        }

        // hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // create user (auto-verified if email SMTP is not configured)
        const isEmailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
        const user = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            isVerified: !isEmailConfigured
        });

        // generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await user.save();

        if (isEmailConfigured) {
            try {
                await sendVerificationEmail({ to: user.email, name: user.name, token: verificationToken });
            } catch (emailErr) {
                console.error('Failed to send verification email:', emailErr);
            }
            res.status(201).json({ message: "User registered successfully. Please check your email to verify your account.", userId: user._id });
        } else {
            console.log("Email service not configured: Account automatically verified for immediate access:", user.email);
            res.status(201).json({ message: "User registered successfully! You can now log in.", userId: user._id });
        }

    } catch (error) {
        console.error("Registration error:", error.message);
        res.status(500).json({ message: "Registration failed", error: error.message });
    }

};



// LOGIN

exports.loginUser = async (req, res) => {

    try {

        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide email and password" });
        }

        // check user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Guard against Google-only accounts or missing password
        if (!user.password) {
            return res.status(400).json({ message: "This account uses Google Sign-In. Please use Google login." });
        }

        // compare password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // For email/password users, ensure email is verified
        if (user.authMethod === 'email' && !user.isVerified) {
            return res.status(403).json({ message: "Please verify your email before logging in" });
        }

        // Ensure JWT secret exists
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET is not defined in environment variables.");
            return res.status(500).json({ message: "Server configuration error: JWT secret is missing" });
        }

        // create token
        const token = jwt.sign(
            { id: user._id },
            jwtSecret,
            { expiresIn: "7d" }
        );

        console.log("User logged in successfully:", user.email);

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({ message: "Login failed", error: error.message });
    }

};


// GOOGLE OAUTH CALLBACK

exports.googleCallback = async (req, res) => {
    try {
        const { id, displayName, emails, photos } = req.user;
        const email = emails[0].value;
        const profilePicture = photos[0]?.value || null;

        // Check if user exists
        let user = await User.findOne({ googleId: id });

        if (!user) {
            // Check if email already exists (email/password user)
            let existingEmailUser = await User.findOne({ email });

            if (existingEmailUser) {
                // Update existing user with Google info
                user = await User.findByIdAndUpdate(
                    existingEmailUser._id,
                    {
                        googleId: id,
                        googleName: displayName,
                        googleEmail: email,
                        googleProfilePicture: profilePicture,
                        authMethod: 'google'
                    },
                    { new: true }
                );
            } else {
                // Create new user
                user = await User.create({
                    name: displayName,
                    email,
                    googleId: id,
                    googleName: displayName,
                    googleEmail: email,
                    googleProfilePicture: profilePicture,
                    authMethod: 'google'
                });
            }
        }

        // Create JWT token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        console.log("User logged in with Google:", email);

        // Redirect to frontend with token
        res.redirect(`http://localhost:5000/dashboard.html?token=${token}&userId=${user._id}&userName=${encodeURIComponent(user.name)}&userEmail=${encodeURIComponent(user.email)}`);

    } catch (error) {
        console.error("Google callback error:", error);
        res.status(500).json({ message: "Google authentication failed", error: error.message });
    }
};


// GOOGLE LOGIN SUCCESS - returns user data

exports.getGoogleLoginSuccess = async (req, res) => {
    try {
        // Extract token from query or headers
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        const userId = req.query.userId;

        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            message: "Google login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePicture: user.googleProfilePicture
            }
        });

    } catch (error) {
        console.error("Error getting Google login success:", error);
        res.status(500).json({ message: "Failed to process login", error: error.message });
    }
};


// GET USER STATS - Donations made and received

exports.getUserStats = async (req, res) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        console.log(`Fetching stats for user: ${user.email}`);

        res.status(200).json({
            message: "User stats retrieved successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                profilePicture: user.googleProfilePicture || null,
                emailNotifications: user.emailNotifications || false,
                donationsMade: user.donationsMade || 0,
                donationsReceived: user.donationsReceived || 0,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error("Error getting user stats:", error);

        // Check if it's a database connectivity issue
        const dbError = handleDatabaseError(error);
        if (dbError) {
            return res.status(dbError.status).json({ message: dbError.message });
        }

        res.status(500).json({ message: "Invalid token or failed to fetch stats", error: error.message });
    }
};


// EMAIL VERIFICATION HANDLER
exports.verifyEmail = async (req, res) => {
    try {
        const token = req.query.token || req.body.token;
        if (!token) return res.status(400).json({ message: 'Verification token missing' });

        const user = await User.findOne({
            verificationToken: token,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired verification token' });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 5000}`;
        return res.redirect(`${frontendUrl}/login.html?verified=1`);

    } catch (error) {
        console.error('verifyEmail error:', error);
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
};


// ANALYZE FOOD WITH AI

exports.analyzeFoodWithAI = async (req, res) => {
    try {
        // Get token and verify user
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const { images, description } = req.body;

        // Accept either images or text description
        if ((!images || (Array.isArray(images) && images.length === 0)) && (!description || description.trim() === '')) {
            return res.status(400).json({ message: "Please provide either images or a food description" });
        }

        console.log(`\n=== AI Food Analysis Request ===`);
        console.log(`User: ${user.email}`);

        let analyses = [];
        let combinedAnalysis = null;

        // Analyze text if provided
        if (description && description.trim()) {
            console.log(`Analyzing text description: "${description.substring(0, 50)}..."`);
            const textAnalysis = await performTextAnalysis(description);
            analyses.push({ type: "text", analysis: textAnalysis });
            console.log(`✓ Text analysis complete: Human=${textAnalysis.human}%, Cattle=${textAnalysis.cattle}%, Fertilizer=${textAnalysis.fertilizer}%`);
        }

        // Analyze images if provided
        if (images && Array.isArray(images) && images.length > 0) {
            console.log(`Analyzing ${images.length} image(s)`);
            const imageAnalysis = await performAIAnalysis(images[0]);
            analyses.push({ type: "image", analysis: imageAnalysis });
            console.log(`✓ Image analysis complete: Human=${imageAnalysis.human}%, Cattle=${imageAnalysis.cattle}%, Fertilizer=${imageAnalysis.fertilizer}%`);
        }

        // Combine analyses if both are available
        if (analyses.length > 1) {
            console.log(`\n📊 Combining text and image analyses...`);
            combinedAnalysis = combineAnalyses(analyses);
            console.log(`✓ Combined analysis: Human=${combinedAnalysis.human}%, Cattle=${combinedAnalysis.cattle}%, Fertilizer=${combinedAnalysis.fertilizer}%`);
        } else if (analyses.length === 1) {
            combinedAnalysis = analyses[0].analysis;
        }

        if (!combinedAnalysis) {
            return res.status(400).json({ message: "No valid analysis could be performed" });
        }

        console.log(`✓ AI analysis complete`);
        console.log(`Result: Human=${combinedAnalysis.human}%, Cattle=${combinedAnalysis.cattle}%, Fertilizer=${combinedAnalysis.fertilizer}%\n`);

        // Determine the primary category
        const category = determineCategory(combinedAnalysis);
        console.log(`📌 Category Decision: ${category.emoji} ${category.label} - ${category.description}`);

        res.status(200).json({
            message: "Food analysis successful",
            analysis: combinedAnalysis,
            category: category,
            sources: analyses.map(a => a.type)
        });

    } catch (error) {
        console.error("Error in AI analysis:", error);
        res.status(500).json({ message: "AI analysis failed", error: error.message });
    }
};


// ==============================================
// AI ANALYSIS FUNCTION - BLUEPRINT
// ==============================================
// Replace this function with actual AI API calls
// This serves as a template for integration
// ==============================================

async function performTextAnalysis(description) {
    try {
        console.log("Analyzing food text description...");

        // Try Gemini if available, but don't spend time retrying
        if (process.env.GEMINI_API_KEY) {
            try {
                console.log("Attempting Gemini API analysis...");
                const result = await analyzeTextWithGemini(description);
                if (result) {
                    console.log("✓ Using Gemini AI analysis");
                    console.log("Gemini Result:", result);
                    return result;
                } else {
                    console.log("⚠️ Gemini returned null, falling back to keywords");
                }
            } catch (error) {
                console.log("⚠️ Gemini API unavailable, using intelligent keyword-based analysis");
                console.error("❌ Gemini Error Details:", error.message); // Show the actual error
            }
        } else {
            console.log("⚠️ GEMINI_API_KEY not set in environment");
        }

        // Use intelligent keyword-based analysis (main method)
        return await intelligentFoodAnalysis(description);

    } catch (error) {
        console.error("Error in text analysis:", error);
        return getPlaceholderAnalysis();
    }
}

// ==========================================
// INTELLIGENT FOOD ANALYSIS (PRIMARY METHOD)
// ==========================================

async function intelligentFoodAnalysis(description) {
    console.log("Using intelligent food quality assessment...");

    const text = description.toLowerCase();

    // Enhanced food quality indicators
    const indicators = {
        spoilage: {
            severe: ['moldy', 'rotten', 'decomposed', 'spoiled', 'fungus', 'decaying', 'green mold', 'black mold'],
            minor: ['dark spots', 'small mold', 'wrinkled', 'soft', 'aged', 'slightly discolored']
        },
        freshness: {
            fresh: ['fresh', 'new', 'today', 'just made', 'clean', 'good condition', 'perfect', 'excellent', 'well cooked'],
            stale: ['old', 'few days old', '3 days', '4 days', '5 days', 'stale']
        },
        allergens: ['onion', 'garlic', 'chocolate', 'nut', 'peanut'],
        categories: {
            cooked: ['cooked', 'prepared', 'rice', 'curry', 'bread', 'meal', 'fried', 'boiled', 'grilled', 'baked', 'roti', 'chapati', 'daal', 'dal'],
            raw: ['raw', 'vegetable', 'fruit', 'fresh produce', 'uncooked', 'salad']
        }
    };

    let humanScore = 65;
    let cattleScore = 25;
    let fertilizerScore = 10;
    let recommendation = "";
    let reasoning = [];
    let foodType = "General Food";
    let isFresh = false;
    let hasSevereSpoilage = false;
    let hasMinorSpoilage = false;

    // Check category
    const isCooked = indicators.categories.cooked.some(k => text.includes(k));
    const isRaw = indicators.categories.raw.some(k => text.includes(k));
    foodType = isCooked ? "Cooked Food" : isRaw ? "Raw Produce" : "General Food";

    // Check for severe spoilage
    hasSevereSpoilage = indicators.spoilage.severe.some(k => text.includes(k));
    if (hasSevereSpoilage) {
        humanScore = 5;
        cattleScore = 10;
        fertilizerScore = 85;
        recommendation = "⚠️ UNSAFE: Severe spoilage detected. Not suitable for human or animal consumption. Recommended for composting/fertilizer production.";
        reasoning.push("Severe spoilage");
    } else {
        // Check for minor spoilage
        hasMinorSpoilage = indicators.spoilage.minor.some(k => text.includes(k));
        if (hasMinorSpoilage) {
            humanScore = 20;
            cattleScore = 40;
            fertilizerScore = 40;
            recommendation = "⚠️ QUESTIONABLE: Minor spoilage detected. Not recommended for humans but suitable for animal feed or composting.";
            reasoning.push("Minor spoilage");
        } else {
            // Check freshness
            isFresh = indicators.freshness.fresh.some(k => text.includes(k));
            const isStale = indicators.freshness.stale.some(k => text.includes(k));

            if (isFresh) {
                humanScore = isCooked ? 85 : 90;
                cattleScore = isCooked ? 10 : 5;
                fertilizerScore = isCooked ? 5 : 5;
                recommendation = "✅ EXCELLENT: Fresh and safe. Highly recommended for human consumption and donation.";
                reasoning.push("Fresh condition");
            } else if (isStale) {
                humanScore = 40;
                cattleScore = 50;
                fertilizerScore = 10;
                recommendation = "⚠️ AGING: Food is getting old. Can be used for animal feed or immediate donation.";
                reasoning.push("Aging food");
            } else {
                // Default assessment based on category
                if (isCooked) {
                    humanScore = 75;
                    cattleScore = 15;
                    fertilizerScore = 10;
                    recommendation = "✅ GOOD: Cooked food appears safe. Suitable for donation.";
                } else if (isRaw) {
                    humanScore = 80;
                    cattleScore = 10;
                    fertilizerScore = 10;
                    recommendation = "✅ GOOD: Fresh produce appears safe. Suitable for donation.";
                } else {
                    humanScore = 70;
                    cattleScore = 20;
                    fertilizerScore = 10;
                    recommendation = "✓ ACCEPTABLE: Food appears suitable for donation with proper handling.";
                }
                reasoning.push("Standard assessment");
            }
        }
    }

    // Check for allergens that affect cattle
    const hasAllergens = indicators.allergens.some(k => text.includes(k));
    if (hasAllergens) {
        cattleScore = 0; // Unsafe for cattle
        reasoning.push("Contains allergens (unsafe for cattle)");
    }

    console.log(`Analysis: ${reasoning.join(', ')}`);

    return {
        human: humanScore,
        cattle: cattleScore,
        fertilizer: fertilizerScore,
        recommendation: recommendation,
        confidence: "high",
        details: {
            food_type: foodType,
            freshness: hasSevereSpoilage ? "spoiled" : hasMinorSpoilage ? "degraded" : isFresh ? "fresh" : "neutral",
            condition: hasSevereSpoilage ? "unsafe" : hasMinorSpoilage ? "questionable" : "safe",
            analysis_method: "Intelligent keyword-based assessment"
        }
    };
}

// ==========================================
// GEMINI TEXT ANALYSIS FUNCTION
// ==========================================

async function analyzeTextWithGemini(description) {
    try {
        console.log("Attempting Google Gemini API (REST)...");

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY not configured");
        }

        const prompt = `You are a food quality and waste management expert. Analyze this food and provide a suitability assessment.
Food description: "${description}"

Respond ONLY as valid JSON (no markdown, no extra text):
{
  "human": <0-100 percentage for human consumption>,
  "cattle": <0-100 percentage for animal feed>,
  "fertilizer": <0-100 percentage for composting>,
  "best_category": "<human|cattle|compost>",
  "recommendation": "<detailed explanation of why this food is best suited for [human consumption/animal feed/composting] and any food safety concerns>"
}

ANALYSIS RULES:
- If spoiled/moldy/rotten: human=5-15%, cattle=5-15%, fertilizer=80-100%, best_category=compost
- If fresh/excellent: human=80-100%, cattle=10-20%, fertilizer=5-15%, best_category=human
- If aging/slightly degraded: human=30-60%, cattle=40-60%, fertilizer=20-40%, best_category=cattle
- Cattle is UNSAFE if contains allergens (onion, garlic, chocolate, nuts, peanut)
- Always explain the food safety implications in recommendation`;

        const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash"];
        let lastError = null;

        for (const model of modelsToTry) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                        }),
                    }
                );

                const rawBody = await response.text();
                if (!response.ok) {
                    let detail = rawBody;
                    try {
                        detail = JSON.stringify(JSON.parse(rawBody));
                    } catch (parseError) {
                        // keep raw body as-is when it's not JSON
                    }

                    const err = new Error(`API ${response.status} ${response.statusText} - ${detail}`);
                    err.status = response.status;
                    throw err;
                }

                const data = JSON.parse(rawBody);
                const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) throw new Error("No response text");

                console.log("Raw Gemini Response:", responseText); // Log what Gemini returned

                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("No JSON found");

                const analysis = JSON.parse(jsonMatch[0]);
                console.log("Parsed Gemini JSON:", analysis); // Log parsed response

                // Validate and normalize the scores
                let human = Math.max(0, Math.min(100, analysis.human || 50));
                let cattle = Math.max(0, Math.min(100, analysis.cattle || 30));
                let fertilizer = Math.max(0, Math.min(100, analysis.fertilizer || 20));

                // If food is spoiled (high fertilizer), ensure human is very low
                if (fertilizer > 70 && human > 20) {
                    human = Math.max(5, human * 0.3); // Reduce human score significantly
                    cattle = Math.min(cattle, 30);
                }

                // If food is fresh (low fertilizer), ensure human is high
                if (fertilizer < 20 && human < 70) {
                    human = Math.max(human, 75);
                }

                console.log(`Gemini scores - Human: ${human}%, Cattle: ${cattle}%, Fertilizer: ${fertilizer}%`);

                return {
                    human: Math.round(human),
                    cattle: Math.round(cattle),
                    fertilizer: Math.round(fertilizer),
                    recommendation: analysis.recommendation || "Analysis complete",
                    confidence: "high"
                };
            } catch (error) {
                lastError = error;
                if (error && (error.status === 400 || error.status === 404)) {
                    console.log(`Gemini model ${model} failed (${error.message}). Trying fallback if available...`);
                    continue;
                }
                throw error;
            }
        }

        if (lastError) {
            throw lastError;
        }

    } catch (error) {
        console.log("Gemini API unavailable:", error.message);
        console.error("Full Gemini error:", error); // Add full error details
        return null; // Signal to use fallback
    }
}

// ==========================================
// KEYWORD-BASED FALLBACK ANALYSIS
// ==========================================

function keywordBasedTextAnalysis(description) {
    try {
        console.log("Using keyword-based text analysis (fallback)...");

        // Convert to lowercase for keyword matching
        const text = description.toLowerCase();

        // Define food quality indicators
        const indicators = {
            fresh_keywords: ['fresh', 'cooked today', 'new', 'today', 'just made', 'clean', 'good condition', 'perfect', 'excellent', 'well cooked'],
            spoiled_keywords: ['moldy', 'rotten', 'decomposed', 'spoiled', 'bad', 'off', 'smell', 'sour', 'green mold', 'black mold', 'fungus', 'decaying', 'old'],
            slightly_bad_keywords: ['old', 'few days', 'slightly', 'dark spots', 'minor', 'small mold', 'wrinkled', 'soft', '3 days old', '4 days old'],
            cooked_keywords: ['cooked', 'prepared', 'rice', 'curry', 'bread', 'meal', 'fried', 'boiled', 'grilled', 'baked', 'roti', 'chapati'],
            raw_keywords: ['raw', 'vegetable', 'fruit', 'fresh produce', 'uncooked']
        };

        let humanScore = 50;
        let cattleScore = 30;
        let fertilizerScore = 20;
        let recommendation = "";
        let reasoning = [];

        // Check for spoilage indicators (most important)
        let hasSpoiled = indicators.spoiled_keywords.some(keyword => text.includes(keyword));
        let hasSlightlyBad = indicators.slightly_bad_keywords.some(keyword => text.includes(keyword));

        if (hasSpoiled) {
            humanScore = 5;
            cattleScore = 10;
            fertilizerScore = 85;
            recommendation = "⚠️ This food shows signs of significant spoilage and decomposition. It's unsuitable for human or animal consumption but excellent for composting and fertilizer production. Send to fertilizer firms.";
            reasoning.push("Spoilage detected");
        } else if (hasSlightlyBad) {
            humanScore = 20;
            cattleScore = 40;
            fertilizerScore = 40;
            recommendation = "⚠️ This food shows minor spoilage signs. Not recommended for humans but can be used as animal feed. Can also be composted.";
            reasoning.push("Minor spoilage detected");
        } else {
            // Check freshness
            let hasFresh = indicators.fresh_keywords.some(keyword => text.includes(keyword));

            if (hasFresh) {
                humanScore = 85;
                cattleScore = 10;
                fertilizerScore = 5;
                recommendation = "✅ Excellent! This food is fresh and safe for human consumption. Highly recommended for donation to those in need.";
                reasoning.push("Fresh and clean");
            } else {
                // Check if cooked or raw
                let isCooked = indicators.cooked_keywords.some(keyword => text.includes(keyword));
                let isRaw = indicators.raw_keywords.some(keyword => text.includes(keyword));

                if (isCooked) {
                    humanScore = 70;
                    cattleScore = 20;
                    fertilizerScore = 10;
                    recommendation = "✅ This cooked food appears suitable for human consumption. Safe to donate for immediate distribution.";
                    reasoning.push("Cooked food detected");
                } else if (isRaw) {
                    humanScore = 75;
                    cattleScore = 15;
                    fertilizerScore = 10;
                    recommendation = "✅ This fresh produce is suitable for human consumption. Can be distributed to those in need.";
                    reasoning.push("Fresh produce detected");
                } else {
                    humanScore = 65;
                    cattleScore = 25;
                    fertilizerScore = 10;
                    recommendation = "✓ This food appears to be in acceptable condition. Suitable for human consumption with proper handling.";
                    reasoning.push("General assessment");
                }
            }
        }

        console.log(`Analysis reasoning: ${reasoning.join(', ')}`);

        return {
            human: humanScore,
            cattle: cattleScore,
            fertilizer: fertilizerScore,
            recommendation: recommendation,
            confidence: "high",
            details: {
                freshness: hasSpoiled ? "spoiled" : hasSlightlyBad ? "degraded" : "good",
                condition: hasSpoiled ? "unsafe" : hasSlightlyBad ? "questionable" : "safe",
                estimated_shelf_life: hasSpoiled ? "0 days" : hasSlightlyBad ? "1 day" : "3-5 days",
                warnings: hasSpoiled ? ["Serious spoilage detected", "Not for human/animal consumption"] : hasSlightlyBad ? ["Minor spoilage present"] : [],
                category: indicators.cooked_keywords.some(k => text.includes(k)) ? "Cooked Food" : "Raw/Fresh"
            }
        };

    } catch (error) {
        console.error("Error in keyword-based analysis:", error);
        return getPlaceholderAnalysis();
    }
}

async function performAIAnalysis(imageDataUrl) {
    try {
        console.log("Analyzing food image with Gemini...");

        // Use Google Gemini API if available
        if (process.env.GEMINI_API_KEY) {
            return await analyzeWithGemini(imageDataUrl);
        }

        // Fallback to placeholder if no API key
        console.log("⚠️ Gemini API key not configured, using placeholder analysis");
        return getPlaceholderAnalysis();

    } catch (error) {
        console.error("Error in AI analysis:", error);
        return getPlaceholderAnalysis(); // Fallback to default
    }
}

// ==========================================
// GOOGLE GEMINI API INTEGRATION
// ==========================================

async function analyzeWithGemini(imageDataUrl, retryCount = 0, maxRetries = 2) {
    try {
        console.log("Calling Google Gemini API for image analysis...");

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY not configured");
        }

        // Extract base64 data from data URL
        const base64Data = imageDataUrl.split(',')[1];
        if (!base64Data) {
            throw new Error("Invalid image format");
        }

        const prompt = `You are a food safety and quality assessment expert. Analyze this food image carefully.

Assess suitability across three categories and respond ONLY with valid JSON:
{
  "human": <0-100 percentage for human consumption>,
  "cattle": <0-100 percentage for animal feed>,
  "fertilizer": <0-100 percentage for composting>,
  "best_category": "<human|cattle|compost>",
  "recommendation": "<detailed explanation of why this food is best suited for [human consumption/animal feed/composting] with food safety implications>",
  "confidence": "<high|medium|low>"
}

CRITICAL RULES:
- SPOILED/MOLDY/ROTTEN: human=0-15%, cattle=0-15%, fertilizer=80-100%, best_category=compost
- FRESH/GOOD CONDITION: human=70-100%, cattle=10-20%, fertilizer=5-20%, best_category=human
- AGING/DEGRADED: human=30-60%, cattle=40-50%, fertilizer=20-40%, best_category=cattle
- If ANY signs of spoilage: reduce human%, increase fertilizer%
- Explain food safety concerns in recommendation`;

        // Use REST API directly with image
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt,
                                },
                                {
                                    inlineData: {
                                        mimeType: "image/jpeg",
                                        data: base64Data,
                                    },
                                },
                            ],
                        },
                    ],
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = `API Error: ${response.status} - ${JSON.stringify(errorData)}`;

            // Retry logic for temporary server errors (503, 429)
            if ((response.status === 503 || response.status === 429) && retryCount < maxRetries) {
                const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
                console.log(`⚠️ Gemini API temporarily unavailable (${response.status}). Retrying in ${retryDelay}ms... (Attempt ${retryCount + 1}/${maxRetries})`);

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, retryDelay));

                // Recursive retry
                return analyzeWithGemini(imageDataUrl, retryCount + 1, maxRetries);
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        console.log("✓ Gemini API image response received");

        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("Could not parse JSON from Gemini response");
            return getPlaceholderAnalysis();
        }

        const analysis = JSON.parse(jsonMatch[0]);

        // Validate and normalize scores
        let human = Math.max(0, Math.min(100, analysis.human || 50));
        let cattle = Math.max(0, Math.min(100, analysis.cattle || 30));
        let fertilizer = Math.max(0, Math.min(100, analysis.fertilizer || 20));

        // If food is spoiled (high fertilizer), ensure human is very low
        if (fertilizer > 70 && human > 20) {
            human = Math.max(5, human * 0.3); // Reduce human score significantly
            cattle = Math.min(cattle, 30);
        }

        // If food is fresh (low fertilizer), ensure human is high
        if (fertilizer < 20 && human < 70) {
            human = Math.max(human, 75);
        }

        console.log(`✓ Gemini image analysis complete: Human=${Math.round(human)}%, Cattle=${Math.round(cattle)}%, Fertilizer=${Math.round(fertilizer)}%`);

        return {
            human: Math.round(human),
            cattle: Math.round(cattle),
            fertilizer: Math.round(fertilizer),
            recommendation: analysis.recommendation || "Food analysis complete",
            confidence: analysis.confidence || "high"
        };

    } catch (error) {
        console.error("Gemini API image error:", error.message);
        console.log("Falling back to placeholder analysis...");
        return getPlaceholderAnalysis();
    }
}

// ==========================================
// DECISION FUNCTION - DETERMINE PRIMARY USE
// ==========================================
function determineCategory(analysis) {
    const { human, cattle, fertilizer } = analysis;

    // Find the highest score
    const maxScore = Math.max(human, cattle, fertilizer);

    // Determine category based on highest score
    if (human === maxScore && human >= 60) {
        return {
            category: "human",
            emoji: "🧑",
            label: "Human Consumption",
            description: "BEST FOR: Human food donation and consumption",
            color: "green"
        };
    } else if (cattle === maxScore && cattle >= 40 && cattle > human) {
        return {
            category: "cattle",
            emoji: "🐄",
            label: "Animal Feed",
            description: "BEST FOR: Animal feed and livestock nutrition",
            color: "blue"
        };
    } else if (fertilizer === maxScore && fertilizer >= 50) {
        return {
            category: "compost",
            emoji: "🌱",
            label: "Organic Compost",
            description: "BEST FOR: Composting and organic fertilizer production",
            color: "brown"
        };
    } else if (human > 50) {
        return {
            category: "human",
            emoji: "🧑",
            label: "Human Consumption",
            description: "Can be used for human consumption with proper handling",
            color: "green"
        };
    } else if (cattle > 30 && human < 50) {
        return {
            category: "cattle",
            emoji: "🐄",
            label: "Animal Feed",
            description: "Suitable for animal feed after proper processing",
            color: "blue"
        };
    } else {
        return {
            category: "compost",
            emoji: "🌱",
            label: "Organic Compost",
            description: "Best used for composting and waste management",
            color: "brown"
        };
    }
}

// ==========================================
// COMBINE MULTIPLE ANALYSES FUNCTION
// ==========================================
function combineAnalyses(analyses) {
    if (analyses.length === 0) {
        return getPlaceholderAnalysis();
    }

    if (analyses.length === 1) {
        return analyses[0].analysis;
    }

    // Combine multiple analyses by averaging scores
    // But giving more weight to concerning indicators
    let totalHuman = 0;
    let totalCattle = 0;
    let totalFertilizer = 0;
    let hasSpoilage = false;
    let spoilageCount = 0;

    analyses.forEach(({ analysis }) => {
        totalHuman += analysis.human || 0;
        totalCattle += analysis.cattle || 0;
        totalFertilizer += analysis.fertilizer || 0;

        // If any analysis shows spoilage, treat conservatively
        if (analysis.fertilizer > 60) {
            hasSpoilage = true;
            spoilageCount++;
        }
    });

    const count = analyses.length;
    let human = Math.round(totalHuman / count);
    let cattle = Math.round(totalCattle / count);
    let fertilizer = Math.round(totalFertilizer / count);

    // If spoilage detected in any source, significantly reduce human and cattle scores
    if (hasSpoilage) {
        // Reduce both human and animal feed to very low levels
        human = Math.max(5, Math.round(human * 0.2)); // Very low for humans (20% of average)
        cattle = Math.max(5, Math.round(cattle * 0.2)); // Very low for animals (20% of average)

        // Increase compost recommendation significantly
        fertilizer = Math.min(100, Math.round(fertilizer * 1.2 + 10));
    }

    // Ensure scores make logical sense
    human = Math.max(0, Math.min(100, human));
    cattle = Math.max(0, Math.min(100, cattle));
    fertilizer = Math.max(0, Math.min(100, fertilizer));

    // Build combined recommendation
    let combinedRecommendation = "Food analyzed using multiple sources (text + images): ";
    const recommendations = analyses.map(a => a.analysis.recommendation).filter(r => r);
    combinedRecommendation += recommendations.join(" | ");

    return {
        human: human,
        cattle: cattle,
        fertilizer: fertilizer,
        recommendation: combinedRecommendation,
        confidence: "high",
        details: {
            analysis_method: "Combined AI analysis (text + image)",
            sources: analyses.map(a => a.type),
            combined_from: analyses.length,
            has_spoilage_indicators: hasSpoilage
        }
    };
}

// Helper function to extract structured analysis if JSON parsing fails
function extractStructuredAnalysis(responseText) {
    console.log("Extracting structured analysis from Gemini response...");

    const text = responseText.toLowerCase();

    let human = 50, cattle = 30, fertilizer = 20;
    let recommendation = responseText.substring(0, 200) || "Food analysis completed. See details for recommendations.";

    // Simple heuristic extraction if JSON fails
    if (text.includes("spoil") || text.includes("mold") || text.includes("rot")) {
        human = 10; cattle = 15; fertilizer = 75;
        recommendation = "⚠️ Spoilage detected. Not recommended for human consumption. Best used for composting.";
    } else if (text.includes("fresh") && text.includes("good")) {
        human = 85; cattle = 10; fertilizer = 5;
        recommendation = "✅ Fresh food in good condition. Suitable for human consumption and donation.";
    } else if (text.includes("cooked") && !text.includes("spoil")) {
        human = 75; cattle = 15; fertilizer = 10;
        recommendation = "✅ Cooked food appears safe. Suitable for donation.";
    }

    return {
        human,
        cattle,
        fertilizer,
        recommendation,
        confidence: "medium",
        details: {
            freshness: human > 70 ? "fresh" : human > 40 ? "degraded" : "spoiled",
            condition: human > 70 ? "safe" : human > 40 ? "questionable" : "unsafe",
            category: text.includes("cooked") ? "Cooked Food" : "Other"
        }
    };
}


// ==============================================
// PLACEHOLDER ANALYSIS (Development Mode)
// ==============================================
// This shows sample output format for future implementations
// ==============================================

function getPlaceholderAnalysis() {
    return {
        human: 70,        // 70% suitable for human consumption
        cattle: 20,       // 20% suitable as animal feed
        fertilizer: 10,   // 10% decomposable to fertilizer
        recommendation: "✓ This food appears to be in good condition. It's suitable for human consumption. You can donate it to those in need. When real AI integration is active, this will provide detailed analysis of freshness, food type, and safety concerns.",
        confidence: "medium",
        details: {
            freshness: "good",
            condition: "safe",
            estimated_shelf_life: "2-3 days",
            warnings: ["AI backend not configured - Using placeholder analysis"],
            note: "Integrate real AI (OpenAI, Gemini, or Google Vision) in production"
        }
    };
}


// ==============================================
// FUTURE API IMPLEMENTATIONS (Templates)
// ==============================================
// Copy these templates when ready to integrate APIs
// ==============================================

/*
// TEMPLATE 1: OPENAI VISION INTEGRATION
async function analyzeWithOpenAI(imageDataUrl) {
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  try {
    const response = await client.vision.analyze({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageDataUrl }
            },
            {
              type: "text",
              text: `Analyze this food image and categorize it:
              
              Respond in JSON format:
              {
                "human": <percentage 0-100>,
                "cattle": <percentage 0-100>,
                "fertilizer": <percentage 0-100>,
                "recommendation": "<text description>",
                "freshness": "<fresh/okay/spoiled>",
                "warnings": [<array of concerns>]
              }
              
              Consider:
              - Food freshness and quality
              - Signs of mold or spoilage
              - Safety for human consumption
              - Suitability as animal feed
              - Decomposability for fertilizer`
            }
          ]
        }
      ]
    });

    const analysisText = response.choices[0].message.content;
    return JSON.parse(analysisText); // Parse JSON response
  } catch (error) {
    console.error("OpenAI analysis error:", error);
    throw error;
  }
}
*/

/*
// TEMPLATE 2: GOOGLE GEMINI INTEGRATION
async function analyzeWithGemini(imageDataUrl) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    
    const imageBuffer = Buffer.from(imageDataUrl.split(',')[1], 'base64');
    
    const response = await model.generateContent([
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: "image/jpeg"
        }
      },
      // Detailed prompt for food analysis
      \`Analyze this food image and provide a JSON response:
      {
        "human": <percentage>,
        "cattle": <percentage>,
        "fertilizer": <percentage>,
        "recommendation": "<description>",
        "confidence": "<high/medium/low>"
      }\`
    ]);

    const text = await response.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini analysis error:", error);
    throw error;
  }
}
*/

/*
// TEMPLATE 3: GOOGLE VISION API INTEGRATION
async function analyzeWithGoogleVision(imageDataUrl) {
  const vision = require('@google-cloud/vision');
  const client = new vision.ImageAnnotatorClient({
    keyFilename: process.env.GOOGLE_CLOUD_VISION_KEY
  });

  try {
    const imageRequest = {
      image: { content: imageDataUrl.split(',')[1] },
      features: [
        { type: 'LABEL_DETECTION' },
        { type: 'SAFE_SEARCH_DETECTION' }
      ]
    };

    const [result] = await client.annotateImage(imageRequest);
    
    // Parse labels and determine food suitability
    const labels = result.labelAnnotations;
    
    // Custom logic to analyze labels and determine percentages
    const analysis = categorizeFromLabels(labels);
    return analysis;
  } catch (error) {
    console.error("Google Vision analysis error:", error);
    throw error;
  }
}
*/


// ================================================
// UPDATE USER PROFILE
// ================================================
exports.updateProfile = async (req, res) => {
    try {
        // Get token and verify user
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Get fields to update
        const { name, phone, location } = req.body;

        // Validate input
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: "Name is required" });
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            {
                name: name.trim(),
                phone: phone ? phone.trim() : user.phone,
                location: location ? location.trim() : user.location
            },
            { new: true }
        );

        console.log(`✓ Profile updated for user: ${user.email}`);

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                location: updatedUser.location
            }
        });

    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({
            message: "Failed to update profile",
            error: error.message
        });
    }
};


// ================================================
// CHANGE PASSWORD
// ================================================
exports.changePassword = async (req, res) => {
    try {
        // Get token and verify user
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // If user signed up with Google (no local password), disallow direct password change
        if (user.authMethod !== 'email' || !user.password) {
            return res.status(400).json({ message: "Password change is not available for accounts created via Google OAuth. Please use password reset or sign in with email/password." });
        }
        // Get passwords from request body
        const { currentPassword, newPassword } = req.body;

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current password and new password are required" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters long" });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ message: "New password must be different from current password" });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Current password is incorrect" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await User.findByIdAndUpdate(user._id, {
            password: hashedPassword
        });

        console.log(`✓ Password changed for user: ${user.email}`);

        res.status(200).json({
            message: "Password changed successfully"
        });

    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({
            message: "Failed to change password",
            error: error.message
        });
    }
};

// RESEND VERIFICATION EMAIL
exports.resendVerification = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

        // generate new token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await user.save();

        try {
            await sendVerificationEmail({ to: user.email, name: user.name, token: verificationToken });
        } catch (err) {
            console.error('Failed to resend verification email:', err);
            return res.status(500).json({ message: 'Failed to send verification email' });
        }

        return res.status(200).json({ message: 'Verification email resent' });

    } catch (error) {
        console.error('resendVerification error:', error);
        res.status(500).json({ message: 'Resend failed', error: error.message });
    }
};

// GET USER BY EMAIL (public profile for authenticated users)
exports.getUserByEmail = async (req, res) => {
    try {
        // Require a valid token from the requester
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }

        const requester = await User.findById(decoded.id);
        if (!requester) {
            return res.status(404).json({ message: "User not found" });
        }

        const email = (req.query.email || req.body.email || '').toString().trim();
        if (!email) {
            return res.status(400).json({ message: "Email query parameter is required: ?email=someone@example.com" });
        }

        // Case-insensitive exact match (escape regex special chars)
        const escaped = email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
        const found = await User.findOne({ email: new RegExp('^' + escaped + '$', 'i') });
        if (!found) {
            return res.status(404).json({ message: "User not found" });
        }

        // Return only public fields to avoid leaking sensitive data
        const publicUser = {
            id: found._id,
            name: found.name,
            email: found.email,
            phone: found.phone || null,
            location: found.location || null,
            profilePicture: found.googleProfilePicture || found.profileImage || null,
            donationsMade: found.donationsMade || 0,
            donationsReceived: found.donationsReceived || 0,
            createdAt: found.createdAt
        };

        return res.status(200).json({ message: "User profile retrieved", user: publicUser });

    } catch (error) {
        console.error("Error fetching user by email:", error);
        const dbError = handleDatabaseError(error);
        if (dbError) return res.status(dbError.status).json({ message: dbError.message });
        return res.status(500).json({ message: "Failed to fetch user", error: error.message });
    }
};


// Re-sync Google profile using stored refresh token
exports.resyncGoogleProfile = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.googleRefreshToken) {
            return res.status(400).json({ message: 'No Google refresh token stored for this account. Please re-authenticate with Google.' });
        }

        const { default: fetch } = await import('node-fetch');

        // Exchange refresh token for a new access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: user.googleRefreshToken
            }).toString()
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || tokenData.error) {
            console.error('Google token refresh failed:', tokenData);
            return res.status(400).json({ message: 'Failed to refresh Google token', error: tokenData.error_description || tokenData.error });
        }

        const accessToken = tokenData.access_token;
        // If Google returned a new refresh token, store it
        if (tokenData.refresh_token) {
            user.googleRefreshToken = tokenData.refresh_token;
        }

        // Fetch latest profile
        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const profile = await profileResponse.json();
        if (!profile || profile.error) {
            console.error('Failed fetching Google profile during resync:', profile);
            return res.status(400).json({ message: 'Failed to fetch Google profile', error: profile.error });
        }

        // Update fields
        if (profile.picture) user.googleProfilePicture = profile.picture;
        if (profile.name) user.googleName = profile.name;
        if (profile.email) user.googleEmail = profile.email;

        await user.save();

        return res.status(200).json({ message: 'Google profile re-synced', profilePicture: user.googleProfilePicture });

    } catch (error) {
        console.error('resyncGoogleProfile error:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Invalid token' });
        }
        res.status(500).json({ message: 'Failed to re-sync Google profile', error: error.message });
    }
};


// FORGOT PASSWORD - request reset link
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = resetToken;
        // Expires in 1 hour
        user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
        await user.save();

        // Send email (best-effort)
        try {
            await sendPasswordResetEmail({ to: user.email, name: user.name, token: resetToken });
        } catch (emailErr) {
            console.error('Failed to send password reset email:', emailErr);
            // Continue - do not reveal email sending failure to client
        }

        return res.status(200).json({ message: 'If that email is registered, a password reset link has been sent.' });
    } catch (error) {
        console.error('forgotPassword error:', error);
        res.status(500).json({ message: 'Failed to process request', error: error.message });
    }
};


// RESET PASSWORD - apply new password using token
exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ message: 'Token and newPassword are required' });

        const user = await User.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: Date.now() } });
        if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

        if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters long' });

        const hashed = await bcrypt.hash(newPassword, 10);
        user.password = hashed;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        // Ensure authMethod is email now
        user.authMethod = 'email';
        await user.save();

        return res.status(200).json({ message: 'Password has been reset successfully' });
    } catch (error) {
        console.error('resetPassword error:', error);
        res.status(500).json({ message: 'Failed to reset password', error: error.message });
    }
};

// Update user preferences (email notifications, etc.)
exports.updatePreferences = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const { emailNotifications } = req.body;
        if (typeof emailNotifications === 'boolean') {
            user.emailNotifications = emailNotifications;
        }

        await user.save();
        return res.status(200).json({ message: 'Preferences updated', user: { id: user._id, emailNotifications: user.emailNotifications } });
    } catch (error) {
        console.error('updatePreferences error:', error);
        res.status(500).json({ message: 'Failed to update preferences', error: error.message });
    }
};

// Delete authenticated user's account and related data
exports.deleteAccount = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Remove donations created by this user
        const Donation = require('../models/donation');
        const Notification = require('../models/notification');

        await Donation.deleteMany({ userId: user._id });

        // Remove claims made by this user on other donations
        await Donation.updateMany(
            { 'claims.userId': user._id },
            { $pull: { claims: { userId: user._id } } }
        );

        // If the user was set as claimedBy on any donation, release it
        await Donation.updateMany(
            { claimedBy: user._id },
            { $set: { claimedBy: null, status: 'Available' } }
        );

        // Remove notifications created by or targeted at this user
        await Notification.deleteMany({ $or: [{ addedBy: user._id }, { recipient: user._id }] });

        // Finally remove user record
        await User.findByIdAndDelete(user._id);

        console.log(`✓ User ${user.email} and related data deleted`);
        return res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('deleteAccount error:', error);
        return res.status(500).json({ message: 'Failed to delete account', error: error.message });
    }
};