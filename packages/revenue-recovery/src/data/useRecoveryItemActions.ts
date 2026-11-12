import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RecoveryItemPatch, WorklistItem } from "../domain/types";
import { useRecoveryContext } from "./context";
import { demoStore } from "./demoStore";
import { applyItemPatch, toItemUpdateRow } from "./recoveryItemPatch";
import { useWorklistQueryKey } from "./useWorklist";

type UpdateVariables = { id: string; patch: RecoveryItemPatch };

const MUTATION_KEY = ["recovery", "update-recovery-item"] as const;

/** Status, snooze and note changes on a recovery item, applied optimistically and rolled back on failure. */
export const useRecoveryItemActions = () => {
  const { supabase } = useRecoveryContext();
  const queryClient = useQueryClient();
  const queryKey = useWorklistQueryKey();

  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async ({ id, patch }: UpdateVariables): Promise<void> => {
      if (!supabase) return demoStore.updateItem(id, patch);
      const { error } = await supabase
        .schema("recovery")
        .from("recovery_items")
        .update(toItemUpdateRow(patch))
        .eq("id", id);
      if (error) throw new Error(`Could not update the item: ${error.message}`);
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<WorklistItem[]>(queryKey);
      queryClient.setQueryData<WorklistItem[]>(queryKey, (items) =>
        items?.map((item) => (item.id === id ? applyItemPatch(item, patch) : item)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    // Dashboard totals depend on item status too, so refresh everything in the module. While other
    // edits are still in flight, wait for the last one so a refetch can't undo their optimistic state.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
      return queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
  });
};
