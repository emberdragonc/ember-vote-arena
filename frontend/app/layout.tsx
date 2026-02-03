import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'The Arena | Community Voting Markets',
  description: 'Create voting contests on any topic. Vote with any token on Base. Winners take the pot.',
  openGraph: {
    title: 'The Arena',
    description: 'Community voting markets on Base',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Arena',
    description: 'Community voting markets on Base',
    creator: '@emberclawd',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-900 text-white`}>
        <Providers>
          {children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
