'use client';
import { 
  ConnectButton, 
  useActiveAccount, 
  useWalletBalance
} from "thirdweb/react";
import { getContract, sendTransaction, readContract, ThirdwebContract } from "thirdweb";
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
  const snapshotWhitelist = [
    { recipient: "0x663217Fd41198bC5dB2F69313a324D0628daA9E8", amount: 10 },
    { recipient: "0xF537D4f5DE99c10931296F40A13fd19F9ab11f79", amount: 11 },
    { recipient: "0x8Ec17698C55f7B2aB9dB1B61ED142bef54163bc0", amount: 12 },
    // cheat part to make the unique mekleRoot
    { recipient: "0x8AA0b6538Ba8e9DB298A7B603477e4045729b830", amount: 1 }
  ];
  const totalAirdropAmount = snapshotWhitelist.reduce((accumulator, currentValue) => accumulator + currentValue.amount, 0);
  //1. Deploy main contract use for airdrop & connect to it
  const airdropMainContractAddress = process.env.NEXT_PUBLIC_MAIN_AIRDROP_CONTRACT_ADDRESS || "";
  const airDropContract = getContract({ 
    client, 
    chain: sepolia, 
    address: airdropMainContractAddress
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
  const [isAirdropClaimableOwner, setIsAirdropClaimableOwner] = useState<boolean>(false);
  const [isAirdropOwner, setIsAirdropOwner] = useState<boolean>(false);
  const checkCurrentWalletIsOwner = async (account: Account) => {
    const airdropOwner = await getOwnerOfContract(airDropContract);
    if(airdropOwner.toLowerCase() == account.address.toLowerCase()) {
      setIsAirdropClaimableOwner(true);
    }

    const airdropClaimableOwner = await getOwnerOfContract(airdropClaimableContract);
    if(airdropClaimableOwner.toLowerCase() == account.address.toLowerCase()) {
      setIsAirdropOwner(true);
    }
  }
  const approveAirdropClaimableContractAddress = async (account: Account) => { 
    const transaction = await approve({
    contract: airDropContract,
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
    contract: airDropContract,
    snapshot: snapshotWhitelist,
    tokenAddress: airdropMainContractAddress
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
    tokenAddress: airdropMainContractAddress,
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
      token: airdropMainContractAddress,
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
      tokenAddress: airdropMainContractAddress,
      // Wallet address of receiver
      recipient,
    });
    console.log("claimTransaction = " + JSON.stringify(claimTransaction));
    // Send the transaction
    const { transactionHash } = await sendTransaction({ transaction: claimTransaction, account });
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
              <div style={{ 
                  backgroundColor: "#222", 
                  padding: "2rem",
                  borderRadius: "1rem",
                  textAlign: "center",
                  minWidth: "500px",
                  marginBottom: "2rem",
                  marginTop: "2rem"
                }}>
                  <h1>
                    <b>
                    L1 Airdrop claim-based approach. Recipient who is in the whitelist will pay gas fee
                    </b>
                  </h1>
                <div style={{ 
                  backgroundColor: "#222", 
                  padding: "1rem",
                  borderRadius: "1rem",
                  textAlign: "left",
                  minWidth: "500px"
                }}>
                  <p style={{textAlign: "center"}}>
                    <mark>
                      Smart Contract: Require two following smart contracts
                    </mark>
                  </p>
                  <ol>
                    <li>
                      <a href={`https://sepolia.etherscan.io/address/${airdropMainContractAddress}`} target="_blank">
                        Airdrop Contract: {airdropMainContractAddress}
                      </a>
                    </li>
                    <li>
                      <a className="underline" href={`https://sepolia.etherscan.io/address/${airdropClaimableContractAddress}`} target="_blank">
                        AirdropClaimable Contract: {airdropClaimableContractAddress}
                      </a>
                    </li>
                  </ol>
                </div>
              </div>
              <div style={{ 
                  backgroundColor: "#404040", 
                  padding: "2rem",
                  borderRadius: "1rem",
                  textAlign: "center",
                  minWidth: "500px",
                  marginBottom: "2rem",
                  marginTop: "2rem"
                }}>
                <p style={{textAlign: "center"}}>
                  <mark>
                  BE: Generate MerkleTree for whitelist wallets
                  </mark>
                </p>
                <div style={{ 
                  textAlign: "left",
                  minWidth: "500px"
                }}>
                  { snapshotWhitelist && snapshotWhitelist.map((item, index) => (
                    <span key={index}>
                      {index + 1}. Address: {item.recipient} with airdrop amount: {item.amount}
                      <br/>
                    </span>
                  ))}
                </div>
                <button onClick={() => generateMerkleRoot(activeAccount)} style={{ 
                  backgroundColor: "#FFF", 
                  color: "#333",
                  border: "nonce",
                  padding: "1rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "1rem"
                }}>BE: Generate</button>
                { merkleRoot && (<p>MerkleRoot Hash: {merkleRoot}</p>)}
                { snapshotUri && (<p>Snapshot URI: {snapshotUri}</p>)}
                { isAirdropClaimableOwner && merkleRoot && snapshotUri && (
                  <div>
                    <p style={{textAlign: "center"}}>
                      <mark>
                        AirdropClaimable Contract Owner save whitelist to on-chain
                      </mark>
                    </p>
                    <button onClick={ () => setMerkleRootByOwner(activeAccount, merkleRoot, snapshotUri) } style={{ 
                      backgroundColor: "#FFF", 
                      color: "#333",
                      border: "nonce",
                      padding: "1rem",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "1rem"
                    }}>BE: whitelist wallets to airdrop</button>
                  </div>
                )}
                {isAirdropOwner && merkleRoot && snapshotUri && (
                  <div style={{ 
                    backgroundColor: "#222", 
                    padding: "2rem",
                    borderRadius: "1rem",
                    textAlign: "center",
                    minWidth: "500px",
                    marginBottom: "1rem",
                    marginTop: "1rem"
                  }}>
                    <p>
                      <mark>
                        Partner: Owner of Airdrop contract approve allowance to AirdropClaimable contract as Spender{totalAirdropAmount}
                      </mark>
                    </p>
                    <button onClick={() => approveAirdropClaimableContractAddress(activeAccount)} style={{ 
                      backgroundColor: "#FFF", 
                      color: "#333",
                      border: "nonce",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "1rem",
                      padding: "1rem"
                    }}>
                      Partner: Approve Allowance
                    </button>
                  </div>
                  )}
              </div>
              <div style={{ 
                backgroundColor: "#66ccff", 
                padding: "2rem",
                borderRadius: "1rem",
                textAlign: "center",
                minWidth: "500px",
                flexDirection: "column"
              }}>
                <p style={{color: "black"}}>
                  <mark>
                    FE: User connects whitelist wallet to claim
                  </mark>
                </p>
                <p style={{color: "black"}}>Claiming Wallet: <em>{address}</em></p>
                <p style={{color: "black"}}>
                  Available Claim amount: <em>{getClaimableAmountForWallet(address)}</em>
                </p>
                  { getClaimableAmountForWallet(address) > 0 ? (
                      <button onClick={() => { claimAirdrop(address, activeAccount) }} style={{ 
                        backgroundColor: "#FFF", 
                        color: "#333",
                        border: "nonce",
                        padding: "1rem",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "1rem",
                        fontWeight: "bold"
                      }}>
                        { claimTransactionHash ? "Claimed" : "Claim Now"}
                      </button>
                  ) :
                    (<p style={{backgroundColor: "red"}}>Current Wallet is not available for claim. Please connect with a whitelisted wallet</p>)
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