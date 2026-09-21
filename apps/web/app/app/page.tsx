import { Dashboard } from "@/components/dashboard";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("app");

export default function AppPage() {
  return <Dashboard />;
}
