import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mortgage IQ - powered by the 4 Microsoft IQs",
  description:
    "Agentic mortgage underwriting on Azure Container Apps + Azure AI Foundry, showcasing Work IQ, Fabric IQ, Foundry IQ and Web IQ.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
