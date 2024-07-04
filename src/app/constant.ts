import { mainnet, sepolia } from "thirdweb/chains";
import { Type } from "./domain/index";

export const THIRD_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || "";

export const TOKEN_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS || "";
export const AIRDROP_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_AIRDROP_CONTRACT_ADDRESS || "";

export const ETH_PRIVATE_KEY = process.env.NEXT_PUBLIC_ETH_PRIVATE_KEY || '';

const IS_MAINNET = process.env.NEXT_PUBLIC_IS_MAIN_NET == 'true';
export const SELECTED_CHAIN = (IS_MAINNET ? mainnet : sepolia);

export const BLOCK_EXPLORER_BASE_URL = (IS_MAINNET ? 'https://etherscan.io' : 'https://sepolia.etherscan.io')

export const SNAPSHOT_WHITELIST: Type.WhiteListItem[] = [
    { recipient: "0x663217Fd41198bC5dB2F69313a324D0628daA9E8", amount: 4 },
    { recipient: "0x8Ec17698C55f7B2aB9dB1B61ED142bef54163bc0", amount: 4 },
    // // cheat part to make the unique merkleRoot
    // { recipient: "0x8AA0b6538Ba8e9DB298A7B603477e4045729b830", amount: 4 }
];