import { spawn } from "child_process";

export interface Intent {
    fromChain: string;
    toChain: string;
    fromToken: string;
    toToken: string;
    amountUSD: number;
    needsSwap: boolean;
    sourceToken?: string;
}

export function askSolver(intent: Intent): Promise<{ action: "fill" | "skip"; reason: string }> {
    return new Promise((resolve) => {
        const fee = (intent.amountUSD * 0.005).toFixed(3);

        // tell the AI about the PageSwapEvent
        const swapContext = intent.needsSwap
            ? `NOTE: Requires JIT Swap from ${intent.sourceToken} to ${intent.toToken} first (Slipage risk).`
            : `Direct fill avaliable (No swap needed).`;
        const prompt = `Intent: ${JSON.stringify(intent)}. Fee available: $${fee}. ${swapContext} Fill or skip?`;

        const child = spawn("zeroclaw", ["agent", "-m", prompt]);

        let output = "";
        child.stdout.on("data", (data) => {
            output += data.toString();
        });


        child.on("close", () => {
            try {
                const match = output.match(/\{[^}]*\}/);
                if (!match) {
                    return resolve({ action: "skip", reason: "no valid response" });
                }

                const result = JSON.parse(match[0]);
                resolve({
                    action: result.action === "fill" ? "fill" : "skip",
                    reason: result.reason || "no reason provided"
                })
            } catch {
                return resolve({ action: "skip", reason: "parse error" });
            }
        });

        child.on("error", () => {
            resolve({ action: "skip", reason: "zeroclaw error" });
        });

        // timeout fallback
        setTimeout(() => {
            child.kill();
            resolve({ action: "skip", reason: "timeout" });
        }, 15000);

    });
}