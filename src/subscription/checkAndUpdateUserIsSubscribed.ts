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

  const currentDate = new Date();
  const subscriptionExpiryDate = user.subscriptionExpiryDate ? new Date(user.subscriptionExpiryDate) : null;

  if (subscriptionExpiryDate && subscriptionExpiryDate >= currentDate) {
    // Subscription is active
    return true;
  } else if (subscriptionExpiryDate && subscriptionExpiryDate < currentDate) {
    // Subscription is expired, try to update from RevenueCat
    try {
      await getAndUpdateRevenueCatForUser(userId);
      // Check if the subscription is updated and still valid
      const { data: updatedUser } = await supabaseAdmin
        .from("User")
        .select("subscriptionExpiryDate")
        .eq("id", userId)
        .single();
    
      if (updatedUser && updatedUser.subscriptionExpiryDate) {
        const updatedExpiryDate = new Date(updatedUser.subscriptionExpiryDate);
        return updatedExpiryDate >= currentDate;
      } else {
        return false; // Subscription not updated or expiry date is null
      }
    } catch (error) {
      console.error("Error updating user subscription from RevenueCat:", error);
      return false;
    }
  } else {
    // SubscriptionExpiryDate is null, offer a free trial
    const freeTrialExpiryDate = new Date();
    freeTrialExpiryDate.setDate(currentDate.getDate() + 7);

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