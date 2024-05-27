# campaign-airdrop demo using thirdweb SDK + Next.js starter

The [Airdrop contract](https://thirdweb.com/thirdweb.eth/Airdrop) is suitable to use when you want to transfer ERC20 / ERC721 / ERC1155 tokens to a list of recipient addresses, and supports push based, claim based (allowlist), and signature based airdrops.

> note: token-owner must approve their tokens to this airdrop contract, by calling approval related function [approve](https://github.com/thirdweb-dev/contracts/blob/main/contracts/external-deps/openzeppelin/token/ERC20/ERC20.sol) on the token contract.

## Setup client id

Before you start, you need to replace the placeholder `clientId` with your client ID to use thirdweb SDK.

Refer to [Creating a client](https://portal.thirdweb.com/typescript/v5/client) guide to see how you can get a client id.

Go to `src/client.ts` file and replace the placeholder `clientId` with your client ID.

```ts
const clientId = "......";
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

- [thirdweb SDK documentation](https://portal.thirdweb.com/typescript/v5)
- [React components and hooks](https://portal.thirdweb.com/typescript/v5/react)
- [thirdweb Dashboard](https://thirdweb.com/dashboard)

## Join our Discord!

For any questions or suggestions, join our discord at [https://discord.gg/thirdweb](https://discord.gg/thirdweb).
