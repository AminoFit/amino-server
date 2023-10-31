import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import moment from "moment-timezone"
import { Tables } from "types/supabase"

export async function HandleUpdateUserInfo(
  user: Tables<"User">,
  parameters: { users_name?: string; user_date_of_birth?: string; users_weight?: number }
) {
  console.log("HandleUpdateUserInfo")
  console.log("parameters", parameters)

  const supabase = createAdminSupabase()

  const updates = []
  // Chris TODO
  // if (parameters.users_name) {
  //   console.log("updating user name to", parameters.users_name)

  //   await supabase.from("User").update({ firstName: parameters.users_name }).eq("id", user.id)
  //   updates.push(`I updated your name, ${parameters.users_name}.`)
  // }

  if (parameters.user_date_of_birth) {
    console.log("updating user DOB to", parameters.user_date_of_birth)
    const dob = new Date(parameters.user_date_of_birth)
    console.log("dob", dob)
    await supabase.from("User").update({ dateOfBirth: dob.toDateString() }).eq("id", user.id)

    updates.push(`Your date of birth has been updated, ${moment(dob).format("MMMM Do YYYY")}.`)
  }
  if (parameters.users_weight) {
    // Convert the provided weight from pounds to kilograms
    const weightInKg = parameters.users_weight * 0.453592

    console.log("updating user weight to", weightInKg)
    await supabase.from("User").update({ weightKg: weightInKg }).eq("id", user.id)

    updates.push(
      `Your weight has been updated to: ${parameters.users_weight}lbs (approximately ${weightInKg.toFixed(2)}kg).`
    )
  }
  if (updates.length === 0) {
    return "Sorry, I couldn't update your info, please try again."
  }
  return updates.join("\n\n")
}
