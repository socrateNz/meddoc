import { LoadingRegion, PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Cliniques affiliées" />
      <CardGridSkeleton count={6} />
    </LoadingRegion>
  );
}
