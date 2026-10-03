import { LoadingRegion, PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Chambres & Lits" />
      <CardGridSkeleton count={6} />
    </LoadingRegion>
  );
}
