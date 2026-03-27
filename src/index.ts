import dotenv from "dotenv";
dotenv.config();

import { askSolver, type Intent } from "./solver.js";
import { ethers } from "ethers";
import { fillIntent } from "./filler.js";
import { isSafe } from "./guard.js";
import { startAllListeners } from "./protocols.js";

const SPOKE_POOL_BASE = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const SPOKE_POOL_ABI = [
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, uint32 depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address depositor, address recipient, address exclusiveRelayer, bytes message)"
];

const provider = new ethers.WebSocketProvider(process.env.ALCHMEY_WSS || "");
const spokePool = new ethers.Contract(SPOKE_POOL_BASE, SPOKE_POOL_ABI, provider);

async function run() {
    console.log(" Micro-solver listening for intents ...");

    startAllListeners(async (intent) => {
        console.log(`\n [${intent.protocol}] Intent found:`, intent);

        const decision = askSolver({
            fromChain: "base",
            toChain: "unknown",
            fromToken: intent.fromToken,
            toToken: intent.toToken,
            amountUSD: intent.amountUSD,
        });

        console.log(`\n Decision:`, decision);


        if (decision.action === "fill") {
            const guard = await isSafe(intent.amountUSD, intent.fillDeadline);

            if (guard.safe) {
                console.log(" Safe to fill - executing .. ", guard.reason);
                await fillIntent(intent.raw) // passing the raw event data
            } else {
                console.log(" Guard blocked fill --", guard.reason);
            }
        }
    });
}

run();