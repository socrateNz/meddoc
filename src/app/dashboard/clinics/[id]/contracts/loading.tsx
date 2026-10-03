import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Contrats aidants (Clinique)" />
      <TableSkeleton columns={6} />
    </LoadingRegion>
  );
}
