import { db } from "@/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Settings as SettingsIcon, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:px-10">
      <Button variant="ghost" size="sm" asChild className="mb-4 gap-1 px-2 text-muted-foreground">
        <Link href={`/projects/${id}`}><ArrowLeft className="h-3.5 w-3.5" /> {project.name}</Link>
      </Button>

      <div className="mb-6">
        <Badge variant="secondary" className="mb-2 gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          <SettingsIcon className="h-3 w-3" /> Settings
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">Project Settings</h1>
      </div>
      <Separator className="mb-6" />

      <div className="space-y-5">
        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">General</CardTitle>
            <CardDescription>Basic project information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <label className="text-xs font-medium">Name</label>
              <Input defaultValue={project.name} />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium">Root path</label>
              <Input defaultValue={project.rootPath} readOnly className="font-mono text-xs" />
            </div>
            <div className="flex justify-end">
              <Button size="sm">Save changes</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <Trash2 className="h-4 w-4" /> Danger zone
            </CardTitle>
            <CardDescription>Unregister this project from the dashboard. Local files are not deleted.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm">Unregister project</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
