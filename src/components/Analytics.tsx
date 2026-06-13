"use client";

import Script from "next/script";

// Google Analytics 4 via the official gtag.js snippet.
//
// The measurement ID is read from NEXT_PUBLIC_GA_ID, so this open-source repo
// carries no tracking ID of its own — set the var in the deploy environment
// (e.g. Vercel) to switch analytics on. When it's absent (local dev, forks,
// CI), this renders nothing and loads no scripts, so no data is ever sent.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function Analytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
