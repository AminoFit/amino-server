import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { getAndUpdateRevenueCatForUser } from "@/subscription/getUserInfoFromRevenueCat"

export async function checkAndUpdateUserIsSubscribed(userId: string): Promise<boolean> {
  const supabaseAdmin = createAdminSupabase();

  const { data: user, error } = await supabaseAdmin
    .from("User")
    .select("subscriptionExpiryDate, subscriptionType")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error retrieving user subscription information:", error);
    return false;
  }

  // Use UTC for current date
  const currentDateUTC = new Date();
  const subscriptionExpiryDate = user.subscriptionExpiryDate ? new Date(Date.parse(user.subscriptionExpiryDate+'Z')) : null;

  if (subscriptionExpiryDate && subscriptionExpiryDate.getTime() >= currentDateUTC.getTime()) {
    return true;
  } else if (subscriptionExpiryDate && subscriptionExpiryDate.getTime() < currentDateUTC.getTime()) {
    // Subscription is expired, try to update from RevenueCat
    console.log("Subscription is expired, trying to update from RevenueCat")
    try {
      await getAndUpdateRevenueCatForUser(userId);
      // Check if the subscription is updated and still valid
      const { data: updatedUser } = await supabaseAdmin
        .from("User")
        .select("subscriptionExpiryDate")
        .eq("id", userId)
        .single();
    
      if (updatedUser && updatedUser.subscriptionExpiryDate) {
        const updatedExpiryDate = new Date(updatedUser.subscriptionExpiryDate + 'Z')
        console.log("Updated expiry date:", updatedExpiryDate)
        return updatedExpiryDate.getTime() >= currentDateUTC.getTime();
      } else {
        console.log("No updated subscription expiry date")
        return false; // Subscription not updated or expiry date is null
      }
    } catch (error) {
      console.error("Error updating user subscription from RevenueCat:", error);
      return false;
    }
  } else {
    // SubscriptionExpiryDate is null, offer a free trial
    const freeTrialExpiryDate = new Date();
    freeTrialExpiryDate.setDate(currentDateUTC.getDate() + 28);

    const { error: updateError } = await supabaseAdmin
      .from("User")
      .update({
        subscriptionExpiryDate: freeTrialExpiryDate.toISOString(),
        subscriptionType: "FREE_TRIAL",
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating user with free trial:", updateError);
      return false;
    }

    // Free trial updated, return true
    return true;
  }
}

async function testGetSubscriptionFromRevenueCat() {
  const userId = "6b005b82-88a5-457b-a1aa-60ecb1e90e21"
  const result = await checkAndUpdateUserIsSubscribed(userId)
  console.log('result', result)
}

// testGetSubscriptionFromRevenueCat()
