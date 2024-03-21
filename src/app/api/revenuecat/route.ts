// src/app/api/revenuecat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase/serverAdmin';
import { RevenueCatWebhookEvent } from './webhookInterface';
import { getSubscriptionFromRevenueCat } from '@/subscription/getUserInfoFromRevenueCat';

const REVENUECAT_WEBHOOK_AUTH_HEADER = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
const DEBUG = true; // Set to false to disable sandbox events and less verbose output

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || authHeader !== `Bearer ${REVENUECAT_WEBHOOK_AUTH_HEADER}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const webhook: RevenueCatWebhookEvent = await request.json();

  if (!webhook.event || !webhook.event.app_user_id) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const appUserId = webhook.event.app_user_id;

  if (DEBUG) {
    console.log('Received webhook event:', webhook);
  }

  if (!DEBUG && webhook.event.environment === 'SANDBOX') {
    console.log('Skipping sandbox event in production');
    return NextResponse.json({ success: true });
  }

  try {
    const supabase = createAdminSupabase();

    const customerInfo = await getSubscriptionFromRevenueCat(appUserId);
    const latestSubscription = Object.values(customerInfo.subscriber.subscriptions).sort(
      (a, b) => (b?.expires_date ? new Date(b.expires_date).getTime() : 0) - (a?.expires_date ? new Date(a.expires_date).getTime() : 0)
    )[0];

    let subscriptionExpiryDate: string | null = null;
    let subscriptionType: string | null = null;

    if (latestSubscription) {
      subscriptionExpiryDate = latestSubscription.expires_date;
      subscriptionType = Object.keys(customerInfo.subscriber.entitlements)[0];
    }

    if (DEBUG) {
      console.log('Latest subscription:', latestSubscription);
      console.log('Subscription expiry date:', subscriptionExpiryDate);
      console.log('Subscription type:', subscriptionType);
    }

    const { error } = await supabase
      .from('User')
      .update({
        subscriptionExpiryDate,
        subscriptionType,
      })
      .eq('id', appUserId);

    if (error) {
      console.error('Error updating user subscription:', error);
      return NextResponse.json({ error: 'Failed to update user subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}