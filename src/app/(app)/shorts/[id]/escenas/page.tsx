import SceneEditor from "@/components/SceneEditor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <SceneEditor id={(await params).id} kind="short" />; }
