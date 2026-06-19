/**
 * Route-handler invocation helpers — call Next.js App Router route handlers
 * in-process with a real Request object.
 */
import type { NextRequest } from "next/server";

/**
 * Invoke a GET route handler in-process.
 * @param handler The exported GET function from a route.ts file
 * @param pathname The URL pathname (e.g. "/api/health")
 * @returns The Response from the handler
 */
export async function callGet(
  handler: (req: NextRequest) => Promise<Response> | Response,
  pathname: string,
): Promise<Response> {
  const url = `http://localhost:3000${pathname}`;
  const req = new Request(url, { method: "GET" }) as NextRequest;
  return handler(req);
}

/**
 * Invoke a POST route handler in-process with a JSON body.
 */
export async function callPost(
  handler: (req: NextRequest) => Promise<Response> | Response,
  pathname: string,
  body: unknown,
): Promise<Response> {
  const url = `http://localhost:3000${pathname}`;
  const req = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
  return handler(req);
}
