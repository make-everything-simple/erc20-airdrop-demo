'use client';
import { 
  getContract, 
  sendTransaction, 
  readContract, 
  ThirdwebContract, 
  sendAndConfirmTransaction, 
  ADDRESS_ZERO } from "thirdweb";
import { sepolia } from "thirdweb/chains";
import { useEffect, useState } from "react";
import { 
  ConnectButton, 
  useActiveAccount
} from "thirdweb/react";
import { 
  generateMerkleTreeInfoERC20, 
  GenerateMerkleTreeInfoERC20Params,
  claimERC20,
  setMerkleRoot as setMerkleRootOnContract,
  saveSnapshot,
  isClaimed
} from "thirdweb/extensions/airdrop";
import { BaseTransactionOptions } from "thirdweb/transaction";
import { Account } from "thirdweb/wallets";
import { approve } from "thirdweb/extensions/erc20";
// Internal components | services
import { client } from './client';
import { 
  Step, 
  TOKEN_CONTRACT_ADDRESS, 
  AIRDROP_CONTRACT_ADDRESS,
  SNAPSHOT_WHITELIST
} from './constant';
import { ArrowStep } from "./arrowStep";

export default function Home() {
  const [snapshotWhitelist] = useState<any[]>(SNAPSHOT_WHITELIST);
  const totalAirdropAmount = snapshotWhitelist.reduce((accumulator, currentValue) => accumulator + currentValue.amount, 0);
  // 1. Deploy token contract use to airdrop
  const [step, setStep] = useState<Step>(Step.DEPLOY_TOKEN_CONTRACT);
  const tokenContractAddress = TOKEN_CONTRACT_ADDRESS;
  const tokenContract = getContract({ 
    client, 
    chain: sepolia, 
    address: TOKEN_CONTRACT_ADDRESS
  });
  // 2. Deploy Airdrop claimable smart contract
  const airdropClaimableContractAddress = AIRDROP_CONTRACT_ADDRESS;
  const airdropClaimableContract = getContract({ 
    client, 
    chain: sepolia, 
    address: airdropClaimableContractAddress
  });
  useEffect(() => {
    setStep(Step.DEPLOY_AIRDROP_CONTRACT);
  }, []);

  // // 3. Check the active account permissions
  const getOwnerOfContract = async (contract: ThirdwebContract) => {
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
  // Owner address
  const [airdropOwner, setAirdropOwner] = useState<string>(ADDRESS_ZERO);
  const [tokenOwner, setTokenOwner] = useState<string>(ADDRESS_ZERO);
  const fetchContractOwners = async () => {
    if (tokenOwner == ADDRESS_ZERO) {
      const airdropOwner = await getOwnerOfContract(tokenContract);
      setTokenOwner(airdropOwner);
    }
    if (airdropOwner == ADDRESS_ZERO) {
      const airdropClaimableOwner = await getOwnerOfContract(airdropClaimableContract);
      setAirdropOwner(airdropClaimableOwner);
    }
  }
  // Check whether a wallet already claimed or not
  const [isWalletClaimed, setIsWalletClaimed] = useState<boolean>(false);
  const isRecipientClaimed = async (recipient: string, claimAmount: bigint) => {
    const isClaimedOnChain = await isClaimed({
      // AirdropClaimable contract at step #2
      contract: airdropClaimableContract,
      receiver: recipient,
      token: tokenContractAddress,
      tokenId: claimAmount
    });
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
    isRecipientClaimed(activeAccount.address, BigInt(0))
  }
  
  //4. Build MerkleTree from snapshot / allowlist
  const params: BaseTransactionOptions<GenerateMerkleTreeInfoERC20Params> = {
    contract: tokenContract,
    snapshot: snapshotWhitelist,
    tokenAddress: tokenContractAddress
  }
  const [merkleRoot, setMerkleRoot] = useState<string | null>(null);
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const generateMerkleTree = async () => {
    return await generateMerkleTreeInfoERC20(params);
  }
  const generateMerkleRoot = async () => {
    // Generate MerkleTree from whitelist
    const { merkleRoot, snapshotUri } = await generateMerkleTree();
    // Save snapshot
    setSnapshotUri(snapshotUri);
    // Save merkleRoot on AirdropClaimable from #2.
    setMerkleRoot(merkleRoot);
    setStep(Step.GENERATE_MERKLE_TREE);
  }

  // 5. Airdrop contract owner store whitelist to on-chain
  const setMerkleRootByOwner = async (
    activeAccount: Account, 
    merkleRoot: string,
    snapshotUri: string
  ) => {
    // Save snapshot
    const saveSnapshotTransaction = saveSnapshot({
      contract: airdropClaimableContract,
      merkleRoot,
      snapshotUri,
    });
    // Send the transaction
    await sendTransaction({ 
      transaction: saveSnapshotTransaction, 
      account: activeAccount 
    });
    // Set MerkleTree
    const transaction = setMerkleRootOnContract({
      contract: airdropClaimableContract,
      token: tokenContractAddress,
      tokenMerkleRoot: `0x${merkleRoot.replace("0x", "")}`,
      resetClaimStatus: true
    });
    // Send the transaction
    await sendTransaction({ 
      transaction: transaction, 
      account: activeAccount 
    });
    setStep(Step.AIRDROP_OWNER_SAVE_WHITELIST_ON_CHAIN);
  }

  // 6. Token contract owner approve AirdropClaimable contract as spender with amount (allowance)
  const [approveTransactionHash, setApproveTransactionHash] = useState<string | null>(null);
  const approveAirdropClaimableContractAddress = async (account: Account) => { 
    const transaction = await approve({
      contract: tokenContract,
      spender: airdropClaimableContractAddress,
      amount: totalAirdropAmount,
    });
    // Send the transaction
    const { transactionHash } = await sendTransaction({ 
      transaction, 
      account 
    });
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
  const claimAirdrop = async (recipient: string, account: Account) => {
    const claimTransaction = claimERC20({
      // AirdropClaimable contract at step #2
      contract: airdropClaimableContract,
      // tokenAddress: must be the main smart contract address use for airdrop at step #1
      tokenAddress: tokenContractAddress,
      // Wallet address of receiver
      recipient,
    });
    // Send the transaction
    console.log('claimTransaction = ' + JSON.stringify(claimTransaction));
    
    const { transactionHash } = await sendAndConfirmTransaction({ transaction: claimTransaction, account });
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
                        <a href={`https://sepolia.etherscan.io/address/${tokenContractAddress}`} target="_blank">
                          Token address: {tokenContractAddress}
                        </a>
                      </li>
                      <li>
                          <a className="underline" href={`https://sepolia.etherscan.io/address/${tokenOwner}`} target="_blank">
                          Owner: {tokenOwner}
                          </a>
                      </li>
                    </ol>
                    <li>AirdropClaimable Contract
                    </li>
                    <ol className="list-decimal ml-2.5">
                      <li>
                        <a className="underline" href={`https://sepolia.etherscan.io/address/${airdropClaimableContractAddress}`} target="_blank">
                        Token Address: {airdropClaimableContractAddress}
                        </a>
                      </li>
                      <li>
                        <a className="underline" href={`https://sepolia.etherscan.io/address/${airdropOwner}`} target="_blank">
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
                      <button className="btn-primary my-4" onClick={ () => setMerkleRootByOwner(activeAccount, merkleRoot, snapshotUri)}>
                        BE: save on-chain
                      </button>
                      { step == Step.AIRDROP_OWNER_SAVE_WHITELIST_ON_CHAIN &&(
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
                    <button className="btn-primary my-4" onClick={() => approveAirdropClaimableContractAddress(activeAccount)}>
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
                      <button className={isWalletClaimed ? "btn-disable" : "btn-primary"} onClick={() => { claimAirdrop(address, activeAccount) }} disabled={isWalletClaimed}>
                        { isWalletClaimed ? "Claimed" : "Claim Now"}
                      </button>
                  ) :
                    (<p className="warning-p">Current Wallet is not available for claim. Please connect with a wallet in the whitelist</p>)
                  }
                  { claimTransactionHash && (
                    <>
                      <a className="underline" href={`https://sepolia.etherscan.io/tx/${claimTransactionHash}`} target="_blank">
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