import { LoadingRegion, PageHeaderSkeleton, CardGridSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <CardGridSkeleton count={4} />
      <TableSkeleton columns={4} />
    </LoadingRegion>
  );
}
