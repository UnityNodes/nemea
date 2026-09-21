import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function AppPage() {
  return <Dashboard />;
}
