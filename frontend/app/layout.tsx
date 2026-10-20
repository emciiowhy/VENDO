import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { OG_IMAGE, LOGO_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative canonical / Open Graph / Twitter URLs against the public
  // origin (see SITE_URL — never localhost in a production build).
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  // Search Console ownership proof: paste the content value of Google's
  // "HTML tag" verification method into NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  title: "VendoPOS — One platform to run your whole business | POS + ERP for the Philippines",
  description:
    "VendoPOS is one multi-tenant POS + ERP built for Filipino businesses. BIR-ready receipts, GCash/Maya/QRPH payments, Senior/PWD discounts, peso-first. Request a demo.",
  alternates: { canonical: "/" },
  icons: {
    icon: LOGO_IMAGE,
    apple: LOGO_IMAGE,
  },
  openGraph: {
    title: "VendoPOS — POS + ERP built for the Philippines",
    description:
      "Run sales, stock, customers, finances, and staff in one system. BIR-ready, GCash/Maya/QRPH, Senior/PWD discounts, peso-first.",
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "VendoPOS — POS + ERP built for the Philippines",
    description:
      "Run sales, stock, customers, finances, and staff in one system. BIR-ready, GCash/Maya/QRPH, Senior/PWD discounts, peso-first.",
    images: [OG_IMAGE.url],
  },
};

/**
 * schema.org JSON-LD: tells Google the site's name (shown instead of the bare
 * domain in results), its logo, and that VendoPOS is a business application.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}${LOGO_IMAGE}`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-PH",
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Multi-tenant POS + ERP for Filipino businesses: BIR-ready receipts, GCash/Maya/QRPH payments, inventory, finance, and staff in one system.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} antialiased`}>
      <body className="bg-white text-ink">
        <script
          type="application/ld+json"
          // Static, first-party JSON; `<` is escaped so it can't close the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
