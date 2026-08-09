import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniMonitor — Mission Control & Fleet Fault Monitor",
  description:
    "Real-time monitoring, fault-detection, and re-planning layer for drone light shows with human-in-the-loop controller interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen flex flex-col bg-[#060911] text-slate-100 selection:bg-amber-500/20 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
