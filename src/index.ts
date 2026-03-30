import { askSolver, type Intent } from "./solver.js";
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

            const solverIntent: Intent = {
                fromChain: "base",
                toChain: intent.chainId.toString(),
                fromToken: intent.fromToken,
                toToken: intent.toToken,
                amountUSD: intent.amountUSD,
            };

            // skip if amount is too small or too large
            if (intent.amountUSD > 120 || intent.amountUSD < 5) {
                console.log(" Intent too large or too small - skipping ", intent.amountUSD);
                return;
            }

            const decision = askSolver(solverIntent);
            console.log(`\n Decision:`, decision);


            if (decision.action === "fill") {
                const guard = await isSafe(intent.amountUSD, intent.fillDeadline);

                if (guard.safe) {
                    console.log(" Safe to fill - executing .. ", guard.reason);
                    await fillIntent(intent.raw.relay); // exact relay object
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