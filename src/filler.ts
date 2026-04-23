import { ethers } from "ethers";
import { WHITELIST } from "./guard.js";
import dotenv from "dotenv";
dotenv.config();

const SPOKE_POOL_BASE = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";

const FILL_ABI = [
    "function fillV3Relay((address depositor, address recipient, address exclusiveRelayer, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 originChainId, uint32 depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message) relay, bytes32 repaymentChainId) external"
];

const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WSS || "");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
const spokePool = new ethers.Contract(SPOKE_POOL_BASE, FILL_ABI, wallet);

const filled = new Set<string>();

export async function fillIntent(relayData: any) {
    const key = `${relayData.originChainId}-${relayData.depositId}`;

    if (filled.has(key)) {
        console.log(" [Across] Already filled, skipping")
        return false;
    }

    try {
        console.log(` [Across] attempting fill for deposit ${relayData.depositId} on chain ${relayData.originChainId}`)
        const repaymentChainId = 8453;
        const feeData = await provider.getFeeData();
        const tx = await spokePool.fillV3Relay(relayData, repaymentChainId, {
            gasLimit: 600000,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        });
        console.log(" [Across] TX sent:", tx.hash);
        filled.add(key);
        const receipt = await tx.wait();
        console.log(" Fill confirmed! Block:", receipt.blockNumber);
        return true;
    } catch (err: any) {
        filled.delete(key); // remove from set if failed
        console.error(" [Across] Fill failed:", err.message);
        return false;
    }
}