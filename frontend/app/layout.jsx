import "./globals.css";

export const metadata = {
  title: "FXRP Sentinel — risk-priced cover for Flare FAssets",
  description:
    "Confidential-compute risk scoring and automatic payout insurance for FAssets agents on Flare.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-body">{children}</body>
    </html>
  );
}
