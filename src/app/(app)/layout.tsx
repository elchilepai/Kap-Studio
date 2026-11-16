import Nav from "@/components/Nav";
import { pendingReviewCount } from "@/server/queries";
import { requireAdmin } from "@/server/auth/guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const pending = await pendingReviewCount();
  return (
    <div className="shell">
      <Nav pending={pending} username={user.username} />
      <main className="main">{children}</main>
    </div>
  );
}
