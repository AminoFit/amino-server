import { NextRequest, NextResponse } from 'next/server';
import GetMessagesForUser from '../../../../database/GetMessagesForUser';
import { Message } from "@prisma/client";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  try {
    let messages: Message[] = [];
    console.log('userId', userId);
    if (userId) {
      messages = await GetMessagesForUser(userId);
    }
    return new Response(JSON.stringify(messages), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(error);
    const err = error as Error;
    return new Response(
      JSON.stringify({ error: err.message || 'Unable to fetch messages' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
