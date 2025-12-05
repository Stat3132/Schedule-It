import UserManagement from "@/components/ui/usermanagement";

type UserManagementPageProps = {
  params: {
    businessId: string;
  };
};

export default function Page({ params }: UserManagementPageProps) {
  return <UserManagement businessId={params.businessId} />;
}

