import { askSolver, type Intent } from "./solver.js";
import axios from "axios";

const POLL_INTERVAL_MS = 10000; // check every 10 seconds

async function fetchIntents(): Promise<Intent[]> {
    try {
        const res = await axios.get("https://app.across.to/api/suggested-fees?");
        return [{
            fromChain: "solana",
            toChain: "base",
            fromToken: "USDC",
            toToken: "USDC",
            amountUSD: 51,
        }];
    } catch {
        return [];
    }
}


async function run() {
    console.log(" Micro-solver listening for intents ...");

    setInterval(async () => {
        const intents = await fetchIntents();

        for (const intent of intents) {
            console.log(`\n Intent found:`, intent);
            const decision = askSolver(intent);
            console.log(` Decision:`, decision);

            if (decision.action === "fill") {
                console.log(" Filling intent -");
            } else {
                console.log(" Skipping:", decision.reason);
            }
        }
    }, POLL_INTERVAL_MS);
}

run();