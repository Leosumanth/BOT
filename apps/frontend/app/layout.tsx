import type { JSX, ReactNode } from "react";
import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import "./globals.css";

const fontSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans"
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "MintBot Nexus",
  description: "Production-grade NFT mint tracker and execution dashboard"
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontMono.variable} bg-background text-foreground antialiased`}>
        <AppProviders>
          <WorkspaceShell>{children}</WorkspaceShell>
        </AppProviders>
      </body>
    </html>
  );
}
