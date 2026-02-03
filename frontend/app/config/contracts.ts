import { baseSepolia, base } from 'wagmi/chains'

export const CONTRACTS = {
  // Testnet (Base Sepolia)
  [baseSepolia.id]: {
    ember: '0x2133B33F07A480bb0F53dF623B4Bd4662202E061' as `0x${string}`,
    arena: '0x11129C920E5aCe4Ae0989d3fd3F6c48306442A0F' as `0x${string}`,
    zap: '0xd3Da4462CdD2518DAfD65351eC77A0E028f1aE50' as `0x${string}`,
  },
  // Mainnet (Base) - to be filled after mainnet deploy
  [base.id]: {
    ember: '0xFf18cBE8b299465731D1C1536B7a8f8F4aa5e2cf' as `0x${string}`,
    arena: '' as `0x${string}`,
    zap: '' as `0x${string}`,
  },
}

export const ARENA_ABI = [
  // Read functions
  {
    name: 'markets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'initiator', type: 'address' },
      { name: 'title', type: 'string' },
      { name: 'rules', type: 'string' },
      { name: 'entryCost', type: 'uint256' },
      { name: 'entryEnd', type: 'uint256' },
      { name: 'voteEnd', type: 'uint256' },
      { name: 'totalPot', type: 'uint256' },
      { name: 'totalVotes', type: 'uint256' },
      { name: 'entryCount', type: 'uint256' },
      { name: 'state', type: 'uint8' },
      { name: 'resolved', type: 'bool' },
    ],
  },
  {
    name: 'getMarket',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'initiator', type: 'address' },
          { name: 'title', type: 'string' },
          { name: 'rules', type: 'string' },
          { name: 'entryCost', type: 'uint256' },
          { name: 'entryEnd', type: 'uint256' },
          { name: 'voteEnd', type: 'uint256' },
          { name: 'totalPot', type: 'uint256' },
          { name: 'totalVotes', type: 'uint256' },
          { name: 'entryCount', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'resolved', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getEntry',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'entryId', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'author', type: 'address' },
          { name: 'data', type: 'string' },
          { name: 'votes', type: 'uint256' },
          { name: 'filtered', type: 'bool' },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getLeaderboard',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'entryIds', type: 'uint256[]' },
      { name: 'voteCounts', type: 'uint256[]' },
    ],
  },
  {
    name: 'getCurrentVotePrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'numVotes', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'marketCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Write functions
  {
    name: 'createMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'rules', type: 'string' },
      { name: 'entryCost', type: 'uint256' },
      { name: 'entryDuration', type: 'uint256' },
      { name: 'voteDuration', type: 'uint256' },
    ],
    outputs: [{ name: 'marketId', type: 'uint256' }],
  },
  {
    name: 'submitEntry',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'data', type: 'string' },
      { name: 'approved', type: 'bool' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'entryId', type: 'uint256' }],
  },
  {
    name: 'vote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'entryId', type: 'uint256' },
      { name: 'voteAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'resolve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
  },
  // Events
  {
    name: 'MarketCreated',
    type: 'event',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'initiator', type: 'address', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'entryCost', type: 'uint256', indexed: false },
      { name: 'entryEnd', type: 'uint256', indexed: false },
      { name: 'voteEnd', type: 'uint256', indexed: false },
    ],
  },
] as const

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
