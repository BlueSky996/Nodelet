import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const SPOKE_POOL_BASE = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";

const FILL_ABI = [
    "function fillV3Relay((address depositor, address recipient, address exclusiveRelayer, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 originChainId, uint32 depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message) relay, bytes32 repaymentChainId) external"
];


export async function fillIntent(relayData: any) {

    const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WSS || "");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
    const spokePool = new ethers.Contract(SPOKE_POOL_BASE, FILL_ABI, wallet);

    try {
        console.log("💸 Attempting fill...");
        const tx = await (spokePool as any).fillV3Relay(relayData, 8453); // 8453 = Base chain ID
        console.log("📤 TX sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("✅ Fill confirmed! Block:", receipt.blockNumber);
        return true;
    } catch (err: any) {
        console.error("❌ Fill failed:", err.message);
        return false;
    }
}