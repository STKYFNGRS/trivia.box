import type {
  TokenDistribution,
  TokenRecipient,
  POAPMintRequest,
  MerkleDistribution
} from '@/types'
import { ethers } from 'ethers'

export function validateTokenDistribution(
  distribution: TokenDistribution
): {
  valid: boolean
  error?: string
} {
  // Check total amount matches sum of recipient amounts
  const totalAmount = distribution.recipients.reduce(
    (sum, recipient) => sum + recipient.amount,
    BigInt(0)
  )

  if (totalAmount !== distribution.total_amount) {
    return {
      valid: false,
      error: 'Total amount mismatch'
    }
  }

  // Validate each recipient
  for (const recipient of distribution.recipients) {
    const validRecipient = validateTokenRecipient(recipient)
    if (!validRecipient.valid) {
      return validRecipient
    }
  }

  return { valid: true }
}

export function validateTokenRecipient(
  recipient: TokenRecipient
): {
  valid: boolean
  error?: string
} {
  // Validate wallet address using ethers v6
  try {
    ethers.getAddress(recipient.wallet_address); // Will throw if invalid
  } catch {
    return {
      valid: false,
      error: `Invalid wallet address: ${recipient.wallet_address}`
    }
  }

  // Validate amount
  if (recipient.amount <= BigInt(0)) {
    return {
      valid: false,
      error: 'Token amount must be greater than 0'
    }
  }

  // Validate Merkle proof
  if (!recipient.proof || recipient.proof.length === 0) {
    return {
      valid: false,
      error: 'Missing Merkle proof'
    }
  }

  return { valid: true }
}

export function validatePOAPMintRequest(
  request: POAPMintRequest
): {
  valid: boolean
  error?: string
} {
  // Validate recipient address using ethers v6
  try {
    ethers.getAddress(request.recipient); // Will throw if invalid
  } catch {
    return {
      valid: false,
      error: 'Invalid recipient address'
    }
  }

  // Validate metadata
  if (!request.metadata.name || !request.metadata.description) {
    return {
      valid: false,
      error: 'Missing required metadata fields'
    }
  }

  // Validate attributes
  if (!request.metadata.attributes || request.metadata.attributes.length === 0) {
    return {
      valid: false,
      error: 'Missing token attributes'
    }
  }

  return { valid: true }
}

export function validateMerkleDistribution(
  distribution: MerkleDistribution
): {
  valid: boolean
  error?: string
} {
  // Validate Merkle root
  if (!distribution.merkle_root || distribution.merkle_root.length !== 66) {
    return {
      valid: false,
      error: 'Invalid Merkle root'
    }
  }

  // Validate distribution window
  if (distribution.window_start >= distribution.window_end) {
    return {
      valid: false,
      error: 'Invalid distribution window'
    }
  }

  // Validate amounts
  if (
    distribution.total_recipients <= 0 ||
    distribution.total_amount <= BigInt(0)
  ) {
    return {
      valid: false,
      error: 'Invalid distribution amounts'
    }
  }

  return { valid: true }
}

// Utility function to verify Merkle proofs
export function verifyMerkleProof(
  proof: string[],
  root: string,
  leaf: string
): boolean {
  let computedHash = leaf

  for (const proofElement of proof) {
    if (computedHash < proofElement) {
      // In ethers v6, keccak256 and concat are directly on ethers
      computedHash = ethers.keccak256(
        ethers.concat([computedHash, proofElement])
      )
    } else {
      computedHash = ethers.keccak256(
        ethers.concat([proofElement, computedHash])
      )
    }
  }

  return computedHash === root
}