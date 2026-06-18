"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  GitBranchPlus,
  BookOpen,
  Blocks,
  Workflow,
  Settings,
  Search,
  Command,
} from "lucide-react";

const navItems = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Projects", href: "/projects", icon: FolderKanban },
    ],
  },
  {
    title: "OpenSpec",
    items: [
      { label: "Changes", href: "/changes", icon: GitBranchPlus },
      { label: "Specs", href: "/specs", icon: BookOpen },
      { label: "Schemas", href: "/schemas", icon: Blocks },
      { label: "Kanban", href: "/kanban", icon: Workflow },
    ],
  },
  {
    title: "System",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border/60 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GitBranchPlus className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">OpenSpec</span>
          <span className="text-[10px] font-medium text-muted-foreground">Management Server</span>
        </div>
      </div>

      {/* Search mock */}
      <div className="p-3">
        <button className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent">
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="pointer-events-none flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {navItems.map((section) => (
          <div key={section.title} className="mb-5">
            <h4 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h4>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/60 p-3">
        <div className="flex items-center gap-2 rounded-md border bg-background/60 p-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] font-bold text-white">
            OS
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium">Local Workspace</span>
            <span className="truncate text-[10px] text-muted-foreground">v0.1.0 · Phase 0</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
