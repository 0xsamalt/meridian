import { type Address, type Hex, keccak256, toBytes, parseAbiItem } from 'viem'
import { env } from '../config.js'
import { publicClient, walletClient } from './clients.js'
import { registryAbi } from './abis.js'

const REGISTRY = env.REGISTRY_ADDRESS as Address

export interface DecisionLog {
  index: bigint
  reasoningHash: Hex
  cid: string
  perfDeltaBps: bigint
  timestamp: bigint
}

const decisionRecordedEvent = parseAbiItem(
  'event DecisionRecorded(uint256 indexed index, bytes32 indexed reasoningHash, string cid, int256 perfDeltaBps)',
)

/**
 * Anchor a keeper decision on-chain.
 * reasoningHash MUST equal keccak256(bytes(cid)) — the registry enforces this.
 */
export async function recordDecision(
  cid: string,
  perfDeltaBps: bigint,
  totalAssets: bigint,
): Promise<Hex> {
  const reasoningHash = keccak256(toBytes(cid)) as Hex

  const hash = await walletClient.writeContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: 'recordDecision',
    args: [reasoningHash, cid, perfDeltaBps, totalAssets],
  })

  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

// Mantle Sepolia RPC caps eth_getLogs to 10,000 blocks per request.
const LOG_RANGE = 9_000n

export async function getDecisions(fromBlock?: bigint): Promise<DecisionLog[]> {
  let start: bigint
  if (fromBlock !== undefined) {
    start = fromBlock
  } else {
    const latest = await publicClient.getBlockNumber()
    start = latest > LOG_RANGE ? latest - LOG_RANGE : 0n
  }

  const logs = await publicClient.getLogs({
    address: REGISTRY,
    event: decisionRecordedEvent,
    fromBlock: start,
    toBlock: 'latest',
  })

  return logs
    .filter((log) => log.args !== undefined)
    .map((log) => ({
      index: log.args.index ?? 0n,
      reasoningHash: (log.args.reasoningHash ?? '0x') as Hex,
      cid: log.args.cid ?? '',
      perfDeltaBps: log.args.perfDeltaBps ?? 0n,
      timestamp: log.blockNumber ?? 0n,
    }))
}
