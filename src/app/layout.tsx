import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import HandwritingSplash from "@/components/HandwritingSplash";

const geist = localFont({
  src: [
    {
      path: "../../public/fonts/geist-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "DocSpace",
  description: "Self-hosted portable local chat server",
  icons: {
    icon: [
      { url: '/docdril.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/docdril.svg',
    apple: '/docdril.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" type="image/svg+xml" href="/docdril.svg" />
        <link rel="alternate icon" href="/docdril.svg" />
        <link rel="apple-touch-icon" href="/docdril.svg" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              *, html, body {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
              }
              ::-webkit-scrollbar,
              div::-webkit-scrollbar,
              main::-webkit-scrollbar,
              nav::-webkit-scrollbar,
              section::-webkit-scrollbar,
              aside::-webkit-scrollbar,
              textarea::-webkit-scrollbar,
              form::-webkit-scrollbar {
                display: none !important;
                width: 0px !important;
                height: 0px !important;
                background: transparent !important;
                -webkit-appearance: none !important;
              }
              ::-webkit-scrollbar-thumb,
              div::-webkit-scrollbar-thumb,
              main::-webkit-scrollbar-thumb,
              nav::-webkit-scrollbar-thumb {
                display: none !important;
                background: transparent !important;
              }
              ::-webkit-scrollbar-track,
              div::-webkit-scrollbar-track,
              main::-webkit-scrollbar-track,
              nav::-webkit-scrollbar-track {
                display: none !important;
                background: transparent !important;
              }
            `,
          }}
        />
      </head>
      <body className="h-full flex flex-col">
        <HandwritingSplash />
        <ThemeProvider>
          <AuthProvider>
            <WorkspaceProvider>
              {children}
            </WorkspaceProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
