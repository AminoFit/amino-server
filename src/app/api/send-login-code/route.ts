import { prisma } from "@/database/prisma";
import { SendMessageToUser } from "@/twilio/SendMessageToUser";
import { openai } from "@/utils/openai";
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
    return NextResponse.json(
      { error: "User does not have an account." },
      { status: 400 }
    );
  }

  const smsCode = await prisma.smsAuthCode.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
    },
  });

  await SendMessageToUser(user, `Your Amino SMS Code is ${smsCode.id}`);

  return NextResponse.json({ message: "Success" });
}
