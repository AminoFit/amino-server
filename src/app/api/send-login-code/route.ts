import { prisma } from "@/database/prisma";
import { SendMessageToUser } from "@/twilio/SendMessageToUser";
import { openai } from "@/utils/openai";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import path from "path";
import vCardsJs from "vcards-js";

export async function GET(request: Request) {
  console.log("got a GET request");
  console.log("Sending SMS Code");

  const { searchParams } = new URL(request.url);

  const userPhone = searchParams.get("user_phone");
  console.log("userPhone", userPhone);

  if (!userPhone) {
    console.error("user_phone missing");
    return NextResponse.json(
      { error: "Missing 'user_phone' arg" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      phone: userPhone,
    },
  });

  if (!user) {
    console.error("user missing");
    return NextResponse.json(
      { error: "User does not have an account" },
      { status: 400 }
    );
  }

  const newCode = randomUUID()
    .replaceAll("-", "")
    .substring(0, 12)
    .toUpperCase();

  const smsCode = await prisma.smsAuthCode.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
      code: newCode,
    },
  });

  let rootDomain = "http://localhost:3000";
  if (process.env.VERCEL_URL) {
    rootDomain = `https://${process.env.VERCEL_URL}`;
  }

  await SendMessageToUser(
    user,
    `Your Amino SMS Code is ${rootDomain}/login-code?code=${smsCode.code}`
  );

  console.log("Success sending SMS Code");
  return NextResponse.json({ message: "Success" });
}
