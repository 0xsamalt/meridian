import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import { Header } from '@/components/Header'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Meridian — AI Yield Optimizer',
  description: 'AI-powered mETH yield optimizer on Mantle. Every rebalance decision is transparent and verifiable on-chain.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="min-h-screen bg-meridian-bg font-sans antialiased">
        <Providers>
          <Header />
          <main className="min-h-[calc(100svh-56px)]">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
