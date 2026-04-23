"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./ThemeProvider"
import { PostHogProvider } from "./PostHogProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <PostHogProvider>{children}</PostHogProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
