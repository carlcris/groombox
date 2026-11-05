import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { fieldIds, FormField, firstFieldError } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { myMembershipsQueryOptions } from "@/features/organization/membership-queries";
import { organizationCategories, type OrganizationCategory } from "@/features/organization/organization-categories";
import {
  organizationSettingsQueryKey,
  type OrganizationSettings,
} from "@/features/organization/organization-settings-queries";
import { messages } from "@/lib/messages";
import { publicImageUrl, removeStoredImage, uploadImage } from "@/lib/stored-images";
import { supabase } from "@/lib/supabase-client";

const profileSchema = z.object({
  name: z.string().trim().min(1, { error: messages.validation.required }),
  category: z.enum(organizationCategories),
});

export function OrganizationProfileForm({ settings, userId }: { settings: OrganizationSettings; userId: string }) {
  const queryClient = useQueryClient();

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: organizationSettingsQueryKey(settings.id) }),
      queryClient.invalidateQueries({ queryKey: myMembershipsQueryOptions(userId).queryKey }),
    ]);
  }

  const saveProfile = useMutation({
    mutationFn: async (values: { name: string; category: OrganizationCategory }) => {
      const { error } = await supabase
        .from("organizations")
        .update({ name: values.name.trim(), category: values.category })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success(messages.setup.saved);
    },
  });

  const replaceLogo = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadImage("shop-media", `${settings.id}/logo`, file);
      const { error } = await supabase.from("organizations").update({ logo_path: path }).eq("id", settings.id);
      if (error) throw error;
      if (settings.logoPath) await removeStoredImage("shop-media", settings.logoPath);
    },
    onSuccess: refresh,
  });

  const form = useForm({
    defaultValues: { name: settings.name, category: settings.category },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: profileSchema },
    onSubmit: async ({ value }) => {
      await saveProfile.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">{messages.organizationProfile.logo}</h2>
        {settings.logoPath ? (
          <img
            src={publicImageUrl("shop-media", settings.logoPath)}
            alt={messages.organizationProfile.logo}
            className="size-24 rounded-xl border object-cover"
          />
        ) : (
          <p className="text-muted-foreground">{messages.organizationProfile.noLogo}</p>
        )}
        <div className="max-w-xs">
          <ImageUploadButton
            label={messages.organizationProfile.uploadLogo}
            isUploading={replaceLogo.isPending}
            onImage={(file) => replaceLogo.mutate(file)}
          />
        </div>
        <FormErrorAlert error={replaceLogo.error} />
      </div>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextField
              id="organization-name"
              label={messages.onboarding.organizationName}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="category">
          {(field) => (
            <FormField id="category" label={messages.onboarding.category} error={firstFieldError(field.state.meta.errors)}>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as OrganizationCategory)}>
                <SelectTrigger id="category" aria-describedby={fieldIds("category").errorId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {organizationCategories.map((category) => (
                    <SelectItem key={category} value={category} className="min-h-11 text-base">
                      {messages.categories[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </form.Field>
        <FormErrorAlert error={saveProfile.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting} className="md:self-start">
              {messages.setup.save}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
