import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Database, User, Shield } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            <SettingsIcon className="h-3 w-3" /> Settings
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">System Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Global configuration for the OpenSpec dashboard.</p>
      </div>

      <Separator className="mb-6" />

      <div className="space-y-5">
        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-blue-500" /> Database
            </CardTitle>
            <CardDescription>Connection info and sync status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <label className="text-xs font-medium">Connection URL</label>
              <Input readOnly value="postgresql://postgres:postgres@127.0.0.1:5432/app_db" />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connected and healthy.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-violet-500" /> Workspace
            </CardTitle>
            <CardDescription>Local workspace settings (single-user mode).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <label className="text-xs font-medium">Display name</label>
              <Input defaultValue="Local Workspace" />
            </div>
            <div className="flex justify-end">
              <Button size="sm">Save changes</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-amber-500" /> Multi-user auth
            </CardTitle>
            <CardDescription>RBAC, teams, and Better-Auth integration.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-md border border-dashed border-border/80 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              <span>Multi-user authentication ships in Phase 3a.</span>
              <Badge variant="slate">Coming soon</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
