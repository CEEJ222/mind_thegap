import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { SnackbarProvider } from "@/components/ui/snackbar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Mind the Gap — AI Resume Generator",
  description:
    "Generate tailored, editorial-quality resumes for every job application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <SnackbarProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
