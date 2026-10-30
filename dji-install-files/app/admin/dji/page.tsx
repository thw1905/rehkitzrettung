import { requireAdminPage } from "@/lib/admin";
import DjiTestClient from "@/components/admin/DjiTestClient";

export default async function DjiTestPage() {
  await requireAdminPage();
  return <DjiTestClient />;
}
