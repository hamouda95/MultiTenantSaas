import { redirect } from "next/navigation";
export default async function TenantHome({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  redirect(`/t/${encodeURIComponent(tenantId)}/executive`);
}
