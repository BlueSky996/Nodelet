import axios from "axios";
import { ethers } from "ethers";

export async function executeSwap(from: string, to: string, amountUSD: number, wallet: ethers.Wallet) {
    try {
        // 0x api endpoint for base chain
        const url = `https://base.api.0x.org/swap/v1/quote?`;
        const response = await axios.get(url, {
            params: {
                sellToken: from === "0x0000000000000000000000000000000000000000" ? "ETH" : from,
                buyToken: to,
                sellAmount: (amountUSD * 10 ** 6).toString(), // Base amount to usdc
                slippagePercentage: 0.01, // 1% slippage
            },
            headers: { '0x-api-key': process.env.ZEROX_API_KEY || "" }
        });

        const tx = await wallet.sendTransaction({
            to: response.data.to,
            data: response.data.data,
            value: response.data.value,
        });

        await tx.wait();
        console.log(" Swap Successful:", tx.hash);
        return true;
    } catch (error: any) {
        console.error("Swap Failed:", error.response?.data || error.message);
        return false;
    }
}