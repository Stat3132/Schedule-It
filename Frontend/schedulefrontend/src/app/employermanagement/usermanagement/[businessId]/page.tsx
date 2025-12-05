import UserManagement from "@/components/ui/usermanagement";

export default function Page({ params }: { params: { businessId: string } }) {
  return <UserManagement businessId={params.businessId} />;
}

