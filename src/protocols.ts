import { ethers } from "ethers";

// --- Contract Addresses ---
const ACROSS_SPOKE_POOL = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();

// --- ABIs ---
const ACROSS_ABI = [
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, uint32 depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address depositor, address recipient, address exclusiveRelayer, bytes message)"
];



// Listener type
export type IntentCallback = (intent: {
    protocol: "Across" | "UniswapX";
    chainId: number;
    amountUSD: number;
    fromToken: string;
    toToken: string;
    fillDeadline: number;
    raw: any;
}) => void;

// Start all listeners
export function startAllListeners(onIntent: IntentCallback) {

    // Contracts 
    const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WSS || "");
    const across = new ethers.Contract(ACROSS_SPOKE_POOL, ACROSS_ABI, provider);


    console.log("Listening on Across ...");
    across.on("V3FundsDeposited", (inputToken, outputToken, inputAmount, outputAmount, destinationChainId, depositId, quoteTimestamp, fillDeadline, exclusivityDeadline, depositor, recipient, exclusiveRelayer, message) => {
        if (outputToken.toLowerCase() !== USDC_BASE) return;

        onIntent({
            protocol: "Across",
            chainId: Number(destinationChainId),
            amountUSD: parseFloat(ethers.formatUnits(inputAmount, 6)),
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
                    originChainId: 8453, // Base
                    depositId,
                    fillDeadline,
                    exclusivityDeadline,
                    message,
                },
            },
        });
    });

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
                console.log("Raw output object:", JSON.stringify(output))

                const outputToken = output.token?.toLowerCase();
                if (outputToken !== USDC_BASE) continue;

                const outputAmount = output.startAmount || "0";

                onIntent({
                    protocol: "UniswapX",
                    chainId: 8453,
                    amountUSD: parseFloat(ethers.formatUnits(BigInt(outputAmount), 6)),
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

    // Check if it's still alive
    provider.on("block", (blockNumber) => {
        if (blockNumber % 50 === 0) {
            console.log(` Alive - block ${blockNumber} | Listening on Across, UniswapX...`);
        }
    });
}