import { keccak256, toBytes } from 'viem'
import type { Hex } from 'viem'
import { env } from '../config.js'
import type { ReasoningDoc } from './build.js'

interface PinataResponse {
  IpfsHash: string
  PinSize: number
  Timestamp: string
}

export async function pinReasoning(
  doc: ReasoningDoc,
): Promise<{ cid: string; reasoningHash: Hex }> {
  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PINATA_JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataContent: doc,
      pinataMetadata: { name: `meridian-decision-${doc.timestamp}` },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pinata upload failed ${response.status}: ${text}`)
  }

  const data = (await response.json()) as PinataResponse
  const cid = data.IpfsHash
  const reasoningHash = keccak256(toBytes(cid)) as Hex
  return { cid, reasoningHash }
}
