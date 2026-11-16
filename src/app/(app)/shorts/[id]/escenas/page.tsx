import SceneEditor from "@/components/SceneEditor";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  return <SceneEditor id={(await params).id} kind="short" error={(await searchParams).error} />;
}
