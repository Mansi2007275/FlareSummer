require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "11".repeat(32); // dummy key so `hardhat compile` never crashes without a .env
const COSTON2_RPC_URL = process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
const FLARE_RPC_URL = process.env.FLARE_RPC_URL || "https://flare-api.flare.network/ext/C/rpc";
const FLARESCAN_API_KEY = process.env.FLARESCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    coston2: {
      url: COSTON2_RPC_URL,
      chainId: 114,
      accounts: [PRIVATE_KEY],
    },
    flare: {
      url: FLARE_RPC_URL,
      chainId: 14,
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: {
      coston2: FLARESCAN_API_KEY,
      flare: FLARESCAN_API_KEY,
    },
    customChains: [
      {
        network: "coston2",
        chainId: 114,
        urls: {
          apiURL: "https://coston2-explorer.flare.network/api",
          browserURL: "https://coston2-explorer.flare.network",
        },
      },
      {
        network: "flare",
        chainId: 14,
        urls: {
          apiURL: "https://flare-explorer.flare.network/api",
          browserURL: "https://flare-explorer.flare.network",
        },
      },
    ],
  },
};
