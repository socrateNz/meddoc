import { LoadingRegion, PageHeaderSkeleton, FormSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Ajouter une clinique" />
      <FormSkeleton fields={6} />
    </LoadingRegion>
  );
}
