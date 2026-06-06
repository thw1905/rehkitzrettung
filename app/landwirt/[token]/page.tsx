import LandwirtRequestPageClient from "@/components/landwirt/landwirt-request-page-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function LandwirtRequestPage({ params }: PageProps) {
  const { token } = await params;

  return <LandwirtRequestPageClient token={token} />;
}