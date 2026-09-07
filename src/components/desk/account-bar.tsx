import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Sun, UserRound } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveProfile, usernameError, type UserProfile } from "@/lib/account";
import { passwordError, setLoginPassword } from "@/lib/password";
import { createDeskPack, importDeskPack } from "@/lib/desk-pack";
import { snapshotDesk, useDeskStore } from "@/lib/desk-store";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { applyTheme, resolveInitialTheme, toggleTheme, type ThemeMode } from "@/lib/theme";
import { getAdminStatus } from "@/lib/admin";

const ProfileContext = createContext<{
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
} | null>(null);

export function ProfileProvider({
  profile,
  setProfile,
  children,
}: {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  children: ReactNode;
}) {
  return (
    <ProfileContext.Provider value={{ profile, setProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("profile");
  return ctx;
}

function passwordApiErrorZh(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("invalid password") || t.includes("incorrect")) return "当前密码不正确";
  if (t.includes("credential account not found") || t.includes("no password")) {
    return "这个账户没有登录密码，请先设置";
  }
  if (t.includes("password already") || t.includes("already has a password")) {
    return "这个账户已设置过登录密码";
  }
  if (t.includes("too short")) return "密码至少 8 位";
  if (t.includes("too long")) return "密码最多 72 位";
  if (t.includes("unauthorized") || t.includes("session")) return "请重新登录后再试";
  if (/^[a-z0-9 _.-]+$/i.test(raw) && /[A-Za-z]/.test(raw)) {
    return "操作失败，请稍后重试";
  }
  return raw || "请稍后重试";
}

export function AccountBar() {
  const { profile, setProfile } = useProfile();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [hasCredential, setHasCredential] = useState<boolean | null>(null);
  const [credBusy, setCredBusy] = useState(false);
  const [packUrl, setPackUrl] = useState("");
  const [packBusy, setPackBusy] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const replaceDesk = useDeskStore((s) => s.replaceDesk);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const mode = resolveInitialTheme();
    applyTheme(mode);
    setTheme(mode);
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<ThemeMode>).detail;
      if (detail === "light" || detail === "dark") setTheme(detail);
    };
    window.addEventListener("fengkou-theme", onTheme);
    return () => window.removeEventListener("fengkou-theme", onTheme);
  }, []);

  const refreshCredential = useCallback(async () => {
    if (!authEnabled || !user || user.isDevFallback) {
      setHasCredential(null);
      return;
    }
    setCredBusy(true);
    try {
      const { data, error: err } = await authClient.listAccounts();
      if (err) {
        setHasCredential(null);
        return;
      }
      const accounts = Array.isArray(data) ? data : [];
      setHasCredential(accounts.some((a) => a.providerId === "credential"));
    } catch {
      setHasCredential(null);
    } finally {
      setCredBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    void refreshCredential();
    void getAdminStatus()
      .then((s) => setIsAdmin(Boolean(s.admin)))
      .catch(() => setIsAdmin(false));
  }, [open, refreshCredential]);

  function resetDialogFields() {
    setUsername(profile.username);
    setDisplayName(profile.displayName);
    setError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwError("");
    setPackUrl("");
    setImportUrl("");
    setImportError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad = usernameError(username);
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError("");
    const res = await saveProfile({
      data: { username, displayName: displayName.trim() || username },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setProfile(res.profile);
    toast("资料已保存");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    const bad = passwordError(newPassword);
    if (bad) {
      setPwError(bad);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("两次输入的新密码不一致");
      return;
    }

    if (hasCredential === null) {
      setPwError("正在核对账户，请稍候再试");
      return;
    }
    if (hasCredential && !currentPassword) {
      setPwError("请填写当前密码");
      return;
    }

    setPwBusy(true);
    try {
      if (hasCredential) {
        const { error: err } = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });
        if (err) {
          setPwError(passwordApiErrorZh(err.message || "修改失败"));
          return;
        }
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast("登录密码已修改");
      } else {
        const res = await setLoginPassword({ data: { newPassword } });
        if (!res.ok) {
          setPwError(res.error);
          return;
        }
        setNewPassword("");
        setConfirmPassword("");
        setHasCredential(true);
        toast("登录密码已设置，之后也可用邮箱密码登录");
      }
    } catch {
      setPwError("请稍后重试");
    } finally {
      setPwBusy(false);
    }
  }

  async function generatePack() {
    setPackBusy(true);
    setPackUrl("");
    try {
      const desk = snapshotDesk(useDeskStore.getState());
      const res = await createDeskPack({ data: { desk } });
      if (!res.ok) {
        toast("生成失败，请稍后重试");
        return;
      }
      setPackUrl(res.url);
      toast("下载网址已生成");
    } catch {
      toast("生成失败，请稍后重试");
    } finally {
      setPackBusy(false);
    }
  }

  async function copyPackUrl() {
    if (!packUrl) return;
    try {
      await navigator.clipboard.writeText(packUrl);
      toast("已复制链接");
    } catch {
      toast("复制失败，请手动选择链接");
    }
  }

  async function runImport(e: React.FormEvent) {
    e.preventDefault();
    setImportError("");
    if (!importUrl.trim()) {
      setImportError("请粘贴资料包网址");
      return;
    }
    setImportBusy(true);
    try {
      const res = await importDeskPack({ data: { url: importUrl.trim() } });
      if (!res.ok) {
        setImportError(res.error);
        return;
      }
      replaceDesk(res.desk);
      setImportUrl("");
      toast("资料包已导入");
    } catch {
      setImportError("导入失败，请稍后重试");
    } finally {
      setImportBusy(false);
    }
  }

  const email = user?.primaryEmail?.trim() || "";
  const showPasswordSection = authEnabled && user && !user.isDevFallback;

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={() => {
            resetDialogFields();
            setOpen(true);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/50 bg-white/55 px-2 py-1 text-xs font-medium text-foreground shadow-[var(--shadow-border)] backdrop-blur-md hover:bg-white/75 dark:border-border/80 dark:bg-secondary/70 dark:hover:bg-secondary sm:gap-1.5 sm:px-2.5 sm:text-sm"
          title="用户中心"
          aria-label="用户中心"
        >
          <UserRound className="size-3.5 shrink-0 text-bone" />
          <span className="sm:hidden">用户</span>
          <span className="hidden max-w-36 truncate sm:inline">
            用户中心 · @{profile.username}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTheme(toggleTheme())}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={theme === "dark" ? "切换浅色" : "切换深色"}
          aria-label={theme === "dark" ? "切换浅色" : "切换深色"}
        >
          {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </button>
        <div className="hidden sm:block">
          <UserButton />
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(92vw,520px)] max-h-[min(90dvh,720px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>用户中心</DialogTitle>
            <DialogDescription>
              查看账户信息、管理我的文章、设置登录密码；资料包仍可在此导入导出。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 rounded-2xl border border-white/45 bg-white/35 p-3 backdrop-blur-md dark:border-border/80 dark:bg-secondary/40">
            <p className="text-xs tracking-widest text-muted-foreground">账户信息</p>
            <dl className="grid gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">用户名</dt>
                <dd className="truncate font-medium text-bone">@{profile.username}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">显示名</dt>
                <dd className="truncate">{profile.displayName || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">邮箱</dt>
                <dd className="truncate">{email || "未绑定"}</dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/45 bg-white/35 p-3 backdrop-blur-md dark:border-border/80 dark:bg-secondary/40">
            <p className="text-xs tracking-widest text-muted-foreground">内容与管理</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild type="button" size="sm" variant="outline">
                <Link to="/account/articles" onClick={() => setOpen(false)}>
                  我的文章
                </Link>
              </Button>
              <Button asChild type="button" size="sm" variant="outline">
                <Link to="/posts" onClick={() => setOpen(false)}>
                  公开文章
                </Link>
              </Button>
              {isAdmin ? (
                <Button asChild type="button" size="sm" variant="secondary">
                  <Link to="/admin" onClick={() => setOpen(false)}>
                    站点管理
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <form onSubmit={save} className="grid gap-3">
            <p className="text-xs tracking-widest text-muted-foreground">编辑资料</p>
            <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
              用户名
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
              显示名
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={username}
              />
            </label>
            {error ? <p className="text-sm text-down">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存资料"}
            </Button>
          </form>

          <Separator className="my-1" />

          <div className="grid gap-3">
            <p className="text-xs tracking-widest text-muted-foreground">资料包</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              观察池、仓位流水、研判，不含密码；7 天有效；知道链接的人都能下载。
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={packBusy}
              onClick={() => void generatePack()}
            >
              {packBusy ? "生成中…" : "生成下载网址"}
            </Button>
            {packUrl ? (
              <div className="grid gap-2">
                <Input readOnly value={packUrl} className="font-mono text-xs" />
                <Button type="button" variant="secondary" onClick={() => void copyPackUrl()}>
                  复制链接
                </Button>
              </div>
            ) : null}
            <form onSubmit={runImport} className="grid gap-2 pt-1">
              <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                用网址导入
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="粘贴 /api/pack/… 链接"
                  autoComplete="off"
                />
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                导入后会覆盖当前观察池、流水与研判。
              </p>
              {importError ? <p className="text-sm text-down">{importError}</p> : null}
              <Button type="submit" variant="outline" disabled={importBusy}>
                {importBusy ? "导入中…" : "导入资料包"}
              </Button>
            </form>
          </div>

          {showPasswordSection ? (
            <>
              <Separator className="my-1" />
              <form onSubmit={savePassword} className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs tracking-widest text-muted-foreground">
                    {hasCredential ? "修改登录密码" : "设置登录密码"}
                  </p>
                  {credBusy ? (
                    <span className="text-[11px] text-muted-foreground">核对中…</span>
                  ) : hasCredential === false ? (
                    <span className="text-[11px] text-warn">尚未设置密码</span>
                  ) : hasCredential ? (
                    <span className="text-[11px] text-up">已可用邮箱密码登录</span>
                  ) : null}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {hasCredential
                    ? "修改后仍用原邮箱登录。密码仅限中文、字母、数字或下划线，至少 8 位。"
                    : "Google / X 登录的账户可在此补设密码，之后也能用邮箱密码进入。密码仅限中文、字母、数字或下划线，至少 8 位。"}
                </p>
                {hasCredential ? (
                  <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                    当前密码
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                ) : null}
                <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                  {hasCredential ? "新密码" : "登录密码"}
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="至少 8 位，中文/字母/数字/下划线"
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
                  再输一次
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
                {pwError ? <p className="text-sm text-down">{pwError}</p> : null}
                <Button type="submit" variant="outline" disabled={pwBusy || credBusy}>
                  {pwBusy
                    ? "保存中…"
                    : hasCredential
                      ? "修改登录密码"
                      : "设置登录密码"}
                </Button>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UsernameSetup({
  suggested,
  onDone,
}: {
  suggested: string;
  onDone: (profile: UserProfile) => void;
}) {
  const [username, setUsername] = useState(suggested);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const bad = usernameError(username);
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError("");
    const res = await saveProfile({
      data: { username, displayName: username.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone(res.profile);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
      <form
        onSubmit={submit}
        className="glass w-full max-w-md rounded-2xl p-6"
      >
        <p className="font-serif text-2xl">取一个用户名</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          这是你在锋口的标识。仓位和观察池会保存在这个名字下，别人无法看到。
        </p>
        <label className="mt-5 grid gap-1 text-xs tracking-widest text-muted-foreground">
          用户名
          <Input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例如 猫熊"
            required
          />
        </label>
        {error ? <p className="mt-2 text-sm text-down">{error}</p> : null}
        <Button type="submit" disabled={busy} className="mt-4 w-full">
          {busy ? "保存中…" : "进入研判台"}
        </Button>
      </form>
    </main>
  );
}
