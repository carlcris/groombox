import { MapPin, Phone } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import type { PublicBranch } from "@/features/booking/public-branch-queries";
import { formatTimeOfDay } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { publicImageUrl } from "@/lib/stored-images";

// The shop's own name, logo, and photos come first (design brief §10).
export function BranchProfile({ branch }: { branch: PublicBranch }) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {branch.organizationLogoPath ? (
          <img
            src={publicImageUrl("shop-media", branch.organizationLogoPath)}
            alt={fillTemplate(messages.publicBranch.logo, { organization: branch.organizationName })}
            className="size-14 rounded-xl border object-cover"
          />
        ) : null}
        <div className="flex flex-col">
          <p className="text-sm text-muted-foreground">{branch.organizationName}</p>
          <PageHeading>{branch.name}</PageHeading>
        </div>
      </div>
      <p className="flex items-start gap-2 text-muted-foreground">
        <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />
        {[branch.address, branch.area, branch.city].filter(Boolean).join(", ")}
      </p>
      {branch.contactNumber ? (
        <a href={`tel:${branch.contactNumber.replace(/\s/g, "")}`} className="flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
          <Phone className="size-5" aria-hidden />
          {fillTemplate(messages.publicBranch.callShop, { number: branch.contactNumber })}
        </a>
      ) : null}
      {branch.photoPaths.length > 0 ? (
        <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
          {branch.photoPaths.map((path) => (
            <li key={path} className="shrink-0">
              <img
                src={publicImageUrl("shop-media", path)}
                alt={fillTemplate(messages.publicBranch.photo, { branch: branch.name })}
                loading="lazy"
                className="h-40 w-64 rounded-xl object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

export function BranchHoursList({ branch }: { branch: PublicBranch }) {
  return (
    <dl className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
      {branch.hours.map((day) => (
        <div key={day.dayOfWeek} className="flex justify-between gap-4 px-4 py-2">
          <dt>{messages.hours.days[day.dayOfWeek]}</dt>
          <dd className="tabular-nums text-muted-foreground">
            {day.isClosed
              ? messages.publicBranch.closed
              : `${formatTimeOfDay(day.opensAt)} – ${formatTimeOfDay(day.closesAt)}`}
          </dd>
        </div>
      ))}
    </dl>
  );
}
