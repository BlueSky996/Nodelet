import { spawnSync } from "child_process";

export interface Intent {
    fromChain: string;
    toChain: string;
    fromToken: string;
    toToken: string;
    amountUSD: number;
}

export function askSolver(intent: Intent): { action: "fill" | "skip"; reason: string } {
    const fee = (intent.amountUSD * 0.005).toFixed(3);
    const prompt = `Intent: ${JSON.stringify(intent)}. Fee available: $${fee}. Fill or skip?`;

    try {
        const result = spawnSync("zeroclaw", ["agent", "-m", prompt], {
            encoding: "utf-8",
            timeout: 15000,
        });

        const output = result.stdout || "";
        console.log("🔍 Raw ZeroClaw response:", result);

        // extract JSON from Zeroclaw response
        const match = output.match(/\{.*}/s);
        if (!match) return { action: "skip", reason: "no valid response" };
        return JSON.parse(match[0]);

    } catch (err) {
        return { action: "skip", reason: "zeroclaw error" };
    }
}