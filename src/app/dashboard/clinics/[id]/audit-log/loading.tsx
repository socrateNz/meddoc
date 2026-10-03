import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Journal d'audit (Clinique)" />
      <TableSkeleton columns={5} />
    </LoadingRegion>
  );
}
