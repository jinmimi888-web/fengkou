import { createContext, useContext, useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
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
import { changePassword } from "@/lib/password";
import { Separator } from "@/components/ui/separator";

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

export function AccountBar() {
  const { profile, setProfile } = useProfile();
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
  const [pwNotice, setPwNotice] = useState("");

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
    setOpen(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwNotice("");
    if (newPassword.length < 8) {
      setPwError("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("两次输入的新密码不一致");
      return;
    }
    setPwBusy(true);
    try {
      const res = await changePassword({
        data: { currentPassword, newPassword },
      });
      if (!res.ok) {
        setPwError(res.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwNotice("密码已更新");
    } catch {
      setPwError("请稍后重试");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setUsername(profile.username);
            setDisplayName(profile.displayName);
            setError("");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setPwError("");
            setPwNotice("");
            setOpen(true);
          }}
          className="max-w-28 truncate rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
          title="编辑资料"
        >
          @{profile.username}
        </button>
        <UserButton />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>个人资料</DialogTitle>
            <DialogDescription>
              用户名是你的账户标识。观察池、仓位和研判都挂在这个名字下。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-3">
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
          <Separator className="my-4" />
          <form onSubmit={savePassword} className="grid gap-3">
            <p className="text-xs tracking-widest text-muted-foreground">登录密码</p>
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
            <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
              新密码
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 8 位"
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
            {pwNotice ? <p className="text-sm text-up">{pwNotice}</p> : null}
            <Button type="submit" variant="outline" disabled={pwBusy}>
              {pwBusy ? "更新中…" : "重设密码"}
            </Button>
          </form>
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
        className="w-full max-w-md rounded-xl bg-card p-6 shadow-[var(--shadow-border)]"
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
