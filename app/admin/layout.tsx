import Sidebar from "@/components/admin/Sidebar";
import React from "react";

function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex flex-row w-full min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col xs:p-10 p-5 bg-light-800 w-[calc(100%-264px)]">
        {children}
      </div>
    </main>
  );
}

export default AdminLayout;