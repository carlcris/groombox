import { useEffect, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/TextField";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export type ClientChoice =
  | { kind: "existing"; id: string; fullName: string; mobileNumber: string | null }
  | { kind: "new"; fullName: string; mobileNumber: string };

const searchPageSize = 8;
const searchDelayMs = 250;
const minimumSearchLength = 2;

// The organization's clients matching part of a name or mobile number, found by the database
// (search_clients); never notes.
function clientSearchQueryOptions(branchId: string, term: string) {
  return queryOptions({
    queryKey: ["client-search", branchId, term] as const,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_clients", { p_branch_id: branchId, p_query: term, p_limit: searchPageSize });
      if (error) throw error;
      return data;
    },
  });
}

// Finds an existing client, or takes a new client's name and optional number (app flow §7).
export function ClientPicker({
  branchId,
  value,
  onChange,
  error,
}: {
  branchId: string;
  value: ClientChoice | null;
  onChange: (choice: ClientChoice | null) => void;
  error?: string;
}) {
  const [term, setTerm] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(term.trim()), searchDelayMs);
    return () => window.clearTimeout(timer);
  }, [term]);
  const results = useQuery({
    ...clientSearchQueryOptions(branchId, searchTerm),
    enabled: value === null && searchTerm.length >= minimumSearchLength,
  });

  if (value?.kind === "existing") {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-base font-medium">{messages.floor.client}</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-accent px-3 py-2">
          <span className="flex flex-col">
            <span className="font-medium">{value.fullName}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{value.mobileNumber ?? messages.clients.noMobile}</span>
          </span>
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            {messages.floor.changeClient}
          </Button>
        </div>
      </div>
    );
  }

  if (value?.kind === "new") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">{messages.floor.newClient}</span>
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            {messages.floor.changeClient}
          </Button>
        </div>
        <TextField
          id="new-client-name"
          label={messages.floor.clientName}
          value={value.fullName}
          errors={error ? [error] : []}
          onChange={(fullName) => onChange({ ...value, fullName })}
          onBlur={() => undefined}
        />
        <TextField
          id="new-client-mobile"
          label={messages.floor.mobileOptional}
          type="tel"
          inputMode="tel"
          value={value.mobileNumber}
          errors={[]}
          onChange={(mobileNumber) => onChange({ ...value, mobileNumber })}
          onBlur={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="client-search" className="text-base font-medium">
        {messages.floor.findClient}
      </Label>
      <Input id="client-search" type="search" value={term} autoComplete="off" onChange={(event) => setTerm(event.target.value)} />
      {searchTerm.length >= minimumSearchLength ? (
        results.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : results.data && results.data.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border" aria-label={messages.floor.client}>
            {results.data.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() =>
                    onChange({ kind: "existing", id: client.id, fullName: client.full_name, mobileNumber: client.mobile_number })
                  }
                >
                  <UserRound className="size-5 text-muted-foreground" aria-hidden />
                  <span className="flex flex-col">
                    <span className="font-medium">{client.full_name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">{client.mobile_number ?? messages.clients.noMobile}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{messages.floor.noClientsFound}</p>
        )
      ) : null}
      <Button type="button" variant="outline" className="self-start" onClick={() => onChange({ kind: "new", fullName: term.trim(), mobileNumber: "" })}>
        {messages.floor.newClient}
      </Button>
      <p className="text-sm text-muted-foreground">{messages.floor.newClientHint}</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// The arguments the visit functions take for a client.
export function clientArguments(choice: ClientChoice) {
  return choice.kind === "existing"
    ? { p_client_id: choice.id }
    : { p_client_name: choice.fullName.trim(), p_mobile_number: choice.mobileNumber.trim() || undefined };
}
