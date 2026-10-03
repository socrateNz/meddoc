import { LoadingRegion, PageHeaderSkeleton, CardGridSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <CardGridSkeleton count={3} />
      <TableSkeleton rows={5} columns={4} />
    </LoadingRegion>
  );
}
