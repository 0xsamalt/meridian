// Mantle Sepolia — chain 5003
export const VAULT_ADDRESS     = '0x2a339711221B33f9e5Ccd2e3811D3d00Eba020A7' as const
export const REGISTRY_ADDRESS  = '0xf5bE0c99a828F4eAB72E743F883c22EB68caf5bE' as const
export const METH_ADDRESS      = '0x9EF6f9160Ba00B6621e5CB3217BB8b54a92B2828' as const
export const CMETH_STRATEGY    = '0x87Af08833081B09222695133017d25c06eFAa12E' as const
export const AAVE_STRATEGY     = '0x22923419faBE7853b3E4fE4fBE2C90EDc21DA090' as const
export const USDY_STRATEGY     = '0x697b88a6BF3Df8D038b5685833f62646b1F1980a' as const

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
