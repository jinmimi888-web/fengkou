import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  emptyDesk,
  loadAccount,
  saveDesk,
  type UserProfile,
} from "@/lib/account";
import {
  clearOrphanLocalDesk,
  readOrphanLocalDesk,
  snapshotDesk,
  useDeskStore,
} from "@/lib/desk-store";
import { ProfileProvider, UsernameSetup } from "@/components/desk/account-bar";
import { Skeleton } from "@/components/ui/skeleton";

export function DeskSync({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const replaceDesk = useDeskStore((s) => s.replaceDesk);
  const setHydrated = useDeskStore((s) => s.setHydrated);

  useEffect(() => {
    if (!user) return;
    if (loadedFor.current === user.id) return;
    let cancelled = false;
    setReady(false);
    setHydrated(false);
    void loadAccount()
      .then(async (acc) => {
        if (cancelled) return;
        let desk = acc.desk;
        if (!desk) {
          const orphan = readOrphanLocalDesk();
          desk = orphan ?? emptyDesk();
          await saveDesk({ data: desk });
          if (orphan) clearOrphanLocalDesk();
        }
        if (cancelled) return;
        replaceDesk(desk);
        setProfile(acc.profile);
        loadedFor.current = user.id;
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        replaceDesk(emptyDesk());
        setProfile(null);
        loadedFor.current = user.id;
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, replaceDesk, setHydrated]);

  useEffect(() => {
    if (!ready || !profile) return;
    let timer: number | undefined;
    const unsub = useDeskStore.subscribe((state) => {
      if (!state.hydrated) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void saveDesk({ data: snapshotDesk(state) });
      }, 700);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [ready, profile]);

  if (!ready) {
    return (
      <div className="min-h-dvh bg-background px-6 py-10">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-6 h-24 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  if (!profile) {
    const suggested = (user?.displayName ?? "")
      .replace(/[^\u4e00-\u9fffA-Za-z0-9_]/g, "")
      .slice(0, 20);
    return (
      <UsernameSetup
        suggested={suggested}
        onDone={(next) => setProfile(next)}
      />
    );
  }

  return (
    <ProfileProvider profile={profile} setProfile={setProfile}>
      {children}
    </ProfileProvider>
  );
}
