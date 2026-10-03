import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Messages de contact" />
      <TableSkeleton columns={4} />
    </LoadingRegion>
  );
}
