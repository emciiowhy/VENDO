import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/theme/ThemeProvider";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VendoPOS — One platform to run your whole business | POS + ERP for the Philippines",
  description:
    "VendoPOS is one multi-tenant POS + ERP built for Filipino businesses. BIR-ready receipts, GCash/Maya/QRPH payments, offline-capable, peso-first. Request a demo.",
  icons: {
    icon: "/vendo-logo.png",
    apple: "/vendo-logo.png",
  },
  openGraph: {
    title: "VendoPOS — POS + ERP built for the Philippines",
    description:
      "Run sales, stock, suppliers, finances, and staff in one system. BIR-ready, GCash/Maya/QRPH, offline-capable, peso-first.",
    type: "website",
    images: ["/vendo-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} antialiased`}>
      <body className="bg-white text-ink">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
