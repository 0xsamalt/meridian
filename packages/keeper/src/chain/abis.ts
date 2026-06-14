export const vaultAbi = [
  {
    name: 'totalAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'lastRebalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'cooldown',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    // Public array getter — Solidity auto-generates for `address[] public strategies`
    name: 'strategies',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getStrategies',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    // Public mapping getter for per-strategy cap
    name: 'maxAllocationBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    // ERC4626: underlying asset address
    name: 'asset',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'rebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'strats', type: 'address[]' },
      { name: 'targetBps', type: 'uint256[]' },
      { name: 'reasoningHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

export const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const strategyAbi = [
  {
    name: 'getCurrentAPY',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const mockAavePoolAbi = [
  {
    name: 'setLiquidityRate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'rate', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'mockLiquidityRate',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const registryAbi = [
  {
    name: 'recordDecision',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'cid', type: 'string' },
      { name: 'perfDeltaBps', type: 'int256' },
      { name: 'tvl', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'decisionCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getDecision',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'i', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'timestamp',     type: 'uint64'  },
        { name: 'reasoningHash', type: 'bytes32' },
        { name: 'cid',           type: 'string'  },
        { name: 'perfDeltaBps',  type: 'int256'  },
        { name: 'totalAssets',   type: 'uint256' },
      ],
    }],
  },
  {
    name: 'DecisionRecorded',
    type: 'event',
    inputs: [
      { name: 'index', type: 'uint256', indexed: true },
      { name: 'reasoningHash', type: 'bytes32', indexed: true },
      { name: 'cid', type: 'string', indexed: false },
      { name: 'perfDeltaBps', type: 'int256', indexed: false },
    ],
  },
] as const
