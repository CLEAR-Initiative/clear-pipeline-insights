import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/better-auth";

export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(auth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(auth()).POST(request);
}
