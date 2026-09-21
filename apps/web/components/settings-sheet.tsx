"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut, Settings2 } from "lucide-react";
import type { AlertPreferences, MeView } from "@nemea/shared-types";
import { ChannelsPanel } from "@/components/channels-panel";
import { WalletSignIn } from "@/components/wallet-signin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Label } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/format";
import { MAIN_FIELDS, MORE_FIELDS, formatPref, rangeOf, weeklyCapRange, type NumericPrefKey, type PrefField } from "@/lib/prefs-meta";
import { useLogout, useSavePreferences } from "@/lib/queries";

type Draft = Pick<AlertPreferences, NumericPrefKey | "weeklyCap" | "protectionLevel">;

const NUMERIC_KEYS: NumericPrefKey[] = [...MAIN_FIELDS, ...MORE_FIELDS].map((f) => f.key);
const DRAFT_KEYS: Array<keyof Draft> = [...NUMERIC_KEYS, "weeklyCap", "protectionLevel"];

function draftFrom(prefs: AlertPreferences): Draft {
  return Object.fromEntries(DRAFT_KEYS.map((key) => [key, prefs[key]])) as Draft;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="py-6 first:pt-0">
      <h3 className="text-base font-bold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Slider({ field, value, onChange }: { field: PrefField; value: number; onChange: (value: number) => void }) {
  const { min, max } = rangeOf(field.key);
  const id = `pref-${field.key}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{field.label}</Label>
        <output htmlFor={id} className="num text-sm font-bold">
          {formatPref(field.unit, value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={`${id}-help`}
        aria-valuetext={formatPref(field.unit, value)}
        className="h-11 w-full cursor-pointer"
      />
      <p id={`${id}-help`} className="-mt-1 text-sm text-muted">
        {field.help}
        <span className="num text-faint">
          {" "}
          Range {formatPref(field.unit, min)} to {formatPref(field.unit, max)}.
        </span>
      </p>
    </div>
  );
}

const LEVELS: Array<{ level: 1 | 2 | 3; title: string; body: string }> = [
  { level: 1, title: "Alert only", body: "Nemea tells you what happened. You decide everything else." },
  { level: 2, title: "Alert and swap suggestion", body: "Nemea also prepares a swap idea you can open in Uniswap or 1inch. You confirm it in your own wallet." },
  { level: 3, title: "Auto-swap", body: "Nemea acts for you without asking." },
];

function SettingsForm({ me }: { me: MeView }) {
  const save = useSavePreferences();
  const saved = useMemo(() => draftFrom(me.preferences), [me.preferences]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [justSaved, setJustSaved] = useState(false);
  const cap = weeklyCapRange();
  const capOptions = Array.from({ length: cap.max - cap.min + 1 }, (_, i) => cap.min + i);

  const changed = DRAFT_KEYS.filter((key) => draft[key] !== saved[key]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setJustSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const submit = () => {
    const patch = Object.fromEntries(changed.map((key) => [key, draft[key]])) as Partial<AlertPreferences>;
    save.mutate(patch, { onSuccess: () => setJustSaved(true) });
  };

  return (
    <div className="divide-y divide-line">
      <Section title="How sensitive should Nemea be?" description="Lower numbers mean more alerts. Nemea will still never send more than your weekly limit of non-critical alerts.">
        <div className="flex flex-col gap-6">
          {MAIN_FIELDS.map((field) => (
            <Slider key={field.key} field={field} value={draft[field.key]} onChange={(v) => set(field.key, v)} />
          ))}
          <details className="rounded-[var(--radius-control)] border border-line bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center px-3.5 text-sm font-semibold">More alert types</summary>
            <div className="flex flex-col gap-6 border-t border-line p-3.5">
              {MORE_FIELDS.map((field) => (
                <Slider key={field.key} field={field} value={draft[field.key]} onChange={(v) => set(field.key, v)} />
              ))}
            </div>
          </details>
        </div>
      </Section>

      <Section title="Non-critical alerts per week" description="A ceiling, not a target. Most weeks will be quieter.">
        <div role="radiogroup" aria-label="Non-critical alerts per week" className="flex gap-2">
          {capOptions.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={draft.weeklyCap === n}
              onClick={() => set("weeklyCap", n)}
              className={cn(
                "num h-11 min-w-14 flex-1 rounded-[var(--radius-control)] border text-base font-semibold transition-colors",
                draft.weeklyCap === n ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface hover:bg-sunken",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Protection level" description="What Nemea may offer when an alert fires. Nemea never holds your keys and never moves your funds.">
        <div role="radiogroup" aria-label="Protection level" className="flex flex-col gap-2.5">
          {LEVELS.map((l) => {
            const disabled = l.level === 3;
            const checked = draft.protectionLevel === l.level;
            return (
              <button
                key={l.level}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-disabled={disabled || undefined}
                disabled={disabled}
                onClick={() => set("protectionLevel", l.level)}
                className={cn(
                  "flex min-h-11 flex-col gap-1 rounded-[var(--radius-control)] border p-3.5 text-left transition-colors",
                  checked ? "border-primary bg-safe-soft" : "border-line-strong bg-surface",
                  disabled ? "cursor-not-allowed opacity-70" : "hover:bg-sunken",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    Level {l.level}: {l.title}
                  </span>
                  {disabled ? <Badge tone="outline">Coming later</Badge> : checked ? <Check className="size-4 text-primary" aria-hidden /> : null}
                </span>
                <span className="text-sm text-muted">{l.body}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="sticky -bottom-5 z-10 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4">
        <p role="status" className="text-sm font-medium">
          {save.isError ? <span className="text-crit-text">{errorMessage(save.error)}</span> : justSaved ? <span className="text-safe-text">Saved. New settings apply to the next check.</span> : changed.length > 0 ? <span className="text-muted">Unsaved changes</span> : <span className="text-muted">Everything is saved</span>}
        </p>
        <Button onClick={submit} loading={save.isPending} disabled={changed.length === 0}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

function AccountSection({ me, onLeave }: { me: MeView; onLeave: () => void }) {
  const router = useRouter();
  const logout = useLogout();
  const isWallet = me.user.kind === "wallet" || !!me.user.walletAddress;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {isWallet && me.user.walletAddress ? (
          <>
            Signed in with wallet <span className="font-mono font-semibold">{shortAddress(me.user.walletAddress)}</span>.
          </>
        ) : (
          "You are using Nemea as a guest. Your portfolio lives in this browser's session."
        )}
      </p>
      {!isWallet ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <WalletSignIn size="md" redirect={false} label="Sign in with wallet" />
          </div>
          <p className="text-sm text-muted">Signing in proves you own a wallet so your portfolio can follow you. It cannot move funds and costs no gas.</p>
        </div>
      ) : null}
      <div>
        <Button
          variant="secondary"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => {
                onLeave();
                router.push("/");
              },
            })
          }
          loading={logout.isPending}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
      {logout.isError ? <FieldError>{errorMessage(logout.error)}</FieldError> : null}
    </div>
  );
}

export function SettingsSheet({ me }: { me: MeView }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label="Open settings">
          <Settings2 className="size-4" aria-hidden />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent variant="sheet" title="Settings" description="Tune what Nemea watches, how it reaches you, and how much it may suggest.">
        <SettingsForm me={me} />
        <div className="divide-y divide-line">
          <Section title="Where alerts are sent" description="Pick the places you want to hear from Nemea. Channels this server cannot support say so.">
            <ChannelsPanel me={me} />
          </Section>
          <Section title="Account">
            <AccountSection me={me} onLeave={() => setOpen(false)} />
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
