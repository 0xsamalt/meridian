// Mantle Sepolia — chain 5003
// METH_ADDRESS points to MockWETH — a public-mint faucet token used as the vault asset on testnet
export const VAULT_ADDRESS     = '0x94fB1E81b912e11fD2718e261EA39810C80c7471' as const
export const REGISTRY_ADDRESS  = '0x27796e411769ebf9b365e8534bae3a03c5588cad' as const
export const METH_ADDRESS      = '0x849971BAB164D6B8cD7B0916F104c720d5570d19' as const
export const CMETH_STRATEGY    = '0x3a2aa17Fae857007DB1ab8cAEc160C1bEfB9Dca7' as const
export const AAVE_STRATEGY     = '0x441EEAb712DDD88b61642ace0Ae237525512197a' as const
export const USDY_STRATEGY     = '0x95389826649dBd891e2aB6a0813EB3336c41345A' as const

export const STRATEGY_META = {
  [CMETH_STRATEGY]: { key: 'cmeth', label: 'cmETH Restaking', color: '#3B82F6' },
  [AAVE_STRATEGY]:  { key: 'aave',  label: 'Aave V3 WETH',   color: '#10B981' },
  [USDY_STRATEGY]:  { key: 'usdy',  label: 'USDY T-bill',     color: '#F59E0B' },
} as const

export const EXPLORER = 'https://sepolia.mantlescan.xyz'

// ---- ABI fragments -------------------------------------------------------

export const erc20Abi = [
  { name: 'balanceOf',  type: 'function', stateMutability: 'view',        inputs: [{ name: 'account', type: 'address' }],                                    outputs: [{ type: 'uint256' }] },
  { name: 'allowance',  type: 'function', stateMutability: 'view',        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',    type: 'function', stateMutability: 'nonpayable',   inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'decimals',   type: 'function', stateMutability: 'view',        inputs: [],                                                                         outputs: [{ type: 'uint8' }] },
  { name: 'symbol',     type: 'function', stateMutability: 'view',        inputs: [],                                                                         outputs: [{ type: 'string' }] },
] as const

// MockWETH (and all mock tokens) inherit MockERC20 which exposes a public mint
export const mockErc20Abi = [
  ...erc20Abi,
  { name: 'mint', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const

export const vaultAbi = [
  { name: 'totalAssets',         type: 'function', stateMutability: 'view',      inputs: [],                                                                                        outputs: [{ type: 'uint256' }] },
  { name: 'totalSupply',         type: 'function', stateMutability: 'view',      inputs: [],                                                                                        outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf',           type: 'function', stateMutability: 'view',      inputs: [{ name: 'account', type: 'address' }],                                                    outputs: [{ type: 'uint256' }] },
  { name: 'convertToAssets',     type: 'function', stateMutability: 'view',      inputs: [{ name: 'shares', type: 'uint256' }],                                                     outputs: [{ type: 'uint256' }] },
  { name: 'convertToShares',     type: 'function', stateMutability: 'view',      inputs: [{ name: 'assets', type: 'uint256' }],                                                     outputs: [{ type: 'uint256' }] },
  { name: 'previewDeposit',      type: 'function', stateMutability: 'view',      inputs: [{ name: 'assets', type: 'uint256' }],                                                     outputs: [{ type: 'uint256' }] },
  { name: 'previewRedeem',       type: 'function', stateMutability: 'view',      inputs: [{ name: 'shares', type: 'uint256' }],                                                     outputs: [{ type: 'uint256' }] },
  { name: 'deposit',             type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }],             outputs: [{ type: 'uint256' }] },
  { name: 'redeem',              type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'lastRebalance',       type: 'function', stateMutability: 'view',      inputs: [],                                                                                        outputs: [{ type: 'uint256' }] },
  { name: 'cooldown',            type: 'function', stateMutability: 'view',      inputs: [],                                                                                        outputs: [{ type: 'uint256' }] },
  { name: 'maxAllocationBps',    type: 'function', stateMutability: 'view',      inputs: [{ name: 'strategy', type: 'address' }],                                                   outputs: [{ type: 'uint256' }] },
  { name: 'getStrategies',       type: 'function', stateMutability: 'view',      inputs: [],                                                                                        outputs: [{ type: 'address[]' }] },
] as const

export const strategyAbi = [
  { name: 'getBalance',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getCurrentAPY', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

export const registryAbi = [
  { name: 'decisionCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'getDecision',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'i', type: 'uint256' }],
    outputs: [{
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
      { name: 'index',          type: 'uint256', indexed: true  },
      { name: 'reasoningHash',  type: 'bytes32', indexed: true  },
      { name: 'cid',            type: 'string',  indexed: false },
      { name: 'perfDeltaBps',   type: 'int256',  indexed: false },
    ],
  },
] as const
