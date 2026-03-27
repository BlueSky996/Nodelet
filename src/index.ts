import { askSolver, type Intent } from "./solver.js";
import { ethers } from "ethers";
import { fillIntent } from "./filler.js";
import { isSafe } from "./guard.js";
import dotenv from "dotenv";
dotenv.config();

const SPOKE_POOL_BASE = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const SPOKE_POOL_ABI = [
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, uint32 depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address depositor, address recipient, address exclusiveRelayer, bytes message)"
];

const provider = new ethers.WebSocketProvider(process.env.ALCHMEY_WSS || "");
const spokePool = new ethers.Contract(SPOKE_POOL_BASE, SPOKE_POOL_ABI, provider);

async function run() {
    console.log(" Micro-solver listening for intents ...");

    spokePool.on("V3FundsDeposited", async (inputToken, outputToken, inputAmount, outputAmount, destinationChainId, depositId, fillDeadline) => {
        const intent: Intent = {
            fromChain: "base",
            toChain: destinationChainId.toString(),
            fromToken: inputToken,
            toToken: outputToken,
            amountUSD: parseFloat(ethers.formatUnits(inputAmount, 6)),
        };

        console.log(`\n Intent found:`, intent);
        const decision = askSolver(intent);
        console.log(` Decision:`, decision);

        if (decision.action === "fill") {
            const amountUSD = parseFloat(ethers.formatUnits(inputAmount, 6));
            const guard = await isSafe(amountUSD, fillDeadline);


            if (guard.safe) {
                console.log(" Safe to fill - executing .. ", guard.reason);
                await fillIntent(depositId) // passing the depositID from the event
            } else {
                console.log(" Guard blocked fill --", guard.reason);
            }
        }
    });
}

run();