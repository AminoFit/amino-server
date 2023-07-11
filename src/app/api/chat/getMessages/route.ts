import { NextRequest, NextResponse } from 'next/server';
import GetMessagesForUser from '../../../../database/GetMessagesForUser';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  try {
    let messages = [];
    console.log('userId', userId);
    if (userId) {
      messages = await GetMessagesForUser({ id: userId });
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
