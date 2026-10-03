import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Équipe Médicale" />
      <TableSkeleton columns={4} />
    </LoadingRegion>
  );
}
