import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { askSolver } from "./solver.js";
import { isSafe } from "./guard.js";
import { fillIntent } from "./filler.js";

async function runTest() {
    console.log(" Running pipeline test ...\n");

    // Fake intent, simulates a rea across depoist
    const fakeIntent = {
        protocol: "Across",
        amountUSD: 50,
        fromToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on base
        toToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        fillDeadline: Math.floor(Date.now() / 1000) + 300,
        raw: { depositId: 9999, destinationChainId: 8453 }
    };

    console.log("Fake intent: ", fakeIntent);

    // ask ZeroClaw
    console.log("\n Asking ZeroClaw...");
    const decision = askSolver({
        fromChain: "base",
        toChain: "base",
        fromToken: fakeIntent.fromToken,
        toToken: fakeIntent.toToken,
        amountUSD: fakeIntent.amountUSD,
    });
    console.log("Decision", decision);

    if (decision.action === "skip") {
        console.log("ZeroClaw said skip. done");
        return;
    }

    // profit guard
    console.log("\n Running profit guard...");
    const guard = await isSafe(fakeIntent.amountUSD, fakeIntent.fillDeadline);
    console.log("Guard:", guard);

    if (!guard.safe) {
        console.log("Guard blocked. Done.");
        return;
    }

    console.log("\n Guard passed - would execute fill here.");
    console.log(" Pipeline test compelted!! All systems go.");

}

runTest();