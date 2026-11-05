import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupSection } from "@/components/SetupSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { branchPhotosQueryOptions, branchSetupQueryKey } from "@/features/branch-setup/branch-setup-queries";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { messages } from "@/lib/messages";
import { publicImageUrl, removeStoredImage, uploadImage } from "@/lib/stored-images";
import { supabase } from "@/lib/supabase-client";

export function PhotosSection({ branch }: { branch: WorkBranch }) {
  const queryClient = useQueryClient();
  const photos = useQuery(branchPhotosQueryOptions(branch.id));
  const refresh = () => queryClient.invalidateQueries({ queryKey: branchSetupQueryKey(branch.id) });

  const add = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadImage("shop-media", `${branch.organizationId}/branches/${branch.id}`, file);
      const nextSortOrder = Math.max(-1, ...(photos.data ?? []).map((photo) => photo.sortOrder)) + 1;
      const { error } = await supabase.from("branch_media").insert({
        organization_id: branch.organizationId,
        branch_id: branch.id,
        storage_path: path,
        sort_order: nextSortOrder,
      });
      if (error) {
        await removeStoredImage("shop-media", path);
        throw error;
      }
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (photo: { id: string; storagePath: string }) => {
      const { error } = await supabase.from("branch_media").delete().eq("id", photo.id);
      if (error) throw error;
      await removeStoredImage("shop-media", photo.storagePath);
    },
    onSuccess: refresh,
  });

  return (
    <SetupSection
      id="photos-section"
      title={messages.branchSetup.photos}
      intro={messages.branchSetup.photosIntro}
      action={<ImageUploadButton label={messages.branchSetup.addPhoto} isUploading={add.isPending} onImage={(file) => add.mutate(file)} />}
    >
      {photos.isPending ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : photos.isError ? (
        <QueryErrorState error={photos.error} onRetry={() => void photos.refetch()} />
      ) : photos.data.length === 0 ? (
        <p className="text-muted-foreground">{messages.branchSetup.noPhotos}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {photos.data.map((photo) => (
            <li key={photo.id} className="relative">
              <img src={publicImageUrl("shop-media", photo.storagePath)} alt="" className="aspect-square w-full rounded-lg border object-cover" />
              <Button variant="secondary" size="icon" className="absolute top-2 right-2 shadow-sm" aria-label={messages.branchSetup.removePhoto}
                disabled={remove.isPending} onClick={() => remove.mutate(photo)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormErrorAlert error={add.error ?? remove.error} />
    </SetupSection>
  );
}
