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
          <main className="">
            <div className="">{children}</div>
          </main>
        </div>
      </div>
      <TimeZoneBanner user={user} />
    </>
  );
}
