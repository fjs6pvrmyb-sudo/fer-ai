import { requireSession } from "@/modules/auth/session";

export default async function SecureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return children;
}
