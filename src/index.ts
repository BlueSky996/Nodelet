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

            const guard = await isSafe(intent.amountUSD, intent.fillDeadline, intent.fromToken, intent.toToken);
            if (!guard.safe) {
                console.log(" Guard blocked fill --", guard.reason);
                return;
            }

            const decision = await askSolver(solverIntent);
            console.log(`\n Decision:`, decision);


            if (decision.action === "fill") {
                console.log(" Executing fill ...")
                await fillIntent(intent.raw.relay); // exact relay object
            }
        } catch (err: any) {
            console.error(" Intent processing error (bot stay alive):", err.message);
        }
    });
}

run();