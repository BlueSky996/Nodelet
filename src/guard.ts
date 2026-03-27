import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

export async function isSafe(
    amountUSD: number,
    fillDeadline: number
): Promise<{ safe: boolean; reason: string }> {

    // check minimum profit
    const fee = amountUSD * 0.005;
    if (fee < 0.10) {
        return { safe: false, reason: `fee too low: $${fee.toFixed(3)}` };
    }

    // check fill deadline not expired
    const now = Math.floor(Date.now() / 1000);
    if (fillDeadline < now + 60) {
        return { safe: false, reason: "deadline too close or expired" };
    }

    // Check wallet has enough balance
    const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_WSS || "");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
    const usdc = new ethers.Contract(USDC_BASE, USDC_ABI, provider);

    const balance = await (usdc as any).balanceOf(process.env.WALLET_ADDRESS || "");
    const balanceUSD = parseFloat(ethers.formatUnits(balance, 6));

    if (balanceUSD < amountUSD) {
        return {
            safe: false, reason: `insufficient balance: $${balanceUSD.toFixed(2)}`
        }
    }
    return { safe: true, reason: `profit: $${fee.toFixed(3)}` };
}