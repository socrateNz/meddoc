import { LoadingRegion, PageHeaderSkeleton, CardGridSkeleton, ListSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <CardGridSkeleton count={4} />
      <ListSkeleton rows={6} />
    </LoadingRegion>
  );
}
