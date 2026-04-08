import { ethers, Contract } from "ethers";
import dotenv from "dotenv";
dotenv.config();
import { config } from "./config.js";


// --- Whitelisted "Big 5" Tokens on Base ---
// We only trade these to avoid scams and ensure high liquidity
export const TOKENS: Record<string, { decimals: number; symbol: string; priceUSD: number }> = {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { decimals: 6, symbol: "USDC", priceUSD: 1 },
    "0x4200000000000000000000000000000000000006": { decimals: 18, symbol: "WETH", priceUSD: 2500 },
    "0x0000000000000000000000000000000000000000": { decimals: 18, symbol: "ETH", priceUSD: 2500 },
    "0xcbb7c91a6edc2115684d0220970a4cc8590c74f5": { decimals: 8, symbol: "cbBTC", priceUSD: 65000 },
    "0x940181a94a3554030635e1975e6382101e406f33": { decimals: 18, symbol: "AERO", priceUSD: 0.80 },
};

const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WSS || "");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];


async function getInventoryUSD(): Promise<Record<string, number>> {
    const inventory: Record<string, number> = {};

    for (const [address, info] of Object.entries(TOKENS)) {
        let balance;
        if (address === "0x0000000000000000000000000000000000000000") {
            balance = await provider.getBalance(wallet.address);
        } else {
            const contract = new Contract(address, ERC20_ABI, provider);
            balance = await (contract as any).balanceOf(wallet.address);
        }
        const units = parseFloat(ethers.formatUnits(balance, info.decimals));
        inventory[address.toLowerCase()] = units * info.priceUSD;
    }

    return inventory;
}

export async function isSafe(
    amountUSD: number,
    fillDeadline: number,
    fromToken: string,
    toToken: string,
): Promise<{ safe: boolean; reason: string; needsSwap: boolean; sourceToken?: string }> {

    const target = toToken.toLowerCase();
    const source = fromToken.toLowerCase();

    // whitelist check
    if (!TOKENS[target] || !TOKENS[source]) {
        return { safe: false, reason: "Token not in whitelist", needsSwap: false };
    }

    if (amountUSD < config.minAmountUSD || amountUSD > config.maxAmountUSD) {
        return { safe: false, reason: `amount out of range: $${amountUSD.toFixed(2)}`, needsSwap: false };
    }

    // check fill deadline not expired
    const now = Math.floor(Date.now() / 1000);
    if (fillDeadline < now + 60) {
        return { safe: false, reason: "deadline too close or expired", needsSwap: false };
    }

    // Profitability Calculation (Including JIT Swap overhead)
    const rewardUSD = amountUSD * (config.solverFeePercent / 100);
    const executionCosts = (config.gasEstimateUSD * 2) + (amountUSD * 0.003);
    const netProfit = rewardUSD - executionCosts;

    if (netProfit < config.minProfitUSD) {
        return { safe: false, reason: `Low profit: $${netProfit.toFixed(3)}`, needsSwap: false };
    }

    // 5. Inventory & Swap Logic
    const inventory = await getInventoryUSD();

    // Do we already have enough of the target token?
    if ((inventory[target] || 0) >= amountUSD) {
        return { safe: true, reason: "Balance ready", needsSwap: false };
    }

    // If not, do we have enough of ANY other whitelisted token to swap from?
    let bestSource = "";
    let highestVal = 0;

    for (const [addr, usdVal] of Object.entries(inventory)) {
        if (usdVal > highestVal) {
            highestVal = usdVal;
            bestSource = addr;
        }
    }

    if (highestVal >= (amountUSD + executionCosts)) {
        const sourceSymbol = TOKENS[bestSource]?.symbol || "Unknown";
        return {
            safe: true,
            reason: `Swap required from ${sourceSymbol}`,
            needsSwap: true,
            sourceToken: bestSource
        };
    }

    return {
        safe: false,
        reason: `Insufficient funds. Need $${amountUSD}, have $${highestVal.toFixed(2)}`,
        needsSwap: false
    };
}