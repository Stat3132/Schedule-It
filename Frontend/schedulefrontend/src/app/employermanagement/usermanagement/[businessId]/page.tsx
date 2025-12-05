import UserManagement from "@/components/ui/usermanagement";

export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <UserManagement businessId={businessId} />;
}