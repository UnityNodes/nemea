import { AlertDetail } from "@/components/alert-detail";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("alert");

export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AlertDetail id={id} />;
}
