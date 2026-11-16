import { LoadingRegion, PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Comptabilité" />
      <CardGridSkeleton count={8} />
    </LoadingRegion>
  );
}
