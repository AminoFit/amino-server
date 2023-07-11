import { NextRequest, NextResponse } from 'next/server';
import GetMessagesForUser from '../../../../database/GetMessagesForUser';
import { Message } from "@prisma/client";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  try {
    let messages: Message[] = []; // replace 'YourMessageType' with the actual type of your messages
    console.log('userId', userId);
    if (userId) {
      messages = await GetMessagesForUser(userId);
      console.log('messages', messages);
    }
    return new Response(JSON.stringify(messages), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: 'Unable to fetch messages' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
