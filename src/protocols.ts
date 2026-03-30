import { ethers } from "ethers";

// --- Contract Addresses ---
const ACROSS_SPOKE_POOL = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();

// Multi-origin SpokePools (high volume origins to Base USDC)
const ACROSS_ORIGINS = [
    { chainId: 1, spokePool: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5" }, // Ethereum
    { chainId: 42161, spokePool: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A" }, // Arbitrum
    { chainId: 10, spokePool: "0x6f26Bf09B1C792e3228e5467807a900A503c0281" }, // Optimism
    { chainId: 137, spokePool: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096" }, // Polygon
    { chainId: 8453, spokePool: ACROSS_SPOKE_POOL },  // Base (same-chain too)
] as const;

// --- ABIs ---
const ACROSS_ABI = [
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, uint32 depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address depositor, address recipient, address exclusiveRelayer, bytes message)"
];


// Listener type
export type IntentCallback = (intent: {
    protocol: "Across" | "UniswapX" | "deBridge";
    chainId: number;
    amountUSD: number;
    fromToken: string;
    toToken: string;
    fillDeadline: number;
    raw: any;
}) => void;


// Helper to create ws provider per chain
const createProvider = (chainId: number): ethers.WebSocketProvider => {
    const envKey = `ALCHEMY_WSS_${chainId}`;
    const url = process.env[envKey] || process.env.ALCHEMY_WSS;

    if (!url) {
        console.warn(`Missing Alchemy WS URL for chain ${chainId}. Add ALCHEMY_WSS_${chainId} (or ALCHEMY_WSS) to your .env`)
    }

    const provider = new ethers.WebSocketProvider(url!);
    provider.on("error", (err: any) => {
        console.warn(`[Provider ${chainId}] WS error`, err.message);
    });
    return provider;
};

// Start all listeners
export function startAllListeners(onIntent: IntentCallback) {

    console.log("Listening on Across");
    const acrossSeen = new Set<string>();

    ACROSS_ORIGINS.forEach(({ chainId: originChainId, spokePool }) => {
        const provider = createProvider(originChainId);
        const across = new ethers.Contract(spokePool, ACROSS_ABI, provider);


        across.on("V3FundsDeposited", (inputToken, outputToken, inputAmount, outputAmount, destinationChainId, depositId, quoteTimestamp, fillDeadline, exclusivityDeadline, depositor, recipient, exclusiveRelayer, message) => {
            if (outputToken.toLowerCase() !== USDC_BASE) return;
            if (Number(destinationChainId) !== 8453) return;

            const key = `${originChainId}-${depositId.toString()}`;
            if (acrossSeen.has(key)) return;
            acrossSeen.add(key);

            const amountUSD = parseFloat(ethers.formatUnits(outputAmount, 6));
            // skip if amount is too small or too large

            console.log(
                `[Across] match origin=${originChainId} depositId=${depositId.toString()} amount=${amountUSD}`
            );

            onIntent({
                protocol: "Across",
                chainId: 8453,
                amountUSD,
                fromToken: inputToken,
                toToken: outputToken,
                fillDeadline: Number(fillDeadline),
                raw: {
                    relay: {
                        depositor,
                        recipient,
                        exclusiveRelayer,
                        inputToken,
                        outputToken,
                        inputAmount,
                        outputAmount,
                        originChainId,
                        depositId,
                        fillDeadline,
                        exclusivityDeadline,
                        message,
                    },
                },
            });
        });

        // Heartbeat per chain
        provider.on("block", (blockNumber: number) => {
            if (blockNumber % 50 === 0) {
                console.log(`[Across ${originChainId}] Alive - block ${blockNumber}`);
            }
        });
    });

    setInterval(() => acrossSeen.clear(), 60 * 60 * 1000);
    const seenOrders = new Set<string>();

    console.log("Listening on UniswapX ...");
    setInterval(async () => {
        try {
            const res = await fetch("https://api.uniswap.org/v2/orders?orderStatus=open&chainId=8453&limit=20");
            const data = (await res.json()) as any;

            for (const order of data.orders || []) {
                // Skip already seen orders
                if (seenOrders.has(order.orderHash)) continue;
                seenOrders.add(order.orderHash);

                // read nested output
                const output = order.outputs?.[0];
                if (!output) continue;

                const outputToken = output.token?.toLowerCase();
                if (outputToken !== USDC_BASE) continue;

                const amountUSD = parseFloat(ethers.formatUnits(BigInt(output.amount), 6));

                console.log(
                    `[UniswapX] match orderHash=${order.orderHash} amount=${amountUSD}`
                );

                onIntent({
                    protocol: "UniswapX",
                    chainId: 8453,
                    amountUSD,
                    fromToken: order.input?.token || "unknown",
                    toToken: output.token || "unknown",
                    fillDeadline: order.deadline || Math.floor(Date.now() / 1000) + 120,
                    raw: order,
                });
            }
        } catch (err: any) {
            console.error("UniswapX poll error:", err.message);
        }
    }, 10000);

    // Clear seen orders hourly
    setInterval(() => seenOrders.clear(), 60 * 60 * 1000);

    const seenDebridgeOrders = new Set<string>();
    console.log("Listening on deBridge ...");
    setInterval(async () => {
        try {
            // fetch open orders on base chain
            const res = await fetch(`https://dln-api.debridge.finance/api/Orders/filteredList`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    takeChainIds: [8453],
                    orderStates: ["Created"],
                    takeOfferWithMetadata: {
                        tokenAddress: USDC_BASE
                    },
                    skip: 0,
                    take: 20,
                    filterMode: "CrossChain"
                }),
            });

            const data = (await res.json()) as any;

            for (const order of data.orders || []) {
                if (seenDebridgeOrders.has(order.orderId)) continue;
                seenDebridgeOrders.add(order.orderId);

                const amountUSD = parseFloat(ethers.formatUnits(BigInt(order.dstAmount || order.takeAmount || 0), 6));

                console.log(
                    `[deBridge] match orderId=${order.orderId} amount=${amountUSD}`
                );

                onIntent({
                    protocol: "deBridge",
                    chainId: 8453,
                    amountUSD,
                    fromToken: order.srcChainTokenIN?.address || order.giveToken?.address || "unknown",
                    toToken: order.dstChainTokenOut?.address || order.takeToken?.address || "unknown",
                    fillDeadline: Math.floor(Date.now() / 1000) + 120,
                    raw: order,
                });
            }
        } catch (err: any) {
            console.error("deBridge poll error:", err.message);
        }
    }, 10000);

    // Clear seen orders hourly
    setInterval(() => seenDebridgeOrders.clear(), 60 * 60 * 1000);

}