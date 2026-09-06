import { useState } from "react";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usernameError } from "@/lib/account";
import {
  completePasswordReset,
  requestPasswordReset,
} from "@/lib/password";

type Mode = "signin" | "signup" | "recover" | "reset";

function authErrorZh(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("invalid email or password") || t.includes("invalid password")) {
    return "邮箱或密码不正确";
  }
  if (t.includes("user already exists") || t.includes("already registered")) {
    return "这个邮箱已经注册过了";
  }
  if (t.includes("password too short") || t.includes("too short")) {
    return "密码至少 8 位";
  }
  if (t.includes("invalid email")) return "请填写有效邮箱";
  if (t.includes("user not found")) return "账户不存在";
  if (t.includes("failed to create")) return "注册失败，请稍后重试";
  if (t.includes("unauthorized") || t.includes("invalid origin")) {
    return "登录请求被拒绝，请刷新后再试";
  }
  if (/^[a-z0-9 _.-]+$/i.test(raw) && /[A-Za-z]/.test(raw)) {
    return "操作失败，请稍后重试";
  }
  return raw;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ticket, setTicket] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function go(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirm("");
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (mode === "signup") {
      const bad = usernameError(username);
      if (bad) {
        setError(bad);
        return;
      }
    }
    if (!email.includes("@")) {
      setError("请填写有效邮箱");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: username.trim(),
        });
        if (err) throw new Error(authErrorZh(err.message || "注册失败"));
        await authClient.getSession();
        const { saveProfile } = await import("@/lib/account");
        const saved = await saveProfile({
          data: { username: username.trim(), displayName: username.trim() },
        });
        if (!saved.ok) {
          setError(saved.error);
          setBusy(false);
          return;
        }
      } else {
        const { error: err } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (err) throw new Error(authErrorZh(err.message || "登录失败"));
        await authClient.getSession();
      }
    } catch (err) {
      setError(err instanceof Error ? authErrorZh(err.message) : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function onRecover(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const bad = usernameError(username);
    if (bad) {
      setError(bad);
      return;
    }
    if (!email.includes("@")) {
      setError("请填写有效邮箱");
      return;
    }
    setBusy(true);
    try {
      const res = await requestPasswordReset({
        data: { email: email.trim(), username: username.trim() },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTicket(res.ticket);
      setPassword("");
      setConfirm("");
      setMode("reset");
      setNotice("核对通过。请设置新密码，15 分钟内有效。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      const res = await completePasswordReset({
        data: { ticket, newPassword: password },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTicket("");
      setPassword("");
      setConfirm("");
      setMode("signin");
      setNotice("密码已重设，请用新密码登录。");
    } catch {
      setError("请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signup"
      ? "注册一个账户"
      : mode === "recover"
        ? "找回密码"
        : mode === "reset"
          ? "重设密码"
          : "用你的账户进入";
  const copy =
    mode === "signup"
      ? "用户名会成为你的标识。观察池、仓位和研判都挂在这个名字下。"
      : mode === "recover"
        ? "填写注册时的邮箱和用户名。核对通过后即可重设登录密码。"
        : mode === "reset"
          ? "设置新的登录密码。完成后回到登录页，用新密码进入。"
          : "每个用户名独立保存观察池、仓位、流水和研判。换设备登录同一账户即可接上。";

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-serif text-xl leading-none">锋</span>
          </div>
          <div>
            <p className="font-serif text-2xl leading-none tracking-tight">锋口</p>
            <p className="mt-1 text-[11px] tracking-[0.18em] text-muted-foreground">
              入场研判台
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-card p-6 shadow-[var(--shadow-border)]">
          <p className="font-serif text-2xl">{title}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
          {mode === "signin" || mode === "signup" ? (
            <div className="mt-5 flex rounded-lg bg-secondary p-1">
              <button
                type="button"
                onClick={() => go("signin")}
                className={
                  mode === "signin"
                    ? "h-9 flex-1 rounded-md bg-card text-sm shadow-[var(--shadow-border)]"
                    : "h-9 flex-1 rounded-md text-sm text-muted-foreground hover:text-foreground"
                }
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => go("signup")}
                className={
                  mode === "signup"
                    ? "h-9 flex-1 rounded-md bg-card text-sm shadow-[var(--shadow-border)]"
                    : "h-9 flex-1 rounded-md text-sm text-muted-foreground hover:text-foreground"
                }
              >
                注册
              </button>
            </div>
          ) : null}

          {mode === "signin" || mode === "signup" ? (
            <form onSubmit={onEmail} className="mt-5 grid gap-3">
              {mode === "signup" ? (
                <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                  用户名
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="例如 猫熊"
                    autoComplete="username"
                    required
                  />
                </label>
              ) : null}
              <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                邮箱
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                密码
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 8 位"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                />
              </label>
              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => go("recover")}
                  className="justify-self-start text-xs text-muted-foreground hover:text-foreground"
                >
                  忘记密码？
                </button>
              ) : null}
              {error ? <p className="text-sm text-down">{error}</p> : null}
              {notice ? <p className="text-sm text-up">{notice}</p> : null}
              <Button type="submit" disabled={busy} className="mt-1">
                {busy ? "请稍候…" : mode === "signup" ? "注册并进入" : "登录"}
              </Button>
            </form>
          ) : null}

          {mode === "recover" ? (
            <form onSubmit={onRecover} className="mt-5 grid gap-3">
              <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                邮箱
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                用户名
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="注册时的用户名"
                  autoComplete="username"
                  required
                />
              </label>
              {error ? <p className="text-sm text-down">{error}</p> : null}
              <Button type="submit" disabled={busy} className="mt-1">
                {busy ? "核对中…" : "核对并继续"}
              </Button>
              <button
                type="button"
                onClick={() => go("signin")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                返回登录
              </button>
            </form>
          ) : null}

          {mode === "reset" ? (
            <form onSubmit={onReset} className="mt-5 grid gap-3">
              {notice ? <p className="text-sm text-up">{notice}</p> : null}
              <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                新密码
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 8 位"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                再输一次
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="确认新密码"
                  autoComplete="new-password"
                  required
                />
              </label>
              {error ? <p className="text-sm text-down">{error}</p> : null}
              <Button type="submit" disabled={busy} className="mt-1">
                {busy ? "保存中…" : "重设密码"}
              </Button>
              <button
                type="button"
                onClick={() => go("recover")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                重新核对
              </button>
            </form>
          ) : null}

          {mode === "signin" || mode === "signup" ? (
            <>
              <p className="my-5 text-center text-xs tracking-widest text-muted-foreground">
                或用其他方式
              </p>
              <div className="grid gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                  >
                    使用 {p.label === "Google" ? "Google" : "X"} 继续
                  </Button>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          内容不构成投资建议。账户资料只属于你自己。
        </p>
      </div>
    </main>
  );
}
