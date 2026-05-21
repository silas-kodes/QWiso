import { NextRequest, NextResponse } from "next/server";
import { login, logout, isAuthenticated } from "@/lib/auth";

export async function GET() {
  const auth = await isAuthenticated();
  return NextResponse.json({ authenticated: auth });
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const success = await login(password);
  if (success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, error: "Invalid password" }, { status: 401 });
}

export async function DELETE() {
  await logout();
  return NextResponse.json({ success: true });
}
