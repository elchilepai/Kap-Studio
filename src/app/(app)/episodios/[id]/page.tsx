import ProductionDetail from "@/components/ProductionDetail";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  return <ProductionDetail id={(await params).id} kind="episode" error={(await searchParams).error} />;
}
