import { createAdminSupabase } from "@/utils/supabase/serverAdmin";
import { createClient } from '@/utils/supabase/server';

import { redirect } from 'next/navigation';
import {
  PhotoIcon as PhotoOutlineIcon,
  MicrophoneIcon as MicrophoneOutlineIcon,
  TrashIcon as TrashOutlineIcon
} from "@heroicons/react/24/outline";
import { Fragment } from "react";
import { Tables } from "types/supabase";

// Define types for the tables
type MessageType = Tables<"Message">;
type FoodItemType = Tables<"FoodItem">;

// Define a custom type for the nested logged food item with food item details
interface LoggedFoodItemWithDetails extends Tables<"LoggedFoodItem"> {
  FoodItem: FoodItemType | null;
}

const allowedUserIds = [
  '2cf908ed-90a2-4ecd-a5f3-14b3a28fb05b',
  '6b005b82-88a5-457b-a1aa-60ecb1e90e21'
];

export default async function PrivatePage() {
  const supabase = createAdminSupabase();
  const anonSupabase = createClient();

  const { data, error } = await anonSupabase.auth.getUser();

  if (error || !data?.user) {
    console.log('(PrivatePage)Error getting user:', error);
    redirect('/login');
    return null;
  }

  if (!allowedUserIds.includes(data.user.id)) {
    console.log('User not allowed to access this page:', data.user.id);
    redirect('/access-denied');
    return null;
  }

  const { data: messages, error: messagesError } = await supabase
    .from('Message')
    .select(`
      id,
      createdAt,
      content,
      hasimages,
      isAudio,
      deletedAt
    `) as { data: MessageType[], error: any };

  if (messagesError) {
    console.error(messagesError);
    return <p>Error loading messages</p>;
  }

  const { data: loggedFoodItems, error: loggedFoodItemsError } = await supabase
    .from('LoggedFoodItem')
    .select(`
      id,
      consumedOn,
      deletedAt,
      foodItemId,
      messageId,
      FoodItem ( name )
    `) as { data: LoggedFoodItemWithDetails[], error: any };

  if (loggedFoodItemsError) {
    console.error(loggedFoodItemsError);
    return <p>Error loading logged food items</p>;
  }

  // Group logged food items by messageId
  const loggedFoodItemsByMessage = loggedFoodItems.reduce<Record<string, LoggedFoodItemWithDetails[]>>((acc, item) => {
    const key = item.messageId ?? 'null';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold leading-6 text-gray-900">Messages</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all messages including their associated food items.
          </p>
        </div>
      </div>
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 border-b border-gray-300 bg-white bg-opacity-75 py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 backdrop-blur backdrop-filter">
                    Deletion
                  </th>
                  <th className="sticky top-0 z-10 border-b border-gray-300 bg-white bg-opacity-75 py-3.5 text-left text-sm font-semibold text-gray-900 backdrop-blur backdrop-filter">
                    Time
                  </th>
                  <th className="sticky top-0 z-10 border-b border-gray-300 bg-white bg-opacity-75 py-3.5 text-left text-sm font-semibold text-gray-900 backdrop-blur backdrop-filter">
                    Content
                  </th>
                  <th className="sticky top-0 z-10 border-b border-gray-300 bg-white bg-opacity-75 py-3.5 text-left text-sm font-semibold text-gray-900 backdrop-blur backdrop-filter">
                    Media
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {messages.map((message) => (
                  <Fragment key={message.id}>
                    <tr className="border-t border-gray-200">
                      <td className="py-4">
                        {message.deletedAt ? (
                          <TrashOutlineIcon className="h-5 w-5 text-red-500" />
                        ) : null}
                      </td>
                      <td className="py-4">{new Date(message.createdAt).toLocaleString()}</td>
                      <td className="py-4">{message.content}</td>
                      <td className="py-4">
                        {message.hasimages && <PhotoOutlineIcon className="h-5 w-5 text-gray-500" />}
                        {message.isAudio && <MicrophoneOutlineIcon className="h-5 w-5 text-gray-500" />}
                      </td>
                    </tr>
                    {loggedFoodItemsByMessage[message.id ?? 'null']?.map((foodItem) => (
                      <tr key={foodItem.id} className="border-t border-gray-200">
                        <td className="pl-8 py-4">
                          {foodItem.deletedAt ? (
                            <TrashOutlineIcon className="h-5 w-5 text-red-500" />
                          ) : null}
                        </td>
                        <td className="pl-8 py-4">{new Date(foodItem.consumedOn).toLocaleString()}</td>
                        <td className="pl-8 py-4">{foodItem.FoodItem?.name}</td>
                        <td className="py-4"></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
