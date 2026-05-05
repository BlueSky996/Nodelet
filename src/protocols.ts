import { WHITELIST } from "./guard.js";
import { ethers } from "ethers";
import { updatePrices, getCachedPrice } from "./priceService.js";
import dotenv from "dotenv";

dotenv.config();

// --- Configuration & Constants ---
const ACROSS_SPOKE_POOL = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "");
const SOLVER_ADDRESS = wallet.address;

const ACROSS_ORIGINS = [
    { chainId: 1, spokePool: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5" }, // Ethereum
    { chainId: 42161, spokePool: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A" }, // Arbitrum
    { chainId: 10, spokePool: "0x6f26Bf09B1C792e3228e5467807a900A503c0281" }, // Optimism
    { chainId: 137, spokePool: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096" }, // Polygon
    { chainId: 8453, spokePool: ACROSS_SPOKE_POOL }, // Base
] as const;

const ACROSS_ABI = [
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, uint32 depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address depositor, address recipient, address exclusiveRelayer, bytes message)"
];

// --- Types ---
export type IntentCallback = (intent: {
    protocol: "Across" | "UniswapX" | "deBridge";
    chainId: number;
    amountUSD: number;
    fromToken: string;
    toToken: string;
    fillDeadline: number;
    raw: any;
}) => void;

// --- State Management ---
const acrossSeen = new Set<string>();
const seenOrders = new Set<string>();
const seenDebridgeOrders = new Set<string>();

// --- Helper Functions ---
const createProvider = (chainId: number): ethers.WebSocketProvider => {
    const envKey = `ALCHEMY_WSS_${chainId}`;
    const url = process.env[envKey] || process.env.ALCHEMY_WSS;
    if (!url) throw new Error(`Missing WS URL for chain ${chainId}`);
    return new ethers.WebSocketProvider(url);
};

// --- Main Listener Orchestrator ---
export async function startAllListeners(onIntent: IntentCallback, baseProvider: ethers.WebSocketProvider) {
    // 1. Initialize Prices
    await updatePrices();
    setInterval(updatePrices, 60000);

    // 2. Start Across Listeners
    console.log("🚀 Starting Across Listeners...");
    ACROSS_ORIGINS.forEach(({ chainId: originChainId, spokePool }) => {
        const provider = createProvider(originChainId);
        const across = new ethers.Contract(spokePool, ACROSS_ABI, provider);

        across.on("V3FundsDeposited", (inputToken, outputToken, inputAmount, outputAmount, destinationChainId, depositId, quoteTimestamp, fillDeadline, exclusivityDeadline, depositor, recipient, exclusiveRelayer, message) => {
            const targetToken = outputToken.toLowerCase();
            const tokenData = WHITELIST[targetToken];

            if (!tokenData || Number(destinationChainId) !== 8453) return;

            const key = `${originChainId}-${depositId.toString()}`;
            if (acrossSeen.has(key)) return;
            acrossSeen.add(key);

            const amountUSD = parseFloat(ethers.formatUnits(outputAmount, tokenData.decimals)) * getCachedPrice(tokenData.symbol);

            console.log(`[Across] match origin=${originChainId} depositId=${depositId} amount=$${amountUSD.toFixed(2)}`);

            onIntent({
                protocol: "Across",
                chainId: 8453,
                amountUSD,
                fromToken: inputToken,
                toToken: outputToken,
                fillDeadline: Number(fillDeadline),
                raw: { relay: { depositor, recipient, exclusiveRelayer, inputToken, outputToken, inputAmount, outputAmount, originChainId, depositId, fillDeadline, exclusivityDeadline, message } }
            });
        });

        provider.on("block", (blockNumber: number) => {
            if (blockNumber % 50 === 0) console.log(`[Across ${originChainId}] Alive - block ${blockNumber}`);
        });
    });

    // 3. Start UniswapX Polling
    console.log("🚀 Starting UniswapX Listener...");
    setInterval(async () => {
        try {
            const res = await fetch("https://api.uniswap.org/v2/orders?orderStatus=open&chainId=8453&limit=20");
            const data = (await res.json()) as any;

            for (const order of data.orders || []) {
                const orderHash = order.orderHash;
                if (!orderHash || seenOrders.has(orderHash)) continue;
                seenOrders.add(orderHash);

                const output = order.outputs?.[0] || order.quote?.outputs?.[0];
                if (!output) continue;

                const tokenData = WHITELIST[output.token?.toLowerCase()];
                if (!tokenData) continue;

                const rawAmount = output.amount || output.startAmount || "0";
                const amountUSD = parseFloat(ethers.formatUnits(BigInt(rawAmount), tokenData.decimals)) * getCachedPrice(tokenData.symbol);

                console.log(`[UniswapX] match hash=${orderHash.slice(0, 10)}... amount=$${amountUSD.toFixed(2)}`);

                onIntent({
                    protocol: "UniswapX",
                    chainId: 8453,
                    amountUSD,
                    fromToken: order.input?.token || "unknown",
                    toToken: output.token,
                    fillDeadline: order.info?.deadline || Math.floor(Date.now() / 1000) + 120,
                    raw: { orderHash, encodedOrder: order.encodedOrder, signature: order.signature }
                });
            }
        } catch (err: any) {
            console.error("[UniswapX] Poll error:", err.message);
        }
    }, 10000);

    // 4. Start deBridge Listener
    listenDebridge(onIntent, baseProvider);

    // 5. Global Cleanup (Every Hour)
    setInterval(() => {
        acrossSeen.clear();
        seenOrders.clear();
        seenDebridgeOrders.clear();
        console.log("🧹 Cleared deduplication sets.");
    }, 3600000);
}

// --- deBridge Logic ---
export function listenDebridge(onIntent: IntentCallback, provider: ethers.WebSocketProvider) {
    console.log("🚀 Starting deBridge Listener...");

    // Connection Heartbeat
    provider.on("block", (blockNumber) => {
        if (blockNumber % 50 === 0) {
            console.log(`[deBridge] Heartbeat - Block ${blockNumber} - Alive`);
        }
    });

    setInterval(async () => {
        try {
            const res = await fetch(`https://dln-api.debridge.finance/api/Orders/filteredList`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    takeChainIds: [8453],
                    orderStates: ["Created"],
                    skip: 0,
                    take: 20,
                    filterMode: "CrossChain"
                }),
            });

            const data = (await res.json()) as any;

            for (const order of data.orders || []) {
                const orderId = order.orderId?.stringValue;
                if (!orderId || seenDebridgeOrders.has(orderId)) continue;

                const toToken = order.takeOfferWithMetadata?.tokenAddress?.stringValue?.toLowerCase() || "";
                const tokenData = WHITELIST[toToken];
                if (!tokenData) continue;

                // Attempt to get fulfillment parameters
                const fulfillRes = await fetch(`https://dln-api.debridge.finance/api/Orders/${orderId}/fulfillment-params?takerAddress=${SOLVER_ADDRESS}`);

                if (!fulfillRes.ok) {
                    // Log only once per order to avoid spam
                    if (!seenDebridgeOrders.has(orderId)) {
                        console.warn(`| [deBridge] Could not get fulfillment params for ${orderId.slice(0, 10)}...`);
                        seenDebridgeOrders.add(orderId);
                    }
                    continue;
                }

                const fulfillData = await fulfillRes.json();
                seenDebridgeOrders.add(orderId); // Mark as seen only after successful parameter fetch

                const rawAmount = order.takeOfferWithMetadata?.amount?.stringValue || "0";
                const amountUSD = parseFloat(ethers.formatUnits(BigInt(rawAmount), tokenData.decimals)) * getCachedPrice(tokenData.symbol);

                console.log(`[deBridge] match orderId=${orderId.slice(0, 10)}... amount=$${amountUSD.toFixed(2)}`);

                onIntent({
                    protocol: "deBridge",
                    chainId: 8453,
                    amountUSD,
                    fromToken: order.giveOfferWithMetadata?.tokenAddress?.stringValue || "unknown",
                    toToken,
                    fillDeadline: Math.floor(Date.now() / 1000) + 120,
                    raw: { orderId, fulfillmentBytes: fulfillData.fulfillmentBytes }
                });
            }
        } catch (err: any) {
            console.error("[deBridge] Poll error:", err.message);
        }
    }, 15000);
}