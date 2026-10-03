import { LoadingRegion, PageHeaderSkeleton, ListSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Messagerie d'Équipe" />
      <ListSkeleton rows={6} />
    </LoadingRegion>
  );
}
