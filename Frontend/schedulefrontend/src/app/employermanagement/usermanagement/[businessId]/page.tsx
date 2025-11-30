import UserManagement from "@/components/ui/usermanagement";

type PageProps = { params: { businessId: string } };

export default function Page({ params }: PageProps) {
  const { businessId } = params;
  return <UserManagement businessId={businessId} />;
}
