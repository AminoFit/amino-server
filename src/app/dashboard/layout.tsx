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
      <div>
        <SideNav />

        <div className="lg:pl-72">
          <main className="py-10">
            <div className="px-4 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>
      <TimeZoneBanner user={user} />
    </>
  );
}
