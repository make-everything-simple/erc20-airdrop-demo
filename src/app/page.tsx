'use client';
import { 
  ConnectButton, 
  useActiveAccount, 
  useWalletBalance
} from "thirdweb/react";
import { getContract, sendTransaction, readContract, ThirdwebContract, sendAndConfirmTransaction } from "thirdweb";
import { sepolia } from "thirdweb/chains";
import { useState } from "react";
import { 
  generateMerkleTreeInfoERC20, 
  GenerateMerkleTreeInfoERC20Params,
  claimERC20,
  setMerkleRoot as setMerkleRootOnContract,
  saveSnapshot
} from "thirdweb/extensions/airdrop";
import { BaseTransactionOptions } from "thirdweb/transaction";
import { Account } from "thirdweb/wallets";
import { getContractMetadata } from "thirdweb/extensions/common"
// Internal components | services
import { client } from './client';
import { approve } from "thirdweb/extensions/erc20";

export default function Home() {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const snapshotWhitelist = [
    { recipient: "0x663217Fd41198bC5dB2F69313a324D0628daA9E8", amount: 60 },
    { recipient: "0x663217Fd41198bC5dB2F69313a324D0628daA9E8", amount: 61 },
    { recipient: "0x8Ec17698C55f7B2aB9dB1B61ED142bef54163bc0", amount: 12 },
    // cheat part to make the unique mekleRoot
    { recipient: "0x8AA0b6538Ba8e9DB298A7B603477e4045729b830", amount: 2 }
  ];
  const totalAirdropAmount = snapshotWhitelist.reduce((accumulator, currentValue) => accumulator + currentValue.amount, 0);
  //1. Deploy main contract use for airdrop & connect to it
  const tokenContractAddress = process.env.NEXT_PUBLIC_MAIN_AIRDROP_CONTRACT_ADDRESS || "";
  const tokenContract = getContract({ 
    client, 
    chain: sepolia, 
    address: tokenContractAddress
  });
  //2. Deploy smart contract support AirdropClaimable & connect to it
  const airdropClaimableContractAddress = process.env.NEXT_PUBLIC_CLAIMABLE_AIRDROP_CONTRACT_ADDRESS || '';
  const airdropClaimableContract = getContract({ 
    client, 
    chain: sepolia, 
    address: airdropClaimableContractAddress
  });

  // 3. Main contract owner approve AirdropClaimable contract as spender with amount (allowance)
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
  const [airdropOwner, setAirdropOwner] = useState<string>(ZERO_ADDRESS);
  const [tokenOwner, setTokenOwner] = useState<string>(ZERO_ADDRESS);
  const fetchContractOwners = async () => {
    if (tokenOwner == ZERO_ADDRESS) {
      const airdropOwner = await getOwnerOfContract(tokenContract);
      setTokenOwner(airdropOwner);
    }
    if (airdropOwner == ZERO_ADDRESS) {
      const airdropClaimableOwner = await getOwnerOfContract(airdropClaimableContract);
      setAirdropOwner(airdropClaimableOwner);
    }
  }
  fetchContractOwners();
  const [isAirdropClaimableOwner, setIsAirdropClaimableOwner] = useState<boolean>(false);
  const [isAirdropOwner, setIsAirdropOwner] = useState<boolean>(false);
  const checkCurrentWalletIsOwner = async (account: Account) => {
    await fetchContractOwners();
    if(airdropOwner.toLowerCase() == account.address.toLowerCase()) {
      setIsAirdropOwner(true);
    }
    if(airdropOwner.toLowerCase() == account.address.toLowerCase()) {
      setIsAirdropClaimableOwner(true);
    }
  }
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
  console.log('approveAirdropClaimableContractAddress txHash = ' + transactionHash);
  
}
  
  //4. Build MerkleTree: snapshot / allowlist of airdrop recipients and amounts
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
  const generateMerkleRoot = async (account: Account) => {
    const { merkleRoot, snapshotUri } = await generateMerkleTree();
    setSnapshotUri(snapshotUri);
    setMerkleRoot(merkleRoot);
    // Execute transaction setMerkleRoot on AirdropClaimable from #2.
    // token: must be the main smart contract address use for airdrop
    if(account) {
      // Read the owner of AirdropClaimable contract
      // - if the owner's wallet is connected. 
      //   - trigger the setMerkleTree. as BE will trigger on-demand
      // - else
      //   - skip it
      const metadata = await getContractMetadata({ contract: airdropClaimableContract });
      console.log('--> currencyMetadata = ' + JSON.stringify(metadata));
    }
  }
  //5. Fetch the active account to get the active wallet address
  const activeAccount: Account | undefined = useActiveAccount();
  const address = activeAccount?.address;
  //5.1 Get token balance of a specific address
  const { data } = useWalletBalance({
    chain: sepolia,
    address,
    client,
    tokenAddress: tokenContractAddress,
  });
  if(activeAccount) {
    checkCurrentWalletIsOwner(activeAccount);
  }

  // 6. BE whitelist the wallets to allow claim on behalf of contract's owner
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
  }

  //7. Execute claimERC20 on AirdropClaimable contract
  const getClaimableAmountForWallet = (walletAddress: string) => {
    const items = snapshotWhitelist.filter(item => item.recipient.toLowerCase() === walletAddress.toLowerCase());
    if(items.length) {
      return items[0].amount;
    }
    return 0;
  }
  const [claimTransactionHash, setClaimTransactionHash] = useState<string | null>(null);
  const claimAirdrop = async (recipient: string, account: Account) => {
    console.log('-> recipient = ' + recipient + " account.walletAddress = " + account.address);
    
    const claimTransaction = claimERC20({
      // AirdropClaimable contract at step #2
      contract: airdropClaimableContract,
      // tokenAddress: must be the main smart contract address use for airdrop at step #1
      tokenAddress: tokenContractAddress,
      // Wallet address of receiver
      recipient,
    });
    console.log("claimTransaction = " + JSON.stringify(claimTransaction));
    // Send the transaction
    const { transactionHash } = await sendAndConfirmTransaction({ transaction: claimTransaction, account });
    setClaimTransactionHash(transactionHash);
  }

  // Render Layout
  return (
    <main className="p-4 pb-10 min-h-[100vh] flex items-center justify-center container max-w-screen-lg mx-auto">
      <div className="container">
          <ConnectButton
            client={client}
            appMetadata={{
              name: "ERC20 Airdrop Demo",
              url: "https://github.com/make-everything-simple/erc20-airdrop-demo",
            }}
          />
          { address && (
            <div>
              <div className="container-primary bg-[#222]">
                  <h1 className="text-3xl font-bold text-center">
                    L1 Airdrop claim-based approach. Recipient who is in the whitelist will pay gas fee
                  </h1>
                <div style={{ 
                  backgroundColor: "#222", 
                  padding: "1rem",
                  borderRadius: "1rem",
                  textAlign: "left",
                  minWidth: "500px"
                }}>
                  <p className="text-2xl font-bold text-center">
                      Smart Contract: Require two following smart contracts
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
              </div>
              <div className="container-primary bg-[#404040]">
                <p className="text-2xl font-bold text-center">
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
                <button className="btn-primary my-4" onClick={() => generateMerkleRoot(activeAccount)}>
                  BE: Generate
                </button>
                <p>||</p>
                <p>\/</p>
                <ol className="list-decimal">
                  { merkleRoot && (<li>MerkleRoot Hash: {merkleRoot}</li>)}
                  { snapshotUri && (<li>Snapshot URI: {snapshotUri}</li>)}
                </ol>
                { isAirdropClaimableOwner && merkleRoot && snapshotUri && (
                  <div className="flex items-center flex-col my-4">
                    <p className="text-center font-bold">
                      AirdropClaimable Contract Owner save whitelist to on-chain
                    </p>
                    <button className="btn-primary my-4" onClick={ () => setMerkleRootByOwner(activeAccount, merkleRoot, snapshotUri)}>
                      BE: save on-chain
                    </button>
                    <p>||</p>
                    <p>\/</p>
                  </div>
                )}
                {isAirdropOwner && merkleRoot && snapshotUri ? (
                  <div className="flex items-center flex-col my-4">
                    <p className="text-center font-bold">
                        Partner: Owner of Airdrop contract approve AirdropClaimable contract as Spender with allowance = {totalAirdropAmount}
                    </p>
                    <button className="btn-primary my-4" onClick={() => approveAirdropClaimableContractAddress(activeAccount)}>
                      Partner: Approve Allowance
                    </button>
                  </div>
                  ): (<div><br></br><p className="text-yellow-500 selection:bg-fuchsia-300 selection:text-fuchsia-900 font-bold">Please connect wallet is the owner of token contract to approve allowance</p></div>)}
              </div>
              <div className="container-primary">
                <p className="text-2xl font-bold text-center text-white">
                    FE: User connects wallet to claim
                </p>
                <ol className="list-decimal">
                  <li className="text-white">Claiming Wallet: <b>{address}</b>
                  </li>
                  <li className="text-white">Available Claim amount: <b>{getClaimableAmountForWallet(address)}</b>
                  </li>
                </ol>
                  { getClaimableAmountForWallet(address) > 0 ? (
                      <button className="btn-primary" onClick={() => { claimAirdrop(address, activeAccount) }}>
                        { claimTransactionHash ? "Claimed" : "Claim Now"}
                      </button>
                  ) :
                    (<p className="text-yellow-500 selection:bg-fuchsia-300 selection:text-fuchsia-900 font-bold">Current Wallet is not available for claim. Please connect with a wallet in the whitelist</p>)
                  }
                  { claimTransactionHash && (
                    <div>
                      <a className="underline" href={`https://sepolia.etherscan.io/tx/${claimTransactionHash}`} target="_blank">
                      transactionHash: {claimTransactionHash}
                      </a>
                    </div>
                  )}
              </div>
            </div>
          )}
      </div>
    </main>
  );
}