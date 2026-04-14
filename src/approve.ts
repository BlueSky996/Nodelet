import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const RPC_URL = process.env.ALCHEMY_WSS || "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ZERO_EX_PROXY = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";

const TOKENS = [
    { name: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
    { name: "WETH", address: "0x4200000000000000000000000000000000000006" },
    { name: "cbBTC", address: "0xcbb7c91a6edc2115684d0220970a4cc8590c74f5" },
    { name: "AERO", address: "0x940181a94a3554030635e1975e6382101e406f33" },
    { name: "cbETH", address: "0x2ae3f1ec7f1f5012cfec7b9627bb38604616297a" }
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) public returns (bool)"];

async function main() {
    if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing in .env");

    const provider = new ethers.WebSocketProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`--- Initializing 0x Approvals on Base ---`);

    for (const token of TOKENS) {
        try {
            const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);

            // We use MaxUint256 so we only ever pay gas for this ONCE.
            const tx = await (contract as any).approve(ZERO_EX_PROXY, ethers.MaxUint256);
            console.log(`⏳ Approving ${token.name}...`);
            await tx.wait();

            console.log(`✅ ${token.name} ready for JIT swaps. (Hash: ${tx.hash})`);
        } catch (err: any) {
            console.error(`❌ Error approving ${token.name}:`, err.message);
        }
    }
    console.log("\n🚀 All 'Big 5' tokens are now tradeable by your bot.");
    process.exit(0);
}

main();