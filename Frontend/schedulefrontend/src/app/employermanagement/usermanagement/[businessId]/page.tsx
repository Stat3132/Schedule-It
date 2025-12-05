import UserManagement from "@/components/ui/usermanagement";

type PageProps = {
  params: {
    businessId: string;
  };
};

export default function Page({ params }: PageProps) {
  return <UserManagement businessId={params.businessId} />;
}
