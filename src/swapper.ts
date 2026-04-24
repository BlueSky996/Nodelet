import axios from "axios";
import { ethers } from "ethers";
import { WHITELIST } from "./guard.js";

const ERC20_ABI = ["function approve(address spender, uint256 amount) public returns (bool)", "function allowance(address owner, address spender) public view returns (uint256)"];

export async function executeSwap(from: string, to: string, amountUSD: number, wallet: ethers.Wallet) {
    try {
        const fromToken = from.toLowerCase();
        const tokenData = WHITELIST[fromToken];
        const isEth = from === "0x0000000000000000000000000000000000000000";

        // cal proper sellAmount in atomic units
        const decimals = isEth ? 18 : (tokenData?.decimals || 18);
        const sellAmount = ethers.parseUnits((amountUSD / (tokenData?.priceUSD || 1)).toFixed(decimals), decimals);

        console.log(`| [Swapper] Quoting ${from} -> ${to} for ${amountUSD} USD...`);

        // 0x api endpoint for base chain
        const url = `https://base.api.0x.org/swap/v1/quote?`;
        const response = await axios.get(url, {
            params: {
                sellToken: isEth ? "ETH" : from,
                buyToken: to,
                sellAmount: sellAmount.toString(),
                slippagePercentage: 0.01, // 1% slippage
            },
            headers: { '0x-api-key': process.env.ZEROX_API_KEY || "" }
        });

        const { to: proxyAddress, data, value, allowanceTarget } = response.data;

        // handle erc20 approval
        if (!isEth) {
            const tokenContract = new ethers.Contract(from, ERC20_ABI, wallet);
            const currentAllowance = await (tokenContract as any).allowance(wallet.address, allowanceTarget);

            if (currentAllowance < sellAmount) {
                console.log("| [Swapper] Approving token...")
                const approveTx = await (tokenContract as any).approve(allowanceTarget, ethers.MaxUint256);
                await approveTx.wait();
                console.log("| [Swapper] Approval complete")
            }
        }

        const tx = await wallet.sendTransaction({
            to: proxyAddress,
            data: data,
            value: value,
        });

        console.log("| [Swapper] Swap submitted:", tx.hash);
        const receipt = await tx.wait();

        console.log("| [Swapper] Swap Confirmed! Block:", receipt?.blockNumber);
        return true;
    } catch (error: any) {
        console.error("Swap Failed:", error.response?.data || error.message);
        return false;
    }
}