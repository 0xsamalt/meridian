import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import { Header } from '@/components/Header'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Meridian — AI Yield Optimizer',
  description: 'AI-powered mETH yield optimizer on Mantle. Every rebalance decision is transparent and verifiable on-chain.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-[1200px] px-6 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
