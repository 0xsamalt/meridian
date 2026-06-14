'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectKitButton } from 'connectkit'
import { motion, AnimatePresence } from 'framer-motion'
import { IconMenu2, IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { MeridianLogo } from '@/components/meridianlogo'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/deposit',   label: 'Deposit'   },
  { href: '/decisions', label: 'Decisions' },
]

export function Header() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-meridian-border bg-meridian-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-3">

          {/* Logo → home */}
          <Link href="/" className="flex items-center opacity-90 transition-opacity hover:opacity-100">
            <MeridianLogo />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-0 sm:flex">
            {NAV.map(({ href, label }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'relative px-4 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors',
                    isActive
                      ? 'text-meridian-text-primary'
                      : 'text-meridian-text-tertiary hover:text-meridian-text-secondary',
                  )}
                >
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0 left-4 right-4 h-px bg-meridian-blue" />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Right — wallet + hamburger */}
          <div className="flex items-center gap-2">
            <ConnectKitButton />
            <button
              onClick={() => setMobileOpen(true)}
              className="ml-1 -mr-1 p-1.5 text-meridian-text-secondary transition-colors hover:text-meridian-text-primary sm:hidden"
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
            >
              <IconMenu2 className="h-5 w-5" stroke={1.5} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-nav"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[60] flex flex-col bg-meridian-bg sm:hidden"
          >
            {/* Overlay header */}
            <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-meridian-border px-6">
              <Link href="/" onClick={() => setMobileOpen(false)}>
                <MeridianLogo />
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-meridian-text-secondary transition-colors hover:text-meridian-text-primary"
                aria-label="Close navigation menu"
              >
                <IconX className="h-5 w-5" stroke={1.5} />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex flex-col px-6 pt-2">
              {NAV.map(({ href, label }, i) => {
                const isActive = pathname === href || pathname.startsWith(href + '/')
                return (
                  <motion.div
                    key={href}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.06 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center justify-between border-b border-meridian-border py-5 font-mono text-[13px] uppercase tracking-widest transition-colors',
                        isActive
                          ? 'text-meridian-text-primary'
                          : 'text-meridian-text-tertiary hover:text-meridian-text-secondary',
                      )}
                    >
                      {label}
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-meridian-blue" />
                      )}
                    </Link>
                  </motion.div>
                )
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
