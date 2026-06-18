import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const [updated] = await db
    .update(tasks)
    .set({
      status: body.status,
      title: body.title,
      assignee: body.assignee,
      priority: body.priority,
      checked: body.checked,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();
  return NextResponse.json(updated);
}
