import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { SnackbarProvider } from "@/components/ui/snackbar";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Mind the App — AI Resume Generator",
  description:
    "Generate tailored, editorial-quality resumes for every job application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <SnackbarProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
