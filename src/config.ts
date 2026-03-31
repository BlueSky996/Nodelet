import dotenv from "dotenv";
dotenv.config()

export const config = {
    privateKey: process.env.PRIVATE_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    solverFeePercent: 0.5, // 0.5 max fee
    minProfitUSD: 0.1, // ignore intents below 0.1 USD
    minAmountUSD: 7,
    maxAmountUSD: 100,
    gasEstimateUSD: 0.001,

};