'use client';
import {
  ZERO_ADDRESS,
} from "thirdweb";
import { useEffect, useState } from "react";
import { 
  ConnectButton, 
  useActiveAccount
} from "thirdweb/react";
import { 
  setMerkleRoot as setMerkleRootOnContract,
  saveSnapshot,
} from "thirdweb/extensions/airdrop";
import { Account, privateKeyToAccount } from "thirdweb/wallets";
// Internal components | services
import * as Airdrop from './domain/index';
import { ArrowStep } from "./arrowStep";
import './domain/bigint.extensions';
import { Step } from "./step";
import { sepolia } from "thirdweb/chains";
import {
  TOKEN_CONTRACT_ADDRESS,
  AIRDROP_CONTRACT_ADDRESS,
  SNAPSHOT_WHITELIST,
  ETH_PRIVATE_KEY,
  BLOCK_EXPLORER_BASE_URL,
  THIRD_WEB_CLIENT_ID
} from './constant';
import { retryPrepareAndSubmitRawTransaction } from "./domain/transaction";

export default function Home() {
  // Destructuring functions from module
  const {
  getOwnerOfContract,
  getThirdwebContract,
  isRecipientClaimed,
  claimAirdropToken,
  approveAirdropAsSpender,
  generateMerkleTreeInfoERC20ForWhitelist,
  } = Airdrop.Transaction;
  const { getThirdwebClient } = Airdrop.Client;

  const client = getThirdwebClient(THIRD_WEB_CLIENT_ID);
  const [snapshotWhitelist] = useState<any[]>(SNAPSHOT_WHITELIST);
  const totalAirdropAmount = snapshotWhitelist.reduce((accumulator, currentValue) => accumulator + currentValue.amount, 0);
  // 1. Deploy token contract use to airdrop
  const [step, setStep] = useState<Step>(Step.DEPLOY_TOKEN_CONTRACT);
  const tokenAddress = TOKEN_CONTRACT_ADDRESS;
  const tokenContract = getThirdwebContract(tokenAddress, client, sepolia);
  // 2. Deploy Airdrop claimable smart contract
  const airdropAddress = AIRDROP_CONTRACT_ADDRESS;
  const airdropContract = getThirdwebContract(airdropAddress,client, sepolia);
  useEffect(() => {
    setStep(Step.DEPLOY_AIRDROP_CONTRACT);
  }, []);

  // 3. Check the active account permissions
  const [airdropOwner, setAirdropOwner] = useState<string>(ZERO_ADDRESS);
  const [tokenOwner, setTokenOwner] = useState<string>(ZERO_ADDRESS);
  const fetchContractOwners = async () => {
    if (tokenOwner == ZERO_ADDRESS) {
      const airdropOwner = await getOwnerOfContract(tokenContract);
      setTokenOwner(airdropOwner);
    }
    if (airdropOwner == ZERO_ADDRESS) {
      const airdropClaimableOwner = await getOwnerOfContract(airdropContract);
      setAirdropOwner(airdropClaimableOwner);
    }
  }
  // Check whether a wallet already claimed or not
  const [isWalletClaimed, setIsWalletClaimed] = useState<boolean>(false);
  const isActiveWalletClaimed = async (recipient: string) => {
    const isClaimedOnChain = await isRecipientClaimed(
      recipient,
      airdropContract,
      tokenAddress
    );
    setIsWalletClaimed(isClaimedOnChain);
  }
  // Check the owner to enable CTAs accordingly
  const [isTokenOwner, setIsTokenOwner] = useState<boolean>(false);
  const [isAirdropOwner, setIsAirdropOwner] = useState<boolean>(false);
  const checkCurrentWalletIsOwner = async (account: Account) => {
    await fetchContractOwners();
    if(airdropOwner.toLowerCase() == account.address.toLowerCase()) {
      setIsAirdropOwner(true);
    }
    if(tokenOwner.toLowerCase() == account.address.toLowerCase()) {
      setIsTokenOwner(true);
    }
    if(step < Step.CHECK_ACTIVE_WALLET_PERMISSIONS) {
      setStep(Step.CHECK_ACTIVE_WALLET_PERMISSIONS)
    }
  }
  // Retrieve active account
  const activeAccount: Account | undefined = useActiveAccount();
  const address = activeAccount?.address;
  if(activeAccount) {
    checkCurrentWalletIsOwner(activeAccount);
    isActiveWalletClaimed(activeAccount.address)
  }
  // Get account Smart Contract owner from a Private Key
  const ownerContractAccount = privateKeyToAccount({
    client,
    privateKey: ETH_PRIVATE_KEY,
  });
  
  //4. Build MerkleTree from snapshot / allowlist
  const [merkleRoot, setMerkleRoot] = useState<string | null>(null);
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const generateMerkleRoot = async () => {
    // Generate MerkleTree from whitelist
    const { merkleRoot, snapshotUri } = await generateMerkleTreeInfoERC20ForWhitelist(snapshotWhitelist,airdropContract,tokenAddress);
    // Save snapshot
    setSnapshotUri(snapshotUri);
    // Save merkleRoot on AirdropClaimable from #2.
    setMerkleRoot(merkleRoot);
    setStep(Step.GENERATE_MERKLE_TREE);
  }

  // 5. Airdrop contract owner store whitelist to on-chain
  const setMerkleRootByOwner = async (
    account: Account, 
    merkleRoot: string,
    snapshotUri: string
  ) => {
    const retryOptions: Airdrop.Type.RetryOptions = {
      retries: 3,
      delay: 1000
    }
    // Save snapshot
    const saveSnapshotTransaction = saveSnapshot({
      contract: airdropContract,
      merkleRoot,
      snapshotUri,
    });
    await retryPrepareAndSubmitRawTransaction(saveSnapshotTransaction, account, retryOptions)
    
    // Set MerkleTree
    const merkleRootTransaction = setMerkleRootOnContract({
      contract: airdropContract,
      token: `0x${tokenAddress.replace("0x", "")}`,
      tokenMerkleRoot: `0x${merkleRoot.replace("0x", "")}`,
      resetClaimStatus: true
    });
    await retryPrepareAndSubmitRawTransaction(merkleRootTransaction, account, retryOptions)

    setStep(Step.AIRDROP_OWNER_SAVE_WHITELIST_ON_CHAIN);
  }

  // 6. Token contract owner approve AirdropClaimable contract as spender with amount (allowance)
  const [approveTransactionHash, setApproveTransactionHash] = useState<string | null>(null);
  const approveAirdropClaimableContractAddress = async (account: Account) => { 
    const {
      transactionHash
    } = await approveAirdropAsSpender(
      airdropAddress,
      totalAirdropAmount,
      account, 
      tokenContract,
    );
    setApproveTransactionHash(transactionHash);
    setStep(Step.TOKEN_OWNER_APPROVE_ALLOWANCE);
  }

  // 7. End users trigger claimERC20 on AirdropClaimable contract to claim
  const getClaimableAmountForWallet = (walletAddress: string) => {
    const items = snapshotWhitelist.filter(item => item.recipient.toLowerCase() === walletAddress.toLowerCase());
    if(items.length) {
      return items[0].amount;
    }
    return 0;
  }
  const [claimTransactionHash, setClaimTransactionHash] = useState<string | null>(null);
  const claimAirdrop = async (account: Account) => {
    // Send the transaction
    const { 
      transactionHash
    } = await claimAirdropToken(
      tokenAddress,
      account, 
      airdropContract
    );
    setClaimTransactionHash(transactionHash);
    setStep(Step.CLAIM_BY_A_WHITELIST_WALLET);
  }

  // Render Layout
  return (
    <main className="main-container">
      <div className="container">
          <h1 className="my-5">
            L1 Airdrop claim-based approach. Recipient who is in the whitelist will pay gas fee
          </h1>
          <ConnectButton
            client={client}
            appMetadata={{
              name: "ERC20 Airdrop Demo",
              url: "https://github.com/make-everything-simple/erc20-airdrop-demo",
            }}
          />
          { address && (
            <div>
              <div className="primary-container bg-[#222]">
                  <p className="header-p">
                      Smart Contract: Require two following contracts
                  </p>
                  <ol className="list-decimal">
                    <li>Token Contract
                    </li>
                    <ol className="list-decimal ml-2.5">
                      <li>
                        <a href={`${BLOCK_EXPLORER_BASE_URL}/address/${tokenAddress}`} target="_blank">
                          Token address: {tokenAddress}
                        </a>
                      </li>
                      <li>
                          <a className="underline" href={`${BLOCK_EXPLORER_BASE_URL}/address/${tokenOwner}`} target="_blank">
                          Owner: {tokenOwner}
                          </a>
                      </li>
                    </ol>
                    <li>AirdropClaimable Contract
                    </li>
                    <ol className="list-decimal ml-2.5">
                      <li>
                        <a className="underline" href={`${BLOCK_EXPLORER_BASE_URL}/address/${airdropAddress}`} target="_blank">
                        Token Address: {airdropAddress}
                        </a>
                      </li>
                      <li>
                        <a className="underline" href={`${BLOCK_EXPLORER_BASE_URL}/address/${airdropOwner}`} target="_blank">
                        Owner: {airdropOwner}
                        </a>
                      </li>
                    </ol>
                  </ol>
              </div>
              <div className="primary-container bg-[#404040]">
                <p className="header-p">
                  BE: Generate MerkleTree for whitelist wallets
                </p>
                <div className="text-left min-w-[500px]">
                  { snapshotWhitelist && snapshotWhitelist.map((item, index) => (
                    <span key={index}>
                      {index + 1}. Address: {item.recipient} with airdrop amount: {item.amount}
                      <br/>
                    </span>
                  ))}
                </div>
                { isAirdropOwner && (
                  <button 
                    className="btn-primary my-4"
                    onClick={() => generateMerkleRoot()}>
                      BE: Generate
                  </button>)
                }
                <ol className="list-decimal ml-4">
                  { merkleRoot && (
                    <li>MerkleRoot Hash: {merkleRoot}</li>
                  )}
                  { snapshotUri && (
                    <li>Snapshot URI: {snapshotUri}
                    </li>
                  )}
                </ol>
                { step == Step.GENERATE_MERKLE_TREE && isAirdropOwner ? 
                <> 
                  <ArrowStep from="generate merkle tree" to="save merkle tree on-chain">
                    <p>Airdrop owner</p>
                  </ArrowStep>
                  { merkleRoot && snapshotUri && (
                    <div className="sub-container">
                      <p className="header-p-l2">
                        AirdropClaimable Contract Owner save whitelist to on-chain
                      </p>
                      <button className="btn-primary my-4" onClick={ () => setMerkleRootByOwner(ownerContractAccount, merkleRoot, snapshotUri)}>
                        BE: save on-chain
                      </button>
                      { step >= Step.AIRDROP_OWNER_SAVE_WHITELIST_ON_CHAIN &&(
                        <ArrowStep from="save merkle tree on-chain" to="approve allowance">
                          <p>Token owner</p>
                        </ArrowStep>
                      )}
                    </div>
                  )}
                </>
                :
                <>
                { step == Step.GENERATE_MERKLE_TREE ?
                (<p className="warning-p">
                  Please connect wallet is the owner of airdrop contract to save whitelist to on-chain
                 </p>) : null
                }
                </>
                }
                { step == Step.AIRDROP_OWNER_SAVE_WHITELIST_ON_CHAIN ?
                <>
                {isTokenOwner && merkleRoot && snapshotUri ? (
                  <div className="sub-container">
                    <p className="header-p-l2">
                        Partner: Owner of Token contract approve Airdrop contract as Spender with allowance = {totalAirdropAmount}
                    </p>
                    <button className="btn-primary my-4" onClick={() => approveAirdropClaimableContractAddress(ownerContractAccount)}>
                      Partner: Approve Allowance
                    </button>
                  </div>
                  ) : (<div><p className="warning-p my-4">Please connect wallet is the owner of token contract to approve allowance</p></div>)
                }
                </> : null 
                }
                { step == Step.TOKEN_OWNER_APPROVE_ALLOWANCE &&
                  (<ArrowStep from="approve allowance" to="claim on-chain">
                    <p>Wallet in whitelist </p>
                  </ArrowStep>)
                }
              </div>
              <div className="primary-container">
                <p className="header-p">
                    FE: User connects wallet to claim
                </p>
                <ol className="list-decimal">
                  <li className="text-white">Claiming Wallet: <b>{address}</b>
                  </li>
                  <li className="text-white">Available Claim amount: <b>{getClaimableAmountForWallet(address)}</b>
                  </li>
                </ol>
                  { getClaimableAmountForWallet(address) > 0 ? (
                      <button className={isWalletClaimed ? "btn-disable" : "btn-primary"} onClick={() => { claimAirdrop(activeAccount) }} disabled={isWalletClaimed}>
                        { isWalletClaimed ? "Claimed" : "Claim Now"}
                      </button>
                  ) :
                    (<p className="warning-p">Current Wallet is not available for claim. Please connect with a wallet in the whitelist</p>)
                  }
                  { claimTransactionHash && (
                    <>
                      <a className="underline" href={`${BLOCK_EXPLORER_BASE_URL}/tx/${claimTransactionHash}`} target="_blank">
                      transactionHash: {claimTransactionHash}
                      </a>
                    </>
                  )}
              </div>
            </div>
          )}
      </div>
    </main>
  );
}