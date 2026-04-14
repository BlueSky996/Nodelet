import { askSolver, type Intent } from "./solver.js";
import { fillIntent } from "./filler.js";
import { isSafe } from "./guard.js";
import { startAllListeners } from "./protocols.js";
import { executeSwap } from "./swapper.js";
import { ethers } from "ethers";

import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WSS || "");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);

async function run() {
    console.log(" Micro-solver listening for intents ...");

    startAllListeners(async (intent) => {
        try {
            console.log(`\n [${intent.protocol}] Intent found:`, intent);

            const guard = await isSafe(intent.amountUSD, intent.fillDeadline, intent.fromToken, intent.toToken);

            if (!guard.safe) {
                console.log(" Guard blocked fill --", guard.reason);
                return;
            }

            console.log(`\n [${intent.protocol}] Intent found:`, intent);

            const solverIntent: Intent = {
                fromChain: "base",
                toChain: intent.chainId.toString(),
                fromToken: intent.fromToken,
                toToken: intent.toToken,
                amountUSD: intent.amountUSD,
                needsSwap: guard.needsSwap,
                sourceToken: guard.sourceToken,
            };

            const decision = await askSolver(solverIntent);
            console.log(`\n Decision:`, decision);

            if (decision.action === "fill") {
                // if we need to swap
                if (guard.needsSwap && guard.sourceToken) {
                    console.log(` JIT SWAP: ${guard.sourceToken} -> ${intent.toToken}`)
                    const swapSuccess = await executeSwap(guard.sourceToken, intent.toToken, intent.amountUSD, wallet);
                    if (!swapSuccess) {
                        console.log(" Swap failed, skipping fill")
                        return;
                    }
                }
                console.log(" Executing fill ...")
                await fillIntent(intent.raw.relay); // exact relay object
            }
        } catch (err: any) {
            console.error(" Intent processing error (bot stay alive):", err.message);
        }
    });
}

run();