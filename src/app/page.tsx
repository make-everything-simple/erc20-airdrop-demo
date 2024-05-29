'use client';
import { 
  ConnectButton, 
  useActiveAccount, 
  useWalletBalance
} from "thirdweb/react";
import { getContract, sendTransaction, readContract } from "thirdweb";
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

export default function Home() {
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
  
  //4. Build MerkleTree: snapshot / allowlist of airdrop recipients and amounts
  const snapshot = [
    { recipient: "0x663217Fd41198bC5dB2F69313a324D0628daA9E8", amount: 11 },
    { recipient: "0xF537D4f5DE99c10931296F40A13fd19F9ab11f79", amount: 12 },
    { recipient: "0x8Ec17698C55f7B2aB9dB1B61ED142bef54163bc0", amount: 13 },
  ];
  const params: BaseTransactionOptions<GenerateMerkleTreeInfoERC20Params> = {
    contract: airDropContract,
    snapshot,
    tokenAddress: airdropMainContractAddress
  }
  const [merkleRoot, setMerkleRoot] = useState<string | null>(null);
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
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
      
      const ownerAddress = await readContract({ 
        contract: airdropClaimableContract, 
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
      if(ownerAddress.toLowerCase() == account.address.toLowerCase()) {
        setIsOwner(true);
      }
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

  // 6. BE whitelist the wallets to allow claim on behalf of constract's owner
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
    const items = snapshot.filter(item => item.recipient.toLowerCase() === walletAddress.toLowerCase());
    if(items.length) {
      return items[0].amount;
    }
    return 0;
  }
  const claimAirdrop = async (recipient: string, account: Account) => {
    console.log('-> recipient = ' + recipient + " account.walletAdres = " + account.address);
    
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
    await sendTransaction({ transaction: claimTransaction, account });
  }

  // Render Layout
  return (
    <main className="p-4 pb-10 min-h-[100vh] flex items-center justify-center container max-w-screen-lg mx-auto">
      <div className="container">
          <ConnectButton
            client={client}
            appMetadata={{
              name: "Example App",
              url: "https://example.com",
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
                <h1>Two smart contracts need to fulfill claim based airdrop </h1>
                <div style={{ 
                  backgroundColor: "#222", 
                  padding: "2rem",
                  borderRadius: "1rem",
                  textAlign: "left",
                  minWidth: "500px",
                  marginBottom: "2rem",
                  marginTop: "2rem"
                }}>
                  <ol>
                    <li>
                      <a href={`https://sepolia.etherscan.io/address/${airdropMainContractAddress}`}>
                        Main Airdrop Contract: {airdropMainContractAddress}
                      </a>
                    </li>
                    <li>
                      <a href={`https://sepolia.etherscan.io/address/${airdropClaimableContractAddress}`}>
                        AirdropClaimable Contract: {airdropClaimableContractAddress}
                      </a>
                    </li>
                  </ol>
                </div>
              </div>
              <div style={{ 
                  backgroundColor: "#222", 
                  padding: "2rem",
                  borderRadius: "1rem",
                  textAlign: "center",
                  minWidth: "500px",
                  marginBottom: "2rem",
                  marginTop: "2rem"
                }}>
                <h1>Generate MerkleTree from whitelisted wallets based on vesting schedule</h1>
                { snapshot && snapshot.map((item, index) => (
                  <span key={index}>
                    {index + 1}. Address: {item.recipient} with amount: {item.amount}
                    <br/>
                  </span>
                ))}
                <button onClick={() => generateMerkleRoot(activeAccount)} style={{ 
                  backgroundColor: "#FFF", 
                  color: "#333",
                  border: "nonce",
                  padding: "1rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "1rem"
                }}>Generate</button>
                { merkleRoot && (<p>Merkle Root Hash: {merkleRoot}</p>)}
                { snapshotUri && (<p>Snapshot URI: {snapshotUri}</p>)}
                { isOwner && merkleRoot && snapshotUri && (
                  <div>
                    <h1>For Contract Owner only</h1>
                    <button onClick={ () => setMerkleRootByOwner(activeAccount, merkleRoot, snapshotUri) } style={{ 
                      backgroundColor: "#FFF", 
                      color: "#333",
                      border: "nonce",
                      padding: "1rem",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "1rem"
                    }}>BE whitelist wallets to airdrop</button>
                  </div>
                )}
              </div>
              <div style={{ 
                backgroundColor: "#222", 
                padding: "2rem",
                borderRadius: "1rem",
                textAlign: "center",
                minWidth: "500px"
              }}>
                <h1>Active wallet address: {address}</h1>
                <h2>Token balance: {data?.displayValue} {data?.symbol}</h2>
                <button onClick={() => { claimAirdrop(address, activeAccount) }} style={{ 
                  backgroundColor: "#FFF", 
                  color: "#333",
                  border: "nonce",
                  padding: "1rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "1rem"
                }}>Claim Airdrop: {getClaimableAmountForWallet(address)} {data?.symbol}</button>
              </div>
            </div>
          )}
      </div>
    </main>
  );
}