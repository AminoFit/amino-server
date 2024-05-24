// src/app/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  console.log("Received OAuth request");
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  const supabase = createRouteHandlerClient({ cookies });

  if (provider === "google") {
    console.log("Received Google OAuth request");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data, { status: 200 });
  }

  return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ message: "Logged in successfully" }, { status: 200 });
}
