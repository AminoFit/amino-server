import SideNav from "./SideNav";
import { getUser } from "./settings/actions";

import { TimeZoneBanner } from "./TimeZoneBanner";

export default async function Example({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    return <div className="">No user found</div>;
  }

  return (
    <>
      <div className="h-full">
        <SideNav />

        <div className="lg:pl-72 h-full">
          <main className="h-full">
            <div className="h-full">{children}</div>
          </main>
        </div>
      </div>
      <TimeZoneBanner user={user} />
    </>
  );
}
