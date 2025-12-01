import UserManagement from "@/components/ui/usermanagement";

type PageProps = { params: Promise<{ businessId: string }> | { businessId: string } };

export default async function Page({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);
  return <UserManagement businessId={businessId} />;
}
