import { ethers } from "ethers";
import { config } from "./config.js";
import dotenv from "dotenv";
dotenv.config();

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();

const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WSS || "");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
const usdc = new ethers.Contract(
    USDC_BASE,
    ["function balanceOf(address) view returns (uint256)"],
    provider
) as any;

// cache balance for 10 seconds
let cachedBalance = 0;
let lastFetch = 0;

async function getBalanceUSD(): Promise<number> {
    const now = Date.now();
    if (now - lastFetch < 10000) return cachedBalance;

    const balance = await usdc.balanceOf(wallet.address);
    cachedBalance = parseFloat(ethers.formatUnits(balance, 6));
    lastFetch = now;

    return cachedBalance;
}

export async function isSafe(
    amountUSD: number,
    fillDeadline: number,
    fromToken: string,
    toToken: string,
): Promise<{ safe: boolean; reason: string }> {

    if (amountUSD < config.minAmountUSD || amountUSD > config.maxAmountUSD) {
        return { safe: false, reason: `amount out of range: $${amountUSD.toFixed(2)}` };
    }

    if (amountUSD < config.minProfitUSD) {
        return { safe: false, reason: "amount too small" };
    }

    if (toToken.toLowerCase() !== USDC_BASE) {
        return { safe: false, reason: "unsupported output token" };
    }

    // check fill deadline not expired
    const now = Math.floor(Date.now() / 1000);
    if (fillDeadline < now + 60) {
        return { safe: false, reason: "deadline too close or expired" };
    }

    // check minimum profit
    const estimatedFee = amountUSD * (config.solverFeePercent / 100);
    if (estimatedFee < config.minProfitUSD) {
        return { safe: false, reason: `estimated fee too low: $${estimatedFee.toFixed(3)}` };
    }

    // rough gas cost etimate 
    const estimatedGas = 0.001;
    if (estimatedFee < estimatedGas) {
        return { safe: false, reason: `estimated fee too low for gas: $${estimatedFee.toFixed(3)}` };
    }

    // check balance
    const balanceUSD = await getBalanceUSD();

    if (balanceUSD < amountUSD) {
        return {
            safe: false, reason: `insufficient balance: $${balanceUSD.toFixed(2)}`
        }
    }
    return { safe: true, reason: `profit: $${(estimatedFee - estimatedGas).toFixed(3)}` };
}