// src/app/dashboard/page.tsx

"use client";

import useAuth from "@/hooks/useAuth";

const DashboardPage = () => {
  const { user } = useAuth();

  if (!user) return <div>Loading...</div>;

  return <div>Welcome to the dashboard, {user.email}</div>;
};

export default DashboardPage;
