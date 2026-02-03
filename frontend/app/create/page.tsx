'use client'

import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useAccount, useReadContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { parseEther, formatEther } from 'viem'
import Link from 'next/link'
import { CONTRACTS, ARENA_ABI, ERC20_ABI } from '../config/contracts'
import { baseSepolia } from 'wagmi/chains'

const MARKET_FEE = parseEther('100000') // 100K EMBER
const MARKET_FEE_USD = 100 // $100 USD equivalent

// Common tokens on Base
const TOKENS = [
  { symbol: 'EMBER', name: '$EMBER', address: null, decimals: 18 },
  { symbol: 'USDC', name: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { symbol: 'ETH', name: 'ETH', address: null, decimals: 18 },
  { symbol: 'USDT', name: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
]

function formatWithCommas(value: string): string {
  const parts = value.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

export default function CreateMarket() {
  const chainId = useChainId()
  const { address, isConnected } = useAccount()
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS] || CONTRACTS[baseSepolia.id]
  
  const [title, setTitle] = useState('')
  const [rules, setRules] = useState('')
  const [entryCost, setEntryCost] = useState('10000')
  const [entryDuration, setEntryDuration] = useState('6')
  const [voteDuration, setVoteDuration] = useState('6')
  const [selectedToken, setSelectedToken] = useState('EMBER')

  // Check allowance
  const { data: allowance } = useReadContract({
    address: contracts.ember,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, contracts.arena] : undefined,
  })

  // Check EMBER balance
  const { data: emberBalance } = useReadContract({
    address: contracts.ember,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const needsApproval = !allowance || allowance < MARKET_FEE
  const isPayingWithEmber = selectedToken === 'EMBER'

  // Approve
  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  // Create market
  const { writeContract: createMarket, data: createHash, isPending: isCreating } = useWriteContract()
  const { isLoading: isCreateConfirming, isSuccess: isCreateSuccess } = useWaitForTransactionReceipt({
    hash: createHash,
  })

  const handleApprove = () => {
    approve({
      address: contracts.ember,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contracts.arena, MARKET_FEE],
    })
  }

  const handleCreate = () => {
    createMarket({
      address: contracts.arena,
      abi: ARENA_ABI,
      functionName: 'createMarket',
      args: [
        title,
        rules,
        parseEther(entryCost),
        BigInt(Number(entryDuration) * 3600),
        BigInt(Number(voteDuration) * 3600),
      ],
    })
  }

  if (isCreateSuccess) {
    return (
      <main className="min-h-screen bg-gray-950 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center pt-20">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-3xl font-bold text-white mb-4">Market Created!</h1>
          <p className="text-gray-400 mb-6">Your voting market is now live.</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/"
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Calculate swap amounts for non-EMBER tokens
  const getSwapBreakdown = () => {
    if (isPayingWithEmber) return null
    
    // Placeholder rates - would come from DEX/oracle
    const rates: Record<string, number> = {
      'USDC': 100, // $100 = 100,000 EMBER
      'ETH': 0.04, // ~0.04 ETH = 100,000 EMBER
      'USDT': 100,
    }
    
    const amount = rates[selectedToken] || 100
    return {
      pay: amount,
      receive: '100,000',
      symbol: selectedToken,
    }
  }

  const swapBreakdown = getSwapBreakdown()

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">The Arena</Link>
          <ConnectButton />
        </div>
      </nav>

      <div className="max-w-2xl mx-auto pt-28 pb-20 px-4">
        <h1 className="text-3xl font-bold text-white mb-2">Create Voting Market</h1>
        <p className="text-gray-400 mb-8">Start a community vote on any topic</p>

        {!isConnected ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <p className="text-gray-400 mb-4">Connect your wallet to create a market</p>
            <ConnectButton />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Title */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Market Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Best Meme of the Week"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Rules */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Entry Rules
              </label>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="e.g., Only original memes allowed. No reposts, NSFW, or off-topic content."
                rows={3}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                AI will filter entries based on these rules
              </p>
            </div>

            {/* Entry Cost */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Entry Cost ($EMBER)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Amount users pay to submit an entry. Goes into the prize pot.
              </p>
              <input
                type="number"
                value={entryCost}
                onChange={(e) => setEntryCost(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Durations */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Entry Phase (hours)
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Window for submitting entries
                  </p>
                  <input
                    type="number"
                    value={entryDuration}
                    onChange={(e) => setEntryDuration(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Voting Phase (hours)
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Window for casting votes
                  </p>
                  <input
                    type="number"
                    value={voteDuration}
                    onChange={(e) => setVoteDuration(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Payment Section */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Market Creation Fee</h3>
              
              {/* Token Selector */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Pay with</label>
                <div className="grid grid-cols-4 gap-2">
                  {TOKENS.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => setSelectedToken(token.symbol)}
                      className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                        selectedToken === token.symbol
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {token.symbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost Display */}
              <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
                {isPayingWithEmber ? (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Creation Fee:</span>
                    <div className="text-right">
                      <span className="text-white font-semibold">100,000 $EMBER</span>
                      <span className="text-gray-500 text-sm ml-2">(≈ ${MARKET_FEE_USD})</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">You pay:</span>
                      <span className="text-white font-semibold">
                        {swapBreakdown?.pay} {swapBreakdown?.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Swaps to:</span>
                      <span className="text-gray-400">{swapBreakdown?.receive} $EMBER</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Then burned:</span>
                      <span className="text-blue-400">100,000 $EMBER 🔥</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Balance */}
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Your $EMBER Balance:</span>
                <span className="text-white">{emberBalance ? formatWithCommas(formatEther(emberBalance)) : '0'}</span>
              </div>

              {/* Don't have EMBER note */}
              {isPayingWithEmber && (
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-blue-400 text-sm">
                    💡 Don&apos;t have $EMBER? Select another token above to pay with any token on Base.
                  </p>
                </div>
              )}

              {/* Burn note */}
              <p className="text-xs text-gray-500 mt-3 text-center">
                100,000 $EMBER is burned when creating a market
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              {isPayingWithEmber ? (
                // EMBER flow - approve then create
                needsApproval && !isApproveSuccess ? (
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || isApproveConfirming}
                    className="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                  >
                    {isApproving || isApproveConfirming ? 'Approving...' : 'Approve $EMBER'}
                  </button>
                ) : (
                  <button
                    onClick={handleCreate}
                    disabled={isCreating || isCreateConfirming || !title || !rules}
                    className="flex-1 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                  >
                    {isCreating || isCreateConfirming ? 'Creating...' : 'Create Market'}
                  </button>
                )
              ) : (
                // Other token flow - swap and create
                <button
                  disabled={!title || !rules}
                  className="flex-1 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  Swap & Create Market
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
