import { execSync } from "child_process";

export interface Intent {
    fromChain: string;
    toChain: string;
    fromToken: string;
    toToken: string;
    amountUSD: number;
}

export function askSolver(intent: Intent): { action: "fill" | "skip"; reason: string } {
    const prompt = `Intent: ${JSON.stringify(intent)}. Fee available: $${(intent.amountUSD * 0.005).toFixed(2)}. Fill or skip?`;

    try {
        const result = execSync(`zeroclaw agent -m "${prompt}"`, {
            encoding: "utf-8",
            timeout: 15000,
        });

        // extract JSON from Zeroclaw response
        const match = result.match(/\{.*}/s);
        if (!match) return { action: "skip", reason: "no valid response" };

        return JSON.parse(match[0]);
    } catch (err) {
        return { action: "skip", reason: "zeroclaw error" };
    }
}