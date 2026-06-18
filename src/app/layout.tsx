import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "OpenSpec Dashboard",
  description: "Management server and Kanban UI for OpenSpec spec-driven development.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider defaultTheme="dark">
          <div className="flex min-h-screen">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Top bar */}
              <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-6 backdrop-blur-sm">
                <div className="ml-auto flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">New Change</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
                    <Bell className="h-4 w-4" />
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                  </Button>
                  <ThemeToggle />
                </div>
              </header>
              <main className="flex-1 overflow-x-hidden">{children}</main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
