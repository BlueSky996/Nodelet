import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const ACROSS_SPOKE_POOL = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";
const UNISWAPX_REACTOR = "0x00000011F84074D2D637dd0F474bD682490bCD4B";
const DEBRIDGE_DLN_ORDERER = "0x6B3E6848040AaF393526E3d23798939c635A6A69";

const FILL_ABI = [
    // Across (Spoke Pool)
    "function fillV3Relay((address depositor, address recipient, address exclusiveRelayer, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 originChainId, uint32 depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message) relay, bytes32 repaymentChainId) external",
    // UniswapX (Dutch Order Reactor)
    "function execute((bytes order, bytes sig) signedOrder) external",
    // deBridge (DLN)
    "function fulfill(bytes32 orderId, bytes fulfillmentBytes) external"
];

const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WSS || "");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
const fillContract = new ethers.Contract(ethers.ZeroAddress, FILL_ABI, wallet);

// track filled intents
const filled = new Set<string>();

// Across Filler
async function fillAcross(relayData: any) {
    const key = `${relayData.originChainId}-${relayData.depositId}`;

    if (filled.has(key)) {
        console.log(" [Across] Already filled, skipping")
        return false;
    }

    const contract = fillContract.attach(ACROSS_SPOKE_POOL) as any;
    const tx = await contract.fillV3Relay(relayData, 8453);
    filled.add(key);
    return tx.wait();
}


// Uniswap Filler

async function fillUniswapX(orderData: any) {
    const key = `uniswap-${orderData.orderHash}`;
    if (filled.has(key)) return false;

    const contract = fillContract.attach(UNISWAPX_REACTOR) as any;
    const tx = await contract.execute({
        order: orderData.encodedOrder,
        sig: orderData.signature
    });
    filled.add(key);
    return tx.wait();
}


// Debridge Filler

async function fillDebridge(orderData: any) {
    const key = `debridge-${orderData.orderId}`;
    if (filled.has(key)) return false;

    const contract = fillContract.attach(DEBRIDGE_DLN_ORDERER) as any;
    const tx = await contract.fulfill(
        orderData.orderId,
        orderData.fulfillmentBytes
    );
    filled.add(key);
    return tx.wait();
}


export async function executeFill(protocol: string, rawData: any) {
    try {
        console.log(`| [${protocol}] Attempting on-chain fill...`);
        let receipt;

        switch (protocol) {
            case "Across":
                receipt = await fillAcross(rawData.relay);
                break;
            case "UniswapX":
                receipt = await fillUniswapX(rawData);
                break;
            case "deBridge":
                receipt = await fillDebridge(rawData);
                break;
            default:
                throw new Error("Unsupported protocol filler");
        }

        if (receipt) {
            console.log(`| [${protocol}] Success! Hash: ${receipt.hash}`);
            return true;
        }
    } catch (err: any) {
        console.error(`| [${protocol}] Fill Error:`, err.message);
        return false;
    }
}