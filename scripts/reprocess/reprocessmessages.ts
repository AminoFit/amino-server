import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { GenerateResponseForQuickLog } from "@/foodMessageProcessing/RespondToMessage"
import { checkAndUpdateUserIsSubscribed } from "@/subscription/checkAndUpdateUserIsSubscribed"

const supabaseAdmin = createAdminSupabase()

async function getAminoUserById(userId: string) {
  const { data, error } = await supabaseAdmin.from("User").select("*").eq("id", userId).single()

  if (error) {
    console.error("Error fetching amino user:", error)
    return null
  }

  return data
}

async function getMessagesByIds(messageIds: number[]) {
  const { data, error } = await supabaseAdmin.from("Message").select("*").in("id", messageIds)

  if (error) {
    console.error("Error fetching messages by IDs:", error)
    return []
  }

  return data
}

async function getRecentReceivedMessages() {
  const { data, error } = await supabaseAdmin
    .from("Message")
    .select("*")
    .eq("status", "RECEIVED")
    .order("createdAt", { ascending: false })
    .limit(10)

  if (error) {
    console.error("Error fetching recent received messages:", error)
    return []
  }

  return data
}

async function resendRecentReceivedMessages(messageIds?: number[]) {
  let messages

  if (messageIds && messageIds.length > 0) {
    messages = await getMessagesByIds(messageIds)
  } else {
    messages = await getRecentReceivedMessages()
  }

  if (!messages || messages.length === 0) {
    console.log("No received messages found.")
    return
  }

  for (const message of messages) {
    console.log(`Processing message with ID: ${message.id}`)

    const aminoUser = await getAminoUserById(message.userId)

    if (!aminoUser) {
      console.error(`No amino user found for message ID: ${message.id}`)
      continue
    }

    // Check if the user is subscribed
    let isSubscribed = false

    if (aminoUser.subscriptionExpiryDate) {
      const expiryDate = new Date(aminoUser.subscriptionExpiryDate)
      if (expiryDate >= new Date()) {
        isSubscribed = await checkAndUpdateUserIsSubscribed(aminoUser.id)
      } else {
        isSubscribed = true
      }
    } else {
      isSubscribed = await checkAndUpdateUserIsSubscribed(aminoUser.id)
    }

    if (!isSubscribed) {
      console.error(`User subscription has expired for user ID: ${aminoUser.id}`)
      continue
    }

    const consumedOn = message.consumedOn || new Date().toISOString()
    const isMessageBeingEdited = true

    const responseMessage = await GenerateResponseForQuickLog(aminoUser, message.id, consumedOn, isMessageBeingEdited)

    console.log(`Response for message ID ${message.id}: `, responseMessage)
  }
}

resendRecentReceivedMessages([18888])
