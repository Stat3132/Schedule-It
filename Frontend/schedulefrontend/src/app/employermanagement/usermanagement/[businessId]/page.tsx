import UserManagement from "@/components/ui/usermanagement";

type PageProps = { params?: Promise<{ businessId: string }> };

export default async function Page({ params }: PageProps) {
  const resolvedParams = (await params) ?? { businessId: "" };
  return <UserManagement businessId={resolvedParams.businessId} />;
}