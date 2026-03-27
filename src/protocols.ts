import { ethers } from "ethers";

// --- Contract Addresses ---
const ACROSS_SPOKE_POOL = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const UNISWAPX_REACTOR = "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4";
const ONEINCH_FUSION = "0x111111125421cA6dc452d289314280a0f8842A65";

// --- ABIs ---
const ACROSS_ABI = [
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, uint32 depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address depositor, address recipient, address exclusiveRelayer, bytes message)"
];

const UNISWAPX_ABI = [
    "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)"
];

const ONEINCH_ABI = [
    "event OrderCreated(bytes32 indexed orderHash, address indexed maker, (address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount) order)"
];

// Listener type
export type IntentCallback = (intent: {
    protocol: string;
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
    const uniswapx = new ethers.Contract(UNISWAPX_REACTOR, UNISWAPX_ABI, provider);
    const oneinch = new ethers.Contract(ONEINCH_FUSION, ONEINCH_ABI, provider);


    console.log("Listening on Across ...");
    across.on("V3FundsDeposited", (inputToken, outputToken, inputAmount, outputAmount, destinationChainId, depositId, quoteTimestamp, fillDeadline, ...rest) => {
        onIntent({
            protocol: "Across",
            amountUSD: parseFloat(ethers.formatUnits(inputAmount, 6)),
            fromToken: inputToken,
            toToken: outputToken,
            fillDeadline: Number(fillDeadline),
            raw: { depositId, destinationChainId, ...rest },
        });
    });

    console.log("Listening on UniswapX ...");
    uniswapx.on("Fill", (orderHash, filler, swapper, nonce) => {
        onIntent({
            protocol: "UniswapX",
            amountUSD: 0, // needs order lookup for exact amount
            fromToken: "unknown",
            toToken: "unknown",
            fillDeadline: Math.floor(Date.now() / 1000) + 120,
            raw: { orderHash, filler, swapper, nonce },
        });
    });

    console.log("Listening on 1inch ...");
    oneinch.on("OrderCreated", (orderHash, maker, order) => {
        const amountUSD = parseFloat(ethers.formatUnits(order.makingAmount, 6));
        onIntent({
            protocol: "1inch",
            amountUSD,
            fromToken: order.makerAsset,
            toToken: order.takerAsset,
            fillDeadline: Math.floor(Date.now() / 1000) + 120,
            raw: { orderHash, maker, order },
        });
    });

    provider.on("block", (blockNumber) => {
        if (blockNumber % 50 === 0) {
            console.log(` Alive - block ${blockNumber} | Listening on Across, UniswapX, 1inch...`);
        }
    });
}