import Link from "next/link";

export type ActionType =
  | "new_tarantula"
  | "molt"
  | "feeding"
  | "follow"
  | "forum_thread"
  | "forum_post"
  // Herpetoverse (ADR-019). One feed serves both apps.
  | "new_animal"
  | "shed"
  | "weight";

/**
 * Emoji for a herp taxon. Web renders emoji rather than an icon font, so the
 * "MDI has no lizard glyph" constraint that governs the mobile component
 * doesn't apply here — but the taxon still has to come from metadata rather
 * than being assumed, because one feed now carries spiders and snakes.
 */
function taxonEmoji(taxon?: string | null): string {
  switch ((taxon ?? "").toLowerCase()) {
    case "snake":      return "🐍";
    case "lizard":     return "🦎";
    case "turtle":
    case "tortoise":   return "🐢";
    case "frog":       return "🐸";
    case "salamander": return "🦎";
    default:           return "🦕";
  }
}

export interface ActivityFeedItemData {
  id: number;
  user_id: string;
  action_type: ActionType;
  target_type: string;
  target_id: string | null; // Changed to string to support UUIDs
  activity_metadata: Record<string, any> | null; // Renamed from metadata to match backend
  created_at: string;
  username: string; // From backend response
  display_name: string | null; // From backend response
  avatar_url: string | null; // From backend response
}

interface ActivityFeedItemProps {
  activity: ActivityFeedItemData;
}

export default function ActivityFeedItem({ activity }: ActivityFeedItemProps) {
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600)
      return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)}d ago`;
    if (diffInSeconds < 2592000)
      return `${Math.floor(diffInSeconds / 604800)}w ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getActionIcon = () => {
    switch (activity.action_type) {
      case "new_tarantula":
        return <span className="text-xl text-neon-pink-400">🕷️</span>;
      case "molt":
        return <span className="text-xl text-electric-blue-400">🦎</span>;
      case "feeding":
        return <span className="text-xl text-green-400">🍽️</span>;
      case "new_animal":
        return (
          <span className="text-xl text-green-400">
            {taxonEmoji(activity.activity_metadata?.taxon)}
          </span>
        );
      case "shed":
        return <span className="text-xl text-amber-400">🌬️</span>;
      case "weight":
        return <span className="text-xl text-sky-400">⚖️</span>;
      case "follow":
        return <span className="text-xl text-neon-pink-400">👥</span>;
      case "forum_thread":
        return <span className="text-xl text-electric-blue-400">💬</span>;
      case "forum_post":
        return <span className="text-xl text-neon-pink-400">💭</span>;
      default:
        return <span className="text-xl text-gray-400">👤</span>;
    }
  };

  const getActionText = () => {
    const username = activity.display_name || activity.username;
    const metadata = activity.activity_metadata || {};

    // Public tarantula profile route; works for both own and visitor
    // views thanks to the context-aware /t/[id] page. We guard with a
    // non-null id so activities missing the target_id + tarantula_id
    // metadata don't render a broken <Link href="/t/undefined">.
    const tarantulaId: string | null =
      (metadata.tarantula_id as string | undefined) || activity.target_id || null;
    const tarantulaName =
      metadata.tarantula_name || metadata.name || "Unnamed";

    const TarantulaLink = ({ className }: { className: string }) =>
      tarantulaId ? (
        <Link href={`/t/${tarantulaId}`} className={className}>
          {tarantulaName}
        </Link>
      ) : (
        <span className={className}>{tarantulaName}</span>
      );

    /**
     * Same pattern as TarantulaLink, generalized: render a Link when the
     * target id is present, fall back to a plain span otherwise. Null
     * target_id / thread_id / followed_username are real cases for older
     * activity rows or activities whose target was deleted — without
     * this guard we'd render hrefs like `/forums/thread/null` or
     * `/community/undefined` that 404 on tap.
     */
    const SafeLink = ({
      href,
      className,
      children,
    }: {
      href: string | null | undefined;
      className: string;
      children: React.ReactNode;
    }) =>
      href ? (
        <Link href={href} className={className}>
          {children}
        </Link>
      ) : (
        <span className={className}>{children}</span>
      );

    switch (activity.action_type) {
      case "new_tarantula":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-neon-pink-400 hover:text-neon-pink-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> added a new tarantula: </span>
            <TarantulaLink className="font-semibold text-gray-100 hover:text-neon-pink-300 hover:underline" />
            {(metadata.species_name || metadata.common_name || metadata.scientific_name) && (
              <span className="text-gray-500 text-sm ml-1">
                ({metadata.species_name || metadata.common_name || metadata.scientific_name})
              </span>
            )}
          </>
        );

      case "molt":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-electric-blue-400 hover:text-electric-blue-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> logged a molt for </span>
            <TarantulaLink className="font-semibold text-gray-100 hover:text-electric-blue-300 hover:underline" />
          </>
        );

      // ── Herpetoverse (ADR-019) ──────────────────────────────────────────
      //
      // The animal's NAME IS NOT A LINK here, unlike the invert cases above.
      // `/t/[id]` is the public tarantula profile and resolves against
      // inverts; there is no public HV animal page on web yet. Following the
      // SafeLink convention in this file, no destination means plain text
      // rather than an href that 404s. The keeper's name still links, because
      // keeper profiles ARE shared across both apps.

      case "new_animal":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-green-400 hover:text-green-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> added a new animal: </span>
            <span className="font-semibold text-gray-100">
              {metadata.animal_name || metadata.name || "Unnamed"}
            </span>
            {(metadata.species_name || metadata.scientific_name) && (
              <span className="text-gray-500 text-sm ml-1">
                ({metadata.species_name || metadata.scientific_name})
              </span>
            )}
          </>
        );

      case "shed":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-amber-400 hover:text-amber-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> logged a shed for </span>
            <span className="font-semibold text-gray-100">
              {metadata.animal_name || "Unnamed"}
            </span>
            {/* Only surfaced when the log explicitly says the shed was
                incomplete. A retained shed is a husbandry problem, not a
                milestone, and we don't infer it from absence. */}
            {metadata.is_complete_shed === false && (
              <span className="text-amber-400 text-sm ml-1">(retained)</span>
            )}
          </>
        );

      case "weight":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-sky-400 hover:text-sky-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> weighed </span>
            <span className="font-semibold text-gray-100">
              {metadata.animal_name || "Unnamed"}
            </span>
            {metadata.weight_g && (
              <span className="text-gray-500 text-sm ml-1">
                ({metadata.weight_g} g)
              </span>
            )}
          </>
        );

      case "feeding":
        const accepted = metadata.accepted ? "accepted" : "refused";
        const acceptedColor = metadata.accepted
          ? "text-green-400"
          : "text-red-400";
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-green-400 hover:text-green-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> fed </span>
            <TarantulaLink className="font-semibold text-gray-100 hover:text-green-300 hover:underline" />
            {(metadata.food_type || metadata.prey_type) && (
              <span className="text-gray-300">
                {" "}
                {metadata.food_type || metadata.prey_type} (
                <span className={acceptedColor}>{accepted}</span>)
              </span>
            )}
          </>
        );

      case "follow":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-neon-pink-400 hover:text-neon-pink-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> started following </span>
            <SafeLink
              href={
                metadata.followed_username
                  ? `/community/${metadata.followed_username}`
                  : null
              }
              className="font-semibold text-neon-pink-400 hover:text-neon-pink-300"
            >
              {metadata.followed_display_name || metadata.followed_username || "someone"}
            </SafeLink>
          </>
        );

      case "forum_thread":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-electric-blue-400 hover:text-electric-blue-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> created a thread: </span>
            <SafeLink
              href={
                activity.target_id
                  ? `/community/forums/thread/${activity.target_id}`
                  : null
              }
              className="font-semibold text-electric-blue-400 hover:text-electric-blue-300"
            >
              {metadata.title || "Untitled"}
            </SafeLink>
            {metadata.category && (
              <span className="text-gray-500 text-sm ml-1">
                in {metadata.category}
              </span>
            )}
          </>
        );

      case "forum_post":
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-neon-pink-400 hover:text-neon-pink-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> replied to </span>
            <SafeLink
              href={
                metadata.thread_id
                  ? `/community/forums/thread/${metadata.thread_id}`
                  : null
              }
              className="font-semibold text-neon-pink-400 hover:text-neon-pink-300"
            >
              {metadata.thread_title || "a thread"}
            </SafeLink>
          </>
        );

      default:
        return (
          <>
            <Link
              href={`/community/${activity.username}`}
              className="font-semibold text-gray-400 hover:text-gray-300"
            >
              {username}
            </Link>
            <span className="text-gray-300"> performed an action</span>
          </>
        );
    }
  };

  // Tarantula thumbnail — only the husbandry activities (add/molt/feed)
  // carry a subject animal. The backend writes tarantula_name +
  // thumbnail_url into activity_metadata for these. photo_url may be an
  // absolute R2 URL or a relative /uploads path, so resolve the same way
  // mobile does.
  const metadata = activity.activity_metadata || {};
  // Husbandry activities carry a subject animal and get the photo card.
  // Widened for ADR-019: a shed or weigh-in on a snake is as much a husbandry
  // event as a molt on a tarantula, and gating it out would render herp
  // activity as a bare social line while inverts got a card.
  const isAnimalActivity =
    activity.action_type === "new_tarantula" ||
    activity.action_type === "molt" ||
    activity.action_type === "feeding" ||
    activity.action_type === "new_animal" ||
    activity.action_type === "shed" ||
    activity.action_type === "weight";
  const tarantulaName: string | undefined =
    metadata.tarantula_name || metadata.animal_name || metadata.name;
  const rawThumbnail = metadata.thumbnail_url as string | undefined;
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const thumbnailUrl = rawThumbnail
    ? rawThumbnail.startsWith("http")
      ? rawThumbnail
      : `${API_URL}${rawThumbnail}`
    : null;

  return (
    <div className="flex items-start gap-3 p-4 bg-dark-50 rounded-lg shadow-lg border border-electric-blue-500/20 hover:shadow-electric-blue-500/30 hover:border-electric-blue-500/30 transition-all">
      {/* Icon */}
      <div className="flex-shrink-0 mt-1">{getActionIcon()}</div>

      {/* Tarantula thumbnail (husbandry activities only) */}
      {isAnimalActivity &&
        (thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={tarantulaName ? `Photo of ${tarantulaName}` : "Animal photo"}
            className="flex-shrink-0 w-11 h-11 rounded-lg object-cover"
          />
        ) : tarantulaName ? (
          <div
            className="flex-shrink-0 w-11 h-11 rounded-lg bg-dark-100 flex items-center justify-center text-xl"
            aria-hidden="true"
          >
            {metadata.taxon ? taxonEmoji(metadata.taxon) : "🕷️"}
          </div>
        ) : null)}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-relaxed">{getActionText()}</div>
        <div className="text-xs text-gray-500 mt-1">
          {formatRelativeTime(activity.created_at)}
        </div>
      </div>

      {/* User Avatar */}
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-primary text-white flex items-center justify-center font-semibold text-sm shadow-lg shadow-electric-blue-500/30">
          {(activity.display_name || activity.username)
            .charAt(0)
            .toUpperCase()}
        </div>
      </div>
    </div>
  );
}
