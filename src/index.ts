import { askSolver, type Intent } from "./solver.js";
import { ethers } from "ethers";
import { fillIntent } from "./filler.js";
import { isSafe } from "./guard.js";
import { startAllListeners } from "./protocols.js";

import dotenv from "dotenv";
dotenv.config();

async function run() {
    console.log(" Micro-solver listening for intents ...");

    startAllListeners(async (intent) => {
        try {
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
        } catch (err: any) {
            console.error(" Intent processing error (bot stay alive):", err.message);
        }
    });
}

run();