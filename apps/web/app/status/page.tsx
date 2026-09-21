import { MarketingHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StatusView } from "@/components/status-view";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("status");

export default function StatusPage() {
  return (
    <>
      <MarketingHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <StatusView />
      </main>
      <SiteFooter />
    </>
  );
}
