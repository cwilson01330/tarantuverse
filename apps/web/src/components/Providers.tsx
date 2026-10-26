"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./ThemeProvider"
import { PostHogProvider } from "./PostHogProvider"
import { UnitsProvider } from "./UnitsProvider"
import SessionTokenSync from "./SessionTokenSync"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionTokenSync />
      <UnitsProvider>
        <ThemeProvider>
          <PostHogProvider>{children}</PostHogProvider>
        </ThemeProvider>
      </UnitsProvider>
    </SessionProvider>
  )
}
