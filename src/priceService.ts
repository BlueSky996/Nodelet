// priceService.ts
import { WHITELIST } from "./guard.js";

// Mapping WHITELIST symbols to CoinGecko IDs
const COINGECKO_IDS: Record<string, string> = {
    "USDC": "usd-coin",
    "ETH": "ethereum",
    "WETH": "ethereum",
    "cbBTC": "coinbase-wrapped-btc",
    "AERO": "aerodrome-finance"
};

// Simple in-memory cache
let priceCache: Record<string, number> = { "USDC": 1, "ETH": 2500, "WETH": 2500, "cbBTC": 65000, "AERO": 0.80 };
let lastFetch = 0;

export async function updatePrices() {
    const now = Date.now();
    // Only fetch if data is older than 60 seconds
    if (now - lastFetch < 60000) return priceCache;

    try {
        const ids = Object.values(COINGECKO_IDS).join(",");
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        const data = await res.json();

        // Update the cache
        for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
            if (data[id]) {
                priceCache[symbol] = data[id].usd;
            }
        }
        lastFetch = now;
        console.log("Prices updated:", priceCache);
    } catch (err) {
        console.error("Failed to fetch prices, using stale cache", err);
    }
    return priceCache;
}

export function getCachedPrice(symbol: string): number {
    return priceCache[symbol] || 0;
}