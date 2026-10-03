import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Catalogue des examens" />
      <TableSkeleton columns={4} />
    </LoadingRegion>
  );
}
