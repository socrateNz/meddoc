import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Contrats aidants" />
      <TableSkeleton columns={6} />
    </LoadingRegion>
  );
}
