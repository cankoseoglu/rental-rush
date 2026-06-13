import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import Analytics from "@/components/Analytics";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://playrentalrush.com"),
  title: "Rental Rush: Operator Mode",
  description:
    "Claim neighbourhoods, lease buildings and run them as STR, MTR, LTR or Hotel Mode. Survive a tightening market, squeeze two AI rivals with stay fees and auctions, and be the last solvent operator standing.",
  openGraph: {
    title: "Rental Rush: Operator Mode",
    description: "Outlast two AI rivals and be the last solvent operator standing. Can you?",
    type: "website",
    url: "https://playrentalrush.com",
    siteName: "Rental Rush",
  },
};

export const viewport: Viewport = {
  themeColor: "#060A13",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      className={`${bricolage.variable} ${instrument.variable} ${splineMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
