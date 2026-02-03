'use client'

import { useState } from 'react'
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatEther, parseEther } from 'viem'
import Link from 'next/link'
import { CONTRACTS, ARENA_ABI, ERC20_ABI } from '../config/contracts'
import { isAdmin } from '../config/admins'
import { baseSepolia } from 'wagmi/chains'

function formatWithCommas(value: string): string {
  const parts = value.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS] || CONTRACTS[baseSepolia.id]
  const userIsAdmin = isAdmin(address)

  // Get token balance
  const { data: balance } = useReadContract({
    address: contracts.ember,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  // Get market count
  const { data: marketCount } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'marketCount',
  })

  if (!isConnected) {
    return (
      <main className="min-h-screen bg-gray-950">
        <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-white">The Arena</Link>
            <ConnectButton />
          </div>
        </nav>
        
        <div className="pt-32 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="text-6xl mb-6">👤</div>
            <h1 className="text-3xl font-bold text-white mb-4">Your Profile</h1>
            <p className="text-gray-400 mb-8">Connect your wallet to view your stats and claim winnings</p>
            <ConnectButton />
          </div>
        </div>
      </main>
    )
  }

  const formattedBalance = balance ? formatWithCommas(formatEther(balance)) : '0'

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">The Arena</Link>
          <div className="flex items-center gap-4">
            <Link href="/create" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              Create
            </Link>
            <ConnectButton />
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold text-white">Your Profile</h1>
              {userIsAdmin && (
                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full text-xs font-medium">
                  Admin
                </span>
              )}
            </div>
            <p className="text-gray-400">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>

          {/* Admin Dashboard */}
          {userIsAdmin && (
            <div className="mb-12">
              <AdminDashboard contracts={contracts} marketCount={Number(marketCount || 0)} />
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="text-gray-400 text-sm mb-2">Token Balance</div>
              <div className="text-2xl font-bold text-white">{formattedBalance}</div>
              <div className="text-gray-500 text-xs mt-1">$EMBER</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="text-gray-400 text-sm mb-2">Markets Entered</div>
              <div className="text-2xl font-bold text-white">-</div>
              <div className="text-gray-500 text-xs mt-1">Coming soon</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="text-gray-400 text-sm mb-2">Total Winnings</div>
              <div className="text-2xl font-bold text-blue-500">-</div>
              <div className="text-gray-500 text-xs mt-1">Coming soon</div>
            </div>
          </div>

          {/* Claimable Winnings */}
          <div className="bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 rounded-2xl p-8 mb-12">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Claimable Winnings</h2>
                <p className="text-gray-400 text-sm">
                  Winnings are automatically distributed when markets resolve.
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-500">$0</div>
                <div className="text-gray-500 text-sm">Available</div>
              </div>
            </div>
          </div>

          {/* Your Entries */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Your Activity</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-white mb-2">No activity yet</h3>
              <p className="text-gray-500 mb-6">Start by joining a vote or creating your own market</p>
              <div className="flex items-center justify-center gap-4">
                <Link 
                  href="/#active"
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
                >
                  Browse Votes
                </Link>
                <Link 
                  href="/create"
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
                >
                  Create Market
                </Link>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-3">How winnings work</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-blue-500">•</span>
                <span>When a market ends, anyone can trigger the resolution</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500">•</span>
                <span>Top 3 entries split the pot: 55% / 20% / 10%</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500">•</span>
                <span>Winnings are sent directly to your wallet</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500">•</span>
                <span>10% goes to stakers, 5% to market creator</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}

function AdminDashboard({ contracts, marketCount }: { contracts: typeof CONTRACTS[84532]; marketCount: number }) {
  const [selectedMarket, setSelectedMarket] = useState('')
  const [boostAmount, setBoostAmount] = useState('')

  // For boosting, we'd need to add tokens to the market pot
  // This would require a contract function or direct transfer

  return (
    <div className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">⚡</span>
        <h2 className="text-xl font-bold text-white">Admin Dashboard</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Boost Market */}
        <div className="bg-gray-900/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Boost Market Rewards</h3>
          <p className="text-gray-400 text-sm mb-4">
            Add extra tokens to a market&apos;s prize pool to incentivize participation.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Market ID</label>
              <select
                value={selectedMarket}
                onChange={(e) => setSelectedMarket(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Select a market...</option>
                {Array.from({ length: marketCount }, (_, i) => (
                  <option key={i} value={i}>Market #{i}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Boost Amount ($EMBER)</label>
              <input
                type="number"
                value={boostAmount}
                onChange={(e) => setBoostAmount(e.target.value)}
                placeholder="10,000"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>

            <button
              disabled={!selectedMarket || !boostAmount}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 text-white rounded-xl font-semibold transition-colors"
            >
              Boost Market
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-gray-900/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Platform Stats</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Total Markets</span>
              <span className="text-white font-medium">{marketCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Active Markets</span>
              <span className="text-white font-medium">-</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Total Volume</span>
              <span className="text-white font-medium">$0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">$EMBER Burned</span>
              <span className="text-white font-medium">0</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-800">
            <Link
              href="/create"
              className="block w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium text-center transition-colors"
            >
              Create New Market
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
