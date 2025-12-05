import UserManagement from "@/components/ui/usermanagement";

type Props = { params: { businessId: string } };

export default function Page({ params }: Props) {
  return <UserManagement businessId={params.businessId} />;
}