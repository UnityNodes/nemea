import { BellRing, Eye, Gauge, ListPlus, LockKeyhole, Scale } from "lucide-react";
import Link from "next/link";
import { AlertSpecimen } from "@/components/alert-specimen";
import { HeroActions } from "@/components/hero-actions";
import { Reveal } from "@/components/reveal";
import { MarketingHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StartGuestButton } from "@/components/start-guest";
import { ValleyArt } from "@/components/valley-art";
import { WalletSignIn } from "@/components/wallet-signin";

const steps = [
  { icon: ListPlus, title: "Add your holdings", body: "Type a coin, import a wallet address (read-only), or load a sample portfolio to look around first." },
  { icon: Eye, title: "We watch with CoinMarketCap", body: "Prices, stablecoin pegs and trading volume are checked on a schedule that fits the data plan. No trading, no keys." },
  { icon: BellRing, title: "Get a calm alert", body: "About three non-critical alerts a week, at most. Each one has an Explain like I'm 5 button that turns a scary moment into a small lesson." },
];

const limits = [
  {
    icon: Gauge,
    title: "Data has a budget.",
    body: "CoinMarketCap limits how many calls Nemea can make. On a small plan Nemea checks less often instead of failing quietly, and the status page shows the real numbers.",
  },
  {
    icon: Scale,
    title: "Not financial advice.",
    body: "Alerts explain what happened and show the data. They never tell you to buy or sell, and any protective action waits for your own confirmation.",
  },
  {
    icon: LockKeyhole,
    title: "Non-custodial.",
    body: "Nemea never holds your keys and never moves your funds. Wallet import reads public balances only.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-14 lg:pb-20 lg:pt-14">
          <Reveal>
            <p className="text-base font-semibold text-safe-text">Not a trading bot. Insurance against being offline.</p>
            <h1 className="display mt-5 text-[clamp(2.4rem,5.6vw,4.2rem)]">
              The lion was invincible. <em className="not-italic text-primary">Then it wasn&rsquo;t.</em>
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg text-muted">Nemea watches your crypto while you are offline and calmly tells you when something looks wrong.</p>
            <div className="mt-8">
              <HeroActions />
            </div>
          </Reveal>
          <div className="mx-auto w-full max-w-[21rem] lg:max-w-[25rem]">
            <ValleyArt className="h-auto w-full" />
            <p className="mt-4 text-center text-sm leading-snug text-muted">The valley of Nemea, where Heracles beat the lion no weapon could hurt.</p>
          </div>
        </section>

        <section id="how" className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:py-20">
          <div>
            <Reveal>
              <h2 className="display text-3xl sm:text-4xl">How it works</h2>
            </Reveal>
            <ol className="mt-8 flex flex-col gap-8">
              {steps.map((step, index) => (
                <Reveal as="li" key={step.title} delay={index * 0.08} className="flex gap-4">
                  <>
                    <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-safe-soft text-safe-text">
                      <step.icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                      <p className="mt-1 max-w-[30rem] text-muted">{step.body}</p>
                    </div>
                  </>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal delay={0.1} className="lg:pt-4">
            <AlertSpecimen />
          </Reveal>
        </section>

        <section id="limits" className="bg-band text-on-band">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <Reveal>
              <h2 className="display max-w-3xl text-3xl sm:text-4xl">Nemea only promises what it can keep.</h2>
            </Reveal>
            <ul className="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-10">
              {limits.map((limit, index) => (
                <Reveal as="li" key={limit.title} delay={index * 0.08} className="border-t border-on-band/30 pt-5">
                  <>
                    <limit.icon className="size-6 text-band-muted" aria-hidden />
                    <h3 className="mt-3 text-lg font-semibold">{limit.title}</h3>
                    <p className="mt-1.5 text-band-muted">{limit.body}</p>
                  </>
                </Reveal>
              ))}
            </ul>
            <Link href="/status" className="mt-8 inline-flex min-h-11 items-center font-semibold underline decoration-on-band/50 underline-offset-4 hover:decoration-on-band">
              See the live status and every data call
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <Reveal>
            <h2 className="display max-w-3xl text-3xl sm:text-5xl">Look after it while you live your life.</h2>
            <p className="mt-5 max-w-xl text-lg text-muted">Begin with a sample portfolio, or add your own coins. No keys to hand over, nothing to install.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <StartGuestButton />
              <WalletSignIn />
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
