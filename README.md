⚡ Nodelet Micro Intent Solver

A lightweight cross-chain intent solver bot that runs on your laptop for near-zero cost, powered by ZeroClaw + Gemini AI.


🧠 What Is This?
Users on cross-chain protocols post intents e.g. "I want 50 USDC on Base for my 51 USDC on Solana."
Large market makers ignore these small $10–$200 trades. Nodelet fills them instead, collects a $0.10–$7+ solver fee, and gets reimbursed by the protocol within minutes.
Your capital (~$100 USDC) recycles itself. The AI brain (ZeroClaw + Gemini) decides what to fill. The profit guard protects you from bad trades.

🏗️ Architecture
Blockchain (Base)
    │
    ├── Across Protocol     ← WebSocket (real-time deposits)
    └── UniswapX            ← API polling every 10s (open USDC orders)
              │
              ▼
        protocols.ts        ← Normalizes intents into a common shape
              │
              ▼
          solver.ts         ← Sends intent to ZeroClaw agent (Gemini AI)
              │
         fill / skip
              │
              ▼
          guard.ts          ← Checks profit, balance, deadline
              │
           safe?
              │
              ▼
          filler.ts         ← Executes on-chain fill via Across SpokePool

📁 Project Structure
Nodelet/
├── src/
│   ├── index.ts         ← Entry point starts listeners, orchestrates pipeline
│   ├── protocols.ts     ← Listens to Across (WS) and UniswapX (API polling)
│   ├── solver.ts        ← Bridges to ZeroClaw agent for fill/skip decision
│   ├── guard.ts         ← Profit guard checks fee, balance, deadline
│   ├── filler.ts        ← Executes on-chain fill via SpokePool contract
│   ├── config.ts        ← Loads env variables
│   └── test.ts          ← Simulates a fake intent to test the pipeline
├── .env                 ← Private keys and API keys (never commit!)
├── .gitignore
├── package.json
└── tsconfig.json

⚙️ How It Works
ZeroClaw (AI Runtime)
ZeroClaw is a Rust-based autonomous AI agent daemon that wraps Gemini. It handles retries, failover, memory, and prompt routing calling Gemini directly would require building all of that yourself. The agent is configured with a solver identity in ~/.zeroclaw/workspace/IDENTITY.md.
Intent Flow

protocols.ts catches a deposit event or open order
solver.ts passes the intent to ZeroClaw: "Intent: {...}, Fee: $X. Fill or skip?"
ZeroClaw responds with {"action":"fill","reason":"..."} or {"action":"skip","reason":"..."}
guard.ts verifies: fee ≥ $0.10, deadline not expired, wallet has enough USDC
If all checks pass, filler.ts calls fillV3Relay() on Across's SpokePool contract


🚀 Setup
Prerequisites

Node.js 18+
WSL2 (if on Windows)
ZeroClaw installed
Alchemy account (free) for Base WebSocket RPC
Gemini API key (paid tier recommended)
MetaMask wallet with USDC on Base

1. Install ZeroClaw
bashcurl -LsSf https://raw.githubusercontent.com/zeroclaw-labs/zeroclaw/master/install.sh | bash
zeroclaw onboard
2. Configure Solver Identity
Edit ~/.zeroclaw/workspace/IDENTITY.md and append:
markdown## Role: Micro-Solver Agent
You process cross-chain swap intents. Given an intent JSON,
respond ONLY with: {"action":"fill","reason":"..."} or {"action":"skip","reason":"..."}
Never chat. Never explain. JSON only.
3. Clone & Install
bashgit clone https://github.com/YOUR_USERNAME/nodelet.git
cd nodelet
npm install
4. Configure Environment
bashcp .env.example .env
Fill in your .env:
envALCHEMY_WSS=wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY
WALLET_ADDRESS=0x_your_wallet_address
PRIVATE_KEY=your_private_key_without_0x
5. Run the Bot
bashnpx tsx src/index.ts
6. Test the Pipeline (no real money)
bashnpx tsx src/test.ts

✅ Expected Output
🦀 Micro-solver listening for intents...
👂 Listening on Across...
👂 Listening on UniswapX...
💓 Alive block 43912000 | Listening on Across, UniswapX...

📡 [UniswapX] Intent found: { amountUSD: 1502.13, ... }
⚡ Decision: { action: 'fill', reason: 'Fee of $7.51 is sufficient...' }
🛡️ Guard blocked fill insufficient balance: $0.00   ← fund wallet to go live

🐛 Issues We Hit & How We Fixed Them

1. Public Base RPC doesn't support WebSocket filters
Error: filter not found
Fix: Switched from JsonRpcProvider to WebSocketProvider and used Alchemy's WebSocket URL instead of the public Base RPC.
2. dotenv loading order crashes
Modules were creating providers at the top level before dotenv had loaded, resulting in empty ALCHEMY_WSS.
Fix: Moved all provider initialization inside functions so dotenv always loads first.
3. ZeroClaw always skipped (fee not reaching the prompt)
Shell quoting broke the prompt when using execSync with template literals.
Fix: Replaced execSync with spawnSync and passed arguments as an array no quoting issues.
4. 1inch OrderFilled event fires after a fill, not before
We were listening to completed orders, not pending ones we could never fill them.
Fix: Removed 1inch entirely. Their Fusion+ API requires whitelisting to be a solver.
5. UniswapX repeating same intents every 10 seconds
The API poll returned the same open orders on every interval.
Fix: Added a seenOrders Set to deduplicate by orderHash, cleared hourly.
6. UniswapX orders had wrong decimal parsing
Amounts appeared as billions because we used 6 decimals (USDC) on 18-decimal tokens.
Fix: Detect token address if USDC use 6 decimals, otherwise use 18.
7. Gemini free tier (20 req/day) too low for a live bot
Fix: Upgraded to Gemini 3 Flash paid tier (~$0.002/decision, negligible cost).

💰 Realistic Earnings
Intent SizeFee (0.5%)Likelihood$20–50$0.10–$0.25Common (Across)$100–200$0.50–$1.00Occasional$500–1500$2.50–$7.50Rare but seen (UniswapX)
Realistically expect $0.50–$5/day starting with $100 USDC capital. Scale by adding more capital or expanding to additional chains.

🛡️ Safety Features

Profit guard skips any fill below $0.10 profit
Balance check never attempts a fill you can't afford
Deadline check ignores expired intents
Try/catch on every intent one bad intent never crashes the bot
.env in .gitignore private key never hits GitHub


📜 License
MIT build freely, fill profitably.

Built with 🦀 ZeroClaw + ⚡ Base + 🤖 Gemini