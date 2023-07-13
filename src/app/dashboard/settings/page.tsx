import UpdateUserSettings from "./UpdateUserSettings";
import { getUser } from "./actions";
import tzData from "./timezones.json";

export default async function Settings() {
  const user = await getUser();
  if (!user) {
    return <div className="">No user found</div>;
  }
  return (
    <div className="">
      <UpdateUserSettings user={user} />
    </div>
  );
}
