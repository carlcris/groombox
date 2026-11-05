import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogueQueryKey, categoriesQueryOptions } from "@/features/catalogue/catalogue-queries";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

// Categories are added and removed in place; a category with services cannot be removed.
export function CategoryManager({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQueryOptions(organizationId));
  const [newName, setNewName] = useState("");
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogueQueryKey(organizationId) });

  const add = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("service_categories")
        .insert({ organization_id: organizationId, name, sort_order: categories.data?.length ?? 0 });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNewName("");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from("service_categories").delete().eq("id", categoryId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  if (categories.isPending) return <Skeleton className="h-24 rounded-xl" />;
  if (categories.isError) return <QueryErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      {categories.data.length === 0 ? (
        <p className="text-muted-foreground">{messages.catalogue.noCategories}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.data.map((category) => (
            <li key={category.id} className="flex items-center gap-1 rounded-full border bg-muted py-1 pr-1 pl-4">
              <span>{category.name}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${messages.setup.remove} ${category.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(category.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormErrorAlert error={remove.error} />
      <form
        noValidate
        className="flex flex-col gap-2 md:flex-row md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          setNameProblem(name ? null : messages.validation.required);
          if (name) add.mutate(name);
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-category" className="text-base font-medium">
            {messages.catalogue.categoryName}
          </Label>
          <Input
            id="new-category"
            value={newName}
            aria-invalid={nameProblem ? true : undefined}
            aria-describedby={nameProblem ? "new-category-error" : undefined}
            onChange={(event) => setNewName(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={add.isPending}>
          <Plus aria-hidden />
          {messages.catalogue.addCategory}
        </Button>
      </form>
      {nameProblem ? (
        <p id="new-category-error" role="alert" className="text-sm text-danger">
          {nameProblem}
        </p>
      ) : null}
      <FormErrorAlert error={add.error} />
    </div>
  );
}
