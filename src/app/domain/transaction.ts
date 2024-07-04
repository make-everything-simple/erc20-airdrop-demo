/**
 * Collection of utils functions interact with on-chain to fulfill Airdrop claim-based approach
 */

// External imports below this line
import { 
  BaseTransactionOptions,
  EstimateGasOptions,
  PreparedTransaction,
  SendTransactionOptions,
  ThirdwebClient,
  ThirdwebContract,
  estimateGas,
  estimateGasCost,
  eth_gasPrice,
  eth_getTransactionCount,
  eth_maxPriorityFeePerGas,
  getContract,
  getRpcClient,
  readContract,
  sendTransaction,
  waitForReceipt
} from "thirdweb";
import { GenerateMerkleTreeInfoERC20Params, claimERC20, generateMerkleTreeInfoERC20, isClaimed } from "thirdweb/extensions/airdrop";
import { TransactionReceipt } from "thirdweb/transaction";
import { approve } from "thirdweb/extensions/erc20";
import { Account } from "thirdweb/wallets";

// Internal import below this line
import { 
  DEFAULT_MAX_BLOCKS_WAIT_TIME, 
  DEFAULT_EXTRA_GAS_PERCENTAGE, 
  DEFAULT_EXTRA_PRIORITY_TIP_PERCENTAGE,
  DEFAULT_CHAIN,
  DEFAULT_EXTRA_ON_RETRY_PERCENTAGE
} from "./constant";
import {
  Address,
  ExtraGasOptions,
  GasFeeInfo,
  GenerateMerkleTreeInfo,
  RetryOptions,
  WhiteListItem
} from "./type";
import { retry } from "./retry";

// Internal Functions
/**
 * Sends a transaction using the provided wallet.
 * 
 * @param {SendTransactionOptions} options - The options for sending the transaction.
 * @param {boolean} isLogResult - Whether to log the result or not. Default true.
 * @returns {Promise<TransactionReceipt>} A promise that resolves to the confirmed transaction receipt.
 * @throws An error if the wallet is not connected.
 */
const doSubmitTransaction = async (
  options: SendTransactionOptions,
  callback?: (result: TransactionReceipt) => void,
  isLogResult = true
): Promise<TransactionReceipt> => {
  if (isLogResult) {
    // TODO: replace with the logger library for better format or other targets
    console.log(`[request] options = ${JSON.stringify(options)}`);
  }
  const transactionReceipt = await sendTransactionAndWaitForReceipt(options);
  if (isLogResult) {
    // TODO: replace with the logger library for better format or other targets
    console.log(`[response] result = ${JSON.stringify(transactionReceipt)}`);
  }
  if (callback) {
    callback(transactionReceipt);
  }
  return transactionReceipt;
}

// External Functions

/** 
 * Returns an RPC request that can be used to make JSON-RPC requests
 * 
 * @param {ThirdwebClient} client - Thirdweb client.
 * @param {Chain} chain - The chain to interact with @see {@link SupportingChain}.
*/
export const getRpcClientByChain = (
  client: ThirdwebClient, 
  chain = DEFAULT_CHAIN
) => {
  return getRpcClient({ client, chain });
}

/**
 * This callback type is called `transactionCallback` and is displayed as a global symbol.
 *
 * @callback transactionCallback
 * @param {TransactionReceipt} result - The transaction receipt received from submitting.
 */

/**
 * Calculate gas fee info need to paid to submit a transaction
 * @summary Retrieve Gas Fee Info
 * @see {@link https://ethereum.org/en/developers/docs/gas|Ethereum's gas} or @see {@link https://support.metamask.io/transactions-and-gas/gas-fees/user-guide-gas/|Metamask's gas}
 * @see {@link https://etherscan.io/gastracker|Gas Tracker}
 * 
 * @param {EstimateGasOptions} options - The options for estimating gas.
 * @param {boolean} isLogResult - Whether to log the result or not. Default true.
 *  @returns {Promise<GasFeeInfo>} Promise object represents the gas fee info to perform an on-chain transaction
 * @throws An error if the account is missed.
 */
export const getGasFeeInfo = async (
    options: EstimateGasOptions,
    extraGasOptions: ExtraGasOptions = {},
    isLogResult = true
): Promise<GasFeeInfo> => {
    const { transaction, account } = options;
    if (!account) {
      throw Error('require the account as sender of the transaction')
    }
    const {
      extraGasPercentage = DEFAULT_EXTRA_GAS_PERCENTAGE,
      extraMaxPriorityFeePerGasPercentage = DEFAULT_EXTRA_PRIORITY_TIP_PERCENTAGE,
      extraOnRetryPercentage = DEFAULT_EXTRA_ON_RETRY_PERCENTAGE
    } = extraGasOptions;
    const { chain, client } = transaction;
    const rpcClient = getRpcClientByChain(client, chain)
    // Estimate gas use for the transaction
    // -> gas limit
    const gasLimit = await estimateGas({
        transaction,
        account
      });
    // -> gas extra
    const extraGas = (gasLimit / BigInt(100)) * BigInt(extraGasPercentage + extraOnRetryPercentage);
    // Gas price per unit of gas
    // -> base fee
    const gasPrice = await eth_gasPrice(rpcClient);
    // -> priority & max fee
    const maxPriorityFeePerGas = await eth_maxPriorityFeePerGas(rpcClient);
    const extraMaxPriorityFeePerGas = (maxPriorityFeePerGas / BigInt(100)) * BigInt(extraMaxPriorityFeePerGasPercentage + extraOnRetryPercentage);
    const maxFeePerGas = gasPrice + maxPriorityFeePerGas + extraMaxPriorityFeePerGas;
    // Estimate Gas Cost to compare with real transaction
    const gasCost = await estimateGasCost({transaction, account})
    console.log(`---> gasCost.ether = ${gasCost.ether} - gasCost.wei = ${gasCost.wei}`);
    
    const gasFeeInfo = {
      gas: gasLimit,
      gasPrice,
      maxPriorityFeePerGas,
      maxFeePerGas,
      extraGas
    }
    if (isLogResult) {
      console.log(`---> [getGasFeeInfo]: gasFeeInfo = ${JSON.stringify(gasFeeInfo)}`);
    }
    return gasFeeInfo;
}

/**
 * Retrieves the transaction count (nonce) for a given Ethereum address.
 * 
 * @see {@link https://ethereum.org/en/developers/docs/gas} for GAS AND FEES.
 * @see {@link https://etherscan.io/gastracker|Gas Tracker}
 * 
 * @param {Address} address - The Ethereum address of Sender.
 * @param {ThirdwebClient} client - Thirdweb client.
 * @param {Chain} chain - The chain to interact with @see {@link SupportingChain}.
 * @param {boolean} isLogResult - Whether to log the result or not. Default true.
 *  @returns {Promise<number>} Promise object represents the next transaction nonce
 */
export const getNextNonce = async (
  address: Address,
  client: ThirdwebClient,
  chain = DEFAULT_CHAIN, 
  isLogResult = true
): Promise<number> => { 
  const rpcClient = getRpcClientByChain(client, chain)
  const transactionNonce = await eth_getTransactionCount(rpcClient, {
  address,
  })
  if (isLogResult) {
    // TODO: replace with the logger library for better format or other targets
    console.log(`[response] transactionNonce = ${transactionNonce}`);
  }
  return transactionNonce;
};

/**
 * Reads owner of a smart contract.
 * 
 * @param {ThirdwebContract} contract - The Thirdweb contract.
 * @returns {Promise<string>} A promise that resolves with the result of the owner ethereum address.
 */
export const getOwnerOfContract = async (contract: ThirdwebContract): Promise<string> => {
  return await readContract({ 
    contract, 
    // Pass a snippet of the ABI for the method you want to call.
    method: {
      type: "function",
      name: "owner",
      inputs: [],
      outputs: [
        {
          type: "address",
          name: "",
          internalType: "address"
        }
      ],
      stateMutability: "view"
    }, 
    params: [] 
  })
}

/**
 * Creates a Thirdweb contract by combining the Thirdweb client and contract options.
 * 
 * @param {Address} address - The ethereum smart contract address.
 * @param {ThirdwebClient} client - Thirdweb client.
 * @param {Chain} chain - The chain to interact with @see {@link SupportingChain}.
 * @returns The Thirdweb contract.
 */
export const getThirdwebContract = (
  address: Address, 
  client: ThirdwebClient, 
  chain = DEFAULT_CHAIN
) => { 
  return getContract({ 
    client, 
    chain, 
    address
  })
};

/**
 * Check whether recipient is claimed or not
 * 
 * @param {Address} recipient - The ethereum wallet address to check.
 * @param {ThirdwebContract} airdropContract - The airdrop Thirdweb contract.
 * @param {Address} token - The token address to claim.
 * @param {bigint} claimAmount - The claimAmount or tokenId for ERC721
 * @returns {Promise<boolean>} A promise that resolves whether the recipient already claimed or not.
 */
export const isRecipientClaimed = async (
  recipient: Address, 
  airdropContract: ThirdwebContract,
  token: Address,
  claimAmount = BigInt(0)
) => {
  return await isClaimed({
    // AirdropClaimable contract at step #2
    contract: airdropContract,
    receiver: recipient,
    token,
    tokenId: claimAmount
  });
}

/**
 * End-User connects wallet to trigger Claim from Client side
 * 
 * @param {Address} tokenAddress - The token address to claim.
 * @param {Account} account - The Account represent as sender. See more detail {@link https://ethereum.org/en/glossary/#account|Account's Ethereum}.
 * @param {ThirdwebContract} airdropContract - The airdrop Thirdweb contract.
 * @param {transactionCallback} callback - The callback that handles the post-submit state.
 * @param {boolean} isLogResult - Whether to log the result or not. Default true.
 * @returns {Promise<TransactionReceipt>} A promise that resolves to the confirmed transaction receipt.
 * @throws An error if the wallet is not connected.
 * @transaction
 * @example
 * ```ts
 * import { claimAirdropToken } from "./index";
 *
 * const transactionReceipt = await claimAirdropToken(
 *  tokenAddress,
 *  account,
 *  airdropContract
 * );
 * ```
 */
export const claimAirdropToken = async (
  tokenAddress: Address,
  account: Account,
  airdropContract: ThirdwebContract,
  callback?: (result: TransactionReceipt) => void,
  isLogResult = true
): Promise<TransactionReceipt> => {
  console.log(`--> account.address = ${account.address}`);
  
  const claimTransaction = claimERC20({
    contract: airdropContract,
    tokenAddress,
    recipient: account.address,
  });
  // Send the transaction
  return await doSubmitTransaction(
    { transaction: claimTransaction, account }, 
    callback,
    isLogResult
  );
}

/**
 * Token contract owner approve airdrop contract address as spender with amount
 * 
 * @param {Address} spender - The airdrop smart contract address as spender.
 * @param {number} amount - The total airdrop amount in ether format.
 * @param {Account} account - The Account represent as sender. See more detail {@link https://ethereum.org/en/glossary/#account|Account's Ethereum}.
 * @param {ThirdwebContract} tokenContract - The token Thirdweb contract to airdrop
 * @param {transactionCallback} callback - The callback that handles the post-submit state.
 * @param {boolean} isLogResult - Whether to log the result or not. Default true.
 * @returns {Promise<TransactionReceipt>} A promise that resolves to the confirmed transaction receipt.
 * @throws An error if the wallet is not connected.
 * @transaction
 * @example
 * ```ts
 * import { approveAirdropAsSpender } from "./index";
 *
 * const transactionReceipt = await approveAirdropAsSpender(
 *  spender,
 *  amount,
 *  account,
 *  tokenContract
 * );
 * ```
 */
export const approveAirdropAsSpender = async (
  spender: Address, 
  amount: number,
  account: Account,
  tokenContract: ThirdwebContract,
  callback?: (result: TransactionReceipt) => void,
  isLogResult = true
): Promise<TransactionReceipt> => { 
  const transaction = approve({
    contract: tokenContract,
    spender,
    amount,
  });
  // Send the transaction
  return await doSubmitTransaction(
    { transaction, account}, 
    callback,
    isLogResult
  );
}

/**
 * Generate merkle tree info for a whitelist
 * 
 * @param {WhiteListItem[]} whitelist - The list of items is available for airdrop.
 * @param {ThirdwebContract} airdropContract - The Airdrop Thirdweb contract.
 * @param {Address} tokenAddress - The token address to claim.
 * @param {boolean} isLogResult - Whether to log the result or not. Default true.
 * @returns {Promise<GenerateMerkleTreeInfo>} A promise that resolves to the generated info.
 * @throws An error if the wallet is zero.
 * @transaction
 * @example
 * ```ts
 * import { generateMerkleTreeForWhitelist } from "./index";
 *
 * const generateMerkleTreeInfo = await generateMerkleTreeForWhitelist(
 *  whitelist,
 *  airdropContract,
 *  tokenAddress,
 *  tokenContract
 * );
 * ```
 */
export const generateMerkleTreeInfoERC20ForWhitelist = async (
  whitelist: WhiteListItem[],
  airdropContract: ThirdwebContract,
  tokenAddress: Address,
  isLogResult = true
): Promise<GenerateMerkleTreeInfo> => {
  const params: BaseTransactionOptions<GenerateMerkleTreeInfoERC20Params> = {
    contract: airdropContract,
    snapshot: whitelist,
    tokenAddress
  }
  const generateMerkleTreeInfo = await generateMerkleTreeInfoERC20(params);
  if (isLogResult) {
    // TODO: replace with the logger library for better format or other targets
    console.log('--generateMerkleTreeForWhitelist--');
    console.log(`[request] params = ${JSON.stringify(params)}`);
    console.log(`[response] result = ${JSON.stringify(generateMerkleTreeInfo)}`);
  }
  return generateMerkleTreeInfo;
}

/**
 * Sends a transaction using the provided wallet.
 * @param {SendTransactionOptions} options - The options for sending the transaction.
 * @param {number} maxBlocksWaitTime - The maximum of blocks to wait for confirmation before considering success.
 * @returns {Promise<TransactionReceipt>} A promise that resolves to the confirmed transaction receipt.
 * @throws An error if the wallet is not connected.
 * @transaction
 * @example
 * ```ts
 * import { sendAndConfirmTransaction } from "./index";
 *
 * const transactionReceipt = await sendAndConfirmTransaction(
 * options,
 * maxBlocksWaitTime
 * );
 * ```
 */
export async function sendTransactionAndWaitForReceipt(
  options: SendTransactionOptions,
  maxBlocksWaitTime = DEFAULT_MAX_BLOCKS_WAIT_TIME
): Promise<TransactionReceipt> {
  const submittedTx = await sendTransaction(options);
  return waitForReceipt({
    ...submittedTx,
    maxBlocksWaitTime
  });
}

/**
 * Retry on preparing the gas fee, and nonce, and send a transaction using the provided wallet.
 * @param {PreparedTransaction} transaction - The raw transaction to submit
 * @param {Account} account - The Account represent as sender. See more detail {@link https://ethereum.org/en/glossary/#account|Account's Ethereum}.
 * @param {ExtraGasOptions} extraGasOptions - The extra gas options bidding for your transaction to be included in the next block.
 * @param {RetryOptions} retryOptions - The configuration on retry
 * @returns {Promise<TransactionReceipt>} A promise that resolves to the confirmed transaction receipt.
 * @throws An error if the wallet is not connected.
 */
export async function retryPrepareAndSubmitRawTransaction(
  transaction: PreparedTransaction<any>,
  account: Account,
  retryOptions: RetryOptions = {},
  extraGasOptions: ExtraGasOptions = {}
): Promise<TransactionReceipt> {
  const {
    extraGasPercentage = DEFAULT_EXTRA_GAS_PERCENTAGE,
    extraMaxPriorityFeePerGasPercentage = DEFAULT_EXTRA_PRIORITY_TIP_PERCENTAGE,
    extraOnRetryPercentage = DEFAULT_EXTRA_ON_RETRY_PERCENTAGE
  } = extraGasOptions;
  const { client, chain } = transaction;
  return retry<TransactionReceipt>(
    async (retryCount) => {
      // Get transaction nonce
      let nextNonce = await getNextNonce(account.address, client, chain);
      // Calculate gas fee of a transaction
      let gasFeeInfo = await getGasFeeInfo({transaction, account}, {
          extraGasPercentage, extraMaxPriorityFeePerGasPercentage,
          extraOnRetryPercentage: extraOnRetryPercentage * retryCount
        }
      );
      let sendingSnapshotTransaction = {
        ...transaction, 
        ...gasFeeInfo,
        nonce: nextNonce
      };
      return await sendTransactionAndWaitForReceipt({
        transaction: sendingSnapshotTransaction,
        account: account,
      });
    },
    retryOptions
  )
}