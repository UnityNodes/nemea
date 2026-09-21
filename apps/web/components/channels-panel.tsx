"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Bell, Check, Copy, ExternalLink, Mail, Send, type LucideIcon } from "lucide-react";
import type { MeView, TelegramLinkCode } from "@nemea/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api";
import { disablePush, enablePush, pushSupport } from "@/lib/push";
import { useChannels, usePushKey, useRemoveEmail, useSavePreferences, useSetEmail, useTelegramLink, useUnlinkTelegram, qk } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

function Row({ icon: Icon, title, status, children }: { icon: LucideIcon; title: string; status?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4.5 text-muted" aria-hidden />
          {title}
        </h4>
        {status}
      </div>
      {children}
    </li>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="rounded-[var(--radius-control)] bg-sunken p-3 text-sm text-muted">{children}</p>;
}

function SendToggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <Label htmlFor={id} className="font-medium">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Date.parse(expiresAt) - Date.now());
  useEffect(() => {
    const tick = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      setLeft(remaining);
      if (remaining <= 0) onExpire();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, onExpire]);
  const total = Math.max(0, Math.floor(left / 1000));
  return (
    <span className="num">
      {Math.floor(total / 60)}:{String(total % 60).padStart(2, "0")}
    </span>
  );
}

function TelegramRow({ me }: { me: MeView }) {
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const polling = code !== null && !expired;
  const channels = useChannels(polling ? 3000 : false);
  const link = useTelegramLink();
  const unlink = useUnlinkTelegram();
  const save = useSavePreferences();
  const linked = (channels.data ?? me.channels).telegram;

  useEffect(() => {
    if (linked.linked && code) setCode(null);
  }, [linked.linked, code]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const start = () => {
    setExpired(false);
    link.mutate(undefined, { onSuccess: setCode });
  };

  const bot = me.capabilities.telegramBot;

  return (
    <Row icon={Send} title="Telegram" status={!me.capabilities.telegram ? <Badge tone="outline">Unavailable</Badge> : linked.linked ? <Badge tone="safe">Linked{linked.username ? ` as @${linked.username}` : ""}</Badge> : <Badge tone="neutral">Not linked</Badge>}>
      {!me.capabilities.telegram ? (
        <Unavailable>Telegram alerts are not available on this server because no Telegram bot is configured.</Unavailable>
      ) : linked.linked ? (
        <>
          <SendToggle label="Send alerts to Telegram" checked={me.preferences.telegram} onChange={(value) => save.mutate({ telegram: value })} disabled={save.isPending} />
          <div>
            <Button variant="secondary" size="sm" onClick={() => unlink.mutate()} loading={unlink.isPending}>
              Unlink Telegram
            </Button>
          </div>
        </>
      ) : code && !expired ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line-strong bg-surface p-4">
          <p className="text-sm text-muted">Your one-time code. It is only good for this link.</p>
          <p className="flex items-center gap-2">
            <code className="rounded-md bg-sunken px-3 py-2 font-mono text-lg font-semibold tracking-wide">{code.code}</code>
            <Button variant="secondary" size="sm" onClick={() => void copy()} aria-label="Copy code">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </p>
          {code.deepLink ? (
            <a href={code.deepLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover">
              Open Telegram
              <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : (
            <p className="text-sm">
              Open Telegram and send <code className="font-mono font-semibold">/start {code.code}</code> to {bot ? `@${bot}` : "the Nemea bot"}.
            </p>
          )}
          <p className="text-sm text-muted" role="status">
            Waiting for you to confirm in Telegram. Code expires in{" "}
            <Countdown expiresAt={code.expiresAt} onExpire={() => setExpired(true)} />.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {expired ? <p className="text-sm font-medium text-warn-text">That code expired before it was used. Get a new one to try again.</p> : null}
          <div>
            <Button variant="secondary" size="sm" onClick={start} loading={link.isPending}>
              {expired ? "Get a new code" : "Connect Telegram"}
            </Button>
          </div>
        </div>
      )}
      {link.isError ? <FieldError>{errorMessage(link.error)}</FieldError> : null}
      {unlink.isError ? <FieldError>{errorMessage(unlink.error)}</FieldError> : null}
    </Row>
  );
}

function EmailRow({ me }: { me: MeView }) {
  const channels = useChannels(false);
  const setEmail = useSetEmail();
  const remove = useRemoveEmail();
  const save = useSavePreferences();
  const [value, setValue] = useState("");
  const state = (channels.data ?? me.channels).email;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const email = value.trim();
    if (!email) return;
    setEmail.mutate(email, { onSuccess: () => setValue("") });
  };

  return (
    <Row icon={Mail} title="Email" status={!me.capabilities.email ? <Badge tone="outline">Unavailable</Badge> : state.address ? state.verified ? <Badge tone="safe">Verified</Badge> : <Badge tone="warn">Waiting for confirmation</Badge> : <Badge tone="neutral">Not set</Badge>}>
      {!me.capabilities.email ? (
        <Unavailable>Email alerts are not available on this server because no email service is configured.</Unavailable>
      ) : (
        <>
          {state.address ? (
            <div className="flex flex-col gap-3">
              <p className="break-all text-sm">{state.address}</p>
              {state.verified ? (
                <SendToggle label="Send alerts by email" checked={me.preferences.email} onChange={(v) => save.mutate({ email: v })} disabled={save.isPending} />
              ) : (
                <p className="text-sm text-muted" role="status">
                  Check your inbox and follow the confirmation link. Nothing is sent to this address until you confirm it.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!state.verified ? (
                  <Button variant="secondary" size="sm" onClick={() => setEmail.mutate(state.address ?? "")} loading={setEmail.isPending}>
                    Send the link again
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => remove.mutate()} loading={remove.isPending}>
                  Remove email
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
              <Label htmlFor="settings-email">Email address</Label>
              <div className="flex gap-2">
                <Input id="settings-email" type="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} />
                <Button type="submit" variant="secondary" loading={setEmail.isPending} disabled={!value.trim()}>
                  Confirm
                </Button>
              </div>
            </form>
          )}
          <div aria-live="polite">
            {setEmail.isSuccess ? <p className="text-sm font-medium text-safe-text">Check your inbox. We sent a confirmation link.</p> : null}
            {setEmail.isError ? <FieldError>{errorMessage(setEmail.error)}</FieldError> : null}
            {remove.isError ? <FieldError>{errorMessage(remove.error)}</FieldError> : null}
          </div>
        </>
      )}
    </Row>
  );
}

function PushRow({ me }: { me: MeView }) {
  const client = useQueryClient();
  const channels = useChannels(false);
  const key = usePushKey(me.capabilities.push);
  const save = useSavePreferences();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const subscribed = (channels.data ?? me.channels).push.subscribed;
  const support = pushSupport();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: qk.channels });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const publicKey = key.data?.publicKey ?? null;

  return (
    <Row icon={Bell} title="Browser notifications" status={!me.capabilities.push ? <Badge tone="outline">Unavailable</Badge> : subscribed ? <Badge tone="safe">On</Badge> : <Badge tone="neutral">Off</Badge>}>
      {!me.capabilities.push ? (
        <Unavailable>Browser push is not available on this server.</Unavailable>
      ) : key.isPending ? (
        <p className="text-sm text-muted">Checking what this server supports...</p>
      ) : key.isError ? (
        <FieldError>{errorMessage(key.error)}</FieldError>
      ) : publicKey === null ? (
        <Unavailable>Browser push is not configured on this server.</Unavailable>
      ) : !support.supported ? (
        <Unavailable>{support.reason}</Unavailable>
      ) : subscribed ? (
        <>
          <SendToggle label="Send alerts to the browser" checked={me.preferences.push} onChange={(v) => save.mutate({ push: v })} disabled={save.isPending} />
          <div>
            <Button variant="secondary" size="sm" onClick={() => void run(disablePush)} loading={busy}>
              Turn off on this browser
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button variant="secondary" size="sm" onClick={() => void run(() => enablePush(publicKey))} loading={busy}>
            Turn on browser notifications
          </Button>
        </div>
      )}
      <div aria-live="polite">{problem ? <FieldError>{problem}</FieldError> : null}</div>
    </Row>
  );
}

export function ChannelsPanel({ me }: { me: MeView }) {
  return (
    <ul className="divide-y divide-line">
      <li className="pb-5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-semibold">In this dashboard</h4>
          <Badge tone="safe">Always on</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">Every alert always appears here, even if no other channel is set up.</p>
      </li>
      <TelegramRow me={me} />
      <EmailRow me={me} />
      <PushRow me={me} />
    </ul>
  );
}
