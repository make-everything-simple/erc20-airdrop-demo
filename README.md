# erc20-airdrop-demo

ERC20 airdrop demos with claim based approach by reusing [thirdweb SDK + Next.js starter](https://github.com/thirdweb-example/next-starter).

## Setup credentials

Create the `.env` file from `.env.example` if not present

```bash
cp -R ./.env.example ./.env
```

Configure value accordingly

```bash
NEXT_PUBLIC_TEMPLATE_CLIENT_ID=...
NEXT_PUBLIC_MAIN_AIRDROP_CONTRACT_ADDRESS=...
NEXT_PUBLIC_CLAIMABLE_AIRDROP_CONTRACT_ADDRESS=...
```

## Usage

### Install dependencies

```bash
yarn
```

### Start development server

```bash
yarn dev
```

### Create a production build

```bash
yarn build
```

### Preview the production build

```bash
yarn start
```

## Resources

- [thirdweb SDK documentation](https://portal.thirdweb.com/typescript/v5): performant & lightweight SDK to interact with any EVM chain from Node, React and React Native
- [React components and hooks](https://portal.thirdweb.com/typescript/v5/react): easily connect wallets & interact with smart contracts
- [thirdweb Dashboard](https://thirdweb.com/dashboard): manage your web3 apps
- [Airdrop contract](https://thirdweb.com/thirdweb.eth/Airdrop) is suitable to use when you want to transfer ERC20 / ERC721 / ERC1155 tokens to a list of recipient addresses, and supports push based, claim based (allowlist), and signature based airdrops

## Thirdweb Discord!

For any questions or suggestions, join our discord at [https://discord.gg/thirdweb](https://discord.gg/thirdweb).
