import { LoadingRegion, PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} />
    </LoadingRegion>
  );
}
