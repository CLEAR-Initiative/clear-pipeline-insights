import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { TopNav } from "@/components/top-nav";
import { auth } from "@/lib/better-auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pipeline Insights",
  description: "LLM call cost & volume for the CLEAR pipeline",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let username: string | null = null;
  try {
    const session = await auth().api.getSession({ headers: await headers() });
    username =
      (session?.user as { username?: string | null } | undefined)?.username ??
      null;
  } catch {
    // Auth not configured (e.g. DATABASE_URL or BETTER_AUTH_SECRET missing
    // during build). Render without a user indicator; the proxy will redirect
    // at request time.
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopNav username={username} />
        {children}
      </body>
    </html>
  );
}
