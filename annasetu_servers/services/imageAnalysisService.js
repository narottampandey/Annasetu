const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Analyzes a food image and provides AI-generated description and insights
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} mimeType - MIME type of the image (default: image/jpeg)
 * @returns {Promise<Object>} Analysis result with description and food details
 */
async function analyzeFood(imageBase64, mimeType = "image/jpeg") {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Remove data URL prefix if it exists
        let cleanBase64 = imageBase64;
        if (imageBase64.includes(",")) {
            cleanBase64 = imageBase64.split(",")[1];
        }

        const prompt = `You are an expert food analyst. Analyze this food image and provide:

1. **Food Description**: Describe the food items visible (what type of cuisine, specific dishes, etc.)
2. **Nutritional Category**: Classify as Vegetarian, Non-Veg, or Vegan
3. **Quantity Estimate**: Estimate the serving size/quantity
4. **Quality Assessment**: Rate freshness and quality (scale 1-10)
5. **Spoilage Risk**: Identify any signs of spoilage or food safety concerns
6. **Storage Recommendation**: How long it can be stored and best storage method
7. **Best For**: Who this would be suitable for (individuals, groups, communities)
8. **Preparation Status**: Is it cooked, raw, or prepared?

Provide a comprehensive analysis in a structured format.`;

        const response = await model.generateContent([
            {
                inlineData: {
                    data: cleanBase64,
                    mimeType: mimeType
                }
            },
            prompt
        ]);

        const analysisText = response.response.text();

        return {
            success: true,
            description: analysisText,
            timestamp: new Date(),
            imageAnalyzed: true
        };
    } catch (error) {
        console.error("Error analyzing image:", error);
        return {
            success: false,
            error: error.message,
            description: "Unable to analyze image. Please try again."
        };
    }
}

/**
 * Analyzes food spoilage risk from image
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<Object>} Spoilage analysis
 */
async function analyzeSpoilage(imageBase64, mimeType = "image/jpeg") {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let cleanBase64 = imageBase64;
        if (imageBase64.includes(",")) {
            cleanBase64 = imageBase64.split(",")[1];
        }

        const prompt = `As a food safety expert, analyze this food image for spoilage indicators:

1. **Spoilage Risk Level**: Low, Medium, High, or Critical
2. **Visible Issues**: List any signs of deterioration, mold, discoloration, etc.
3. **Estimated Shelf Life**: How many hours/days this food can remain fresh
4. **Safety Recommendations**: Whether it's safe to consume/donate
5. **Storage Instructions**: How to preserve it optimally

Respond in JSON format with these exact keys: riskLevel, issues, shelfLife, recommendation, storageTips`;

        const response = await model.generateContent([
            {
                inlineData: {
                    data: cleanBase64,
                    mimeType: mimeType
                }
            },
            prompt
        ]);

        const analysisText = response.response.text();

        // Try to parse JSON response
        let parsedAnalysis = {
            text: analysisText,
            timestamp: new Date()
        };

        try {
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedAnalysis = JSON.parse(jsonMatch[0]);
                parsedAnalysis.timestamp = new Date();
            }
        } catch (parseError) {
            // If JSON parsing fails, keep the text response
            console.log("Could not parse JSON response, keeping raw text");
        }

        return {
            success: true,
            analysis: parsedAnalysis
        };
    } catch (error) {
        console.error("Error analyzing spoilage:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Analyzes multiple food images and provides comprehensive report
 * @param {Array<string>} imageBase64Array - Array of base64 encoded images
 * @returns {Promise<Object>} Combined analysis
 */
async function analyzeMultipleFoodImages(imageBase64Array, mimeType = "image/jpeg") {
    try {
        const analyses = await Promise.all(
            imageBase64Array.map((img, index) =>
                analyzeFood(img, mimeType).then(result => ({
                    imageIndex: index,
                    ...result
                }))
            )
        );

        return {
            success: true,
            totalImages: imageBase64Array.length,
            analyses: analyses,
            timestamp: new Date()
        };
    } catch (error) {
        console.error("Error analyzing multiple images:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    analyzeFood,
    analyzeSpoilage,
    analyzeMultipleFoodImages
};
