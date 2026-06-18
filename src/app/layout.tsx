import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenSpec Manager",
  description: "Manage OpenSpec projects, specs, changes, and tasks with a Kanban board.",
};

const navItems = [
  { label: "Dashboard", href: "/", icon: "📊" },
  { label: "Projects", href: "/projects", icon: "📁" },
  { label: "Kanban Board", href: "/kanban", icon: "📋" },
  { label: "Schemas", href: "/schemas", icon: "🧩" },
  { label: "Workspaces", href: "/workspaces", icon: "🔗" },
  { label: "Context Stores", href: "/context-stores", icon: "🏪" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
            <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
              <span className="text-2xl">📐</span>
              <div>
                <h1 className="text-base font-bold leading-tight text-slate-900">OpenSpec</h1>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Manager</p>
              </div>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-400">OpenSpec Management v1.0</p>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
