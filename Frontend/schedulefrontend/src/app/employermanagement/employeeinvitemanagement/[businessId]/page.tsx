import UserManagement from "@/components/ui/usermanagement";
import EmployerTopNav from "@/components/EmployerTopNav";

// TS: params is now a Promise
type PageProps = { params: Promise<{ businessId: string }> };

export default async function Page(props: PageProps) {
  const { businessId } = await props.params; // await before use
  return (
    <>
      <EmployerTopNav />
      <UserManagement businessId={businessId} />
    </>
  );
}
