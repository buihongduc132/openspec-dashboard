/**
 * Route-handler invocation helpers — call Next.js App Router route handlers
 * in-process with a real NextRequest object.
 */
import { NextRequest } from "next/server";

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
  const req = new NextRequest(url, { method: "GET" });
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
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handler(req);
}

/**
 * Invoke a POST route handler in-process with a JSON body and route params
 * (for nested resource handlers like `/api/.../[id]/sub`).
 */
export async function callPostWithParams<P extends Record<string, string>>(
  handler: (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response> | Response,
  pathname: string,
  params: P,
  body: unknown,
): Promise<Response> {
  const url = `http://localhost:3000${pathname}`;
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handler(req, { params: Promise.resolve(params) });
}

/**
 * Invoke a PATCH route handler in-process with a JSON body and route params.
 */
export async function callPatch<P extends Record<string, string>>(
  handler: (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response> | Response,
  pathname: string,
  params: P,
  body: unknown,
): Promise<Response> {
  const url = `http://localhost:3000${pathname}`;
  const req = new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handler(req, { params: Promise.resolve(params) });
}

/**
 * Invoke a DELETE route handler in-process with route params.
 */
export async function callDelete<P extends Record<string, string>>(
  handler: (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response> | Response,
  pathname: string,
  params: P,
): Promise<Response> {
  const url = `http://localhost:3000${pathname}`;
  const req = new NextRequest(url, { method: "DELETE" });
  return handler(req, { params: Promise.resolve(params) });
}
