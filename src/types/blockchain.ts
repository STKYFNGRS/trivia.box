// Token distribution
export interface TokenDistribution {
  week_number: number
  year: number
  total_amount: bigint
  recipients: TokenRecipient[]
  transaction_hash?: string
  distributed_at?: Date
}

// Token recipient
export interface TokenRecipient {
  wallet_address: string
  amount: bigint
  achievements: string[]
  proof: string[]
}

// POAP mint request
export interface POAPMintRequest {
  achievement_id: number
  recipient: string
  metadata: {
    name: string
    description: string
    image: string
    attributes: {
      trait_type: string
      value: string | number
    }[]
  }
}

// Contract interaction result
export interface ContractInteraction {
  success: boolean
  transaction_hash?: string
  error_message?: string
  block_number?: number
  gas_used?: number
}

// Chain config
export interface ChainConfig {
  chain_id: number
  poap_contract: string
  token_contract: string
  distributor_contract: string
  rpc_url: string
}

// Merkle distribution
export interface MerkleDistribution {
  merkle_root: string
  proof_cid: string
  total_recipients: number
  total_amount: bigint
  window_start: Date
  window_end: Date
}

// Token claim
export interface TokenClaim {
  user_id: number
  amount: bigint
  proof: string[]
  claimed: boolean
  claim_tx?: string
  claimed_at?: Date
}