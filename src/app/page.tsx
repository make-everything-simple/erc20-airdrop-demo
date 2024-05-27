'use client';
import { ConnectButton, useActiveAccount, useWalletBalance } from "thirdweb/react";
import { getBalance } from "thirdweb/extensions/erc20";
import { getContract } from "thirdweb";
import { sepolia } from "thirdweb/chains";
import { useState } from "react";
import { 
  generateMerkleTreeInfoERC20, 
  GenerateMerkleTreeInfoERC20Params 
} from "thirdweb/extensions/airdrop";
import { BaseTransactionOptions } from "thirdweb/transaction";
import { client } from './client';


export default function Index() {
// connect to your contract
const airdropGTMContractAddress = '0xEBa5F3C0c7ebAEb6B19253E04980B34AE794c4d7';
const contract = getContract({ 
  client, 
  chain: sepolia, 
  address: airdropGTMContractAddress
});
  // snapshot / allowlist of airdrop recipients and amounts
  const snapshot = [
    { recipient: "0x663217Fd41198bC5dB2F69313a324D0628daA9E8", amount: 10 },
    { recipient: "0x8Ec17698C55f7B2aB9dB1B61ED142bef54163bc0", amount: 100 },
  ];
  const params: BaseTransactionOptions<GenerateMerkleTreeInfoERC20Params> = {
    contract,
    snapshot,
    tokenAddress: airdropGTMContractAddress
  }
  const [merkleRoot, setMerkleRoot] = useState<string | null>(null);
  const generateMerkleTree = async () => {
    const { merkleRoot, snapshotUri } = await generateMerkleTreeInfoERC20(params);
    console.log(`--> snapshotUri = ${snapshotUri}, merkleRoot = ${merkleRoot}`);
    setMerkleRoot(merkleRoot);
  }
  // Airdrop
  const activeAccount = useActiveAccount();
  const address = activeAccount?.address;
 
  // Get token balance of a specific address
  const { data } = useWalletBalance({
    chain: sepolia,
    address,
    client,
    tokenAddress: airdropGTMContractAddress,
  });

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
                <h1>Generate Merkle Tree from wallets</h1>
                { snapshot && snapshot.map((item, index) => (
                  <span key={index}>
                    {index + 1}. Address {item.recipient} with amount ${item.amount}
                    <br/>
                  </span>
                ))}
                <button onClick={generateMerkleTree} style={{ 
                  backgroundColor: "#FFF", 
                  color: "#333",
                  border: "nonce",
                  padding: "1rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "1rem"
                }}>Generate</button>
                { merkleRoot && (<p>Merkle Root Hash: {merkleRoot}</p>)}
              </div>
              <div style={{ 
                backgroundColor: "#222", 
                padding: "2rem",
                borderRadius: "1rem",
                textAlign: "center",
                minWidth: "500px"
              }}>
                <h1>ERC-20 Airdrop contract address {airdropGTMContractAddress}</h1>
                <h3>Token balance: {data?.displayValue} {data?.symbol}</h3>
              </div>
            </div>
          )}
      </div>
    </main>
  );
}