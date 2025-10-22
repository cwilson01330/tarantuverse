import Link from "next/link";

export type ActionType =
  | "new_tarantula"
  | "molt"
  | "feeding"
  | "follow"
  | "forum_thread"
  | "forum_post";

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
            <span className="font-semibold text-gray-100">
              {metadata.name || "Unnamed"}
            </span>
            {metadata.scientific_name && (
              <span className="text-gray-500 text-sm ml-1">
                ({metadata.scientific_name})
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
            <span className="font-semibold text-gray-100">
              {metadata.tarantula_name || "a tarantula"}
            </span>
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
            <span className="font-semibold text-gray-100">
              {metadata.tarantula_name || "a tarantula"}
            </span>
            {metadata.prey_type && (
              <span className="text-gray-300">
                {" "}
                {metadata.prey_type} (
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
            <Link
              href={`/community/${metadata.followed_username}`}
              className="font-semibold text-neon-pink-400 hover:text-neon-pink-300"
            >
              {metadata.followed_display_name || metadata.followed_username}
            </Link>
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
            <Link
              href={`/community/forums/thread/${activity.target_id}`}
              className="font-semibold text-electric-blue-400 hover:text-electric-blue-300"
            >
              {metadata.title || "Untitled"}
            </Link>
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
            <Link
              href={`/community/forums/thread/${metadata.thread_id}`}
              className="font-semibold text-neon-pink-400 hover:text-neon-pink-300"
            >
              {metadata.thread_title || "a thread"}
            </Link>
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

  return (
    <div className="flex items-start gap-3 p-4 bg-dark-50 rounded-lg shadow-lg border border-electric-blue-500/20 hover:shadow-electric-blue-500/30 hover:border-electric-blue-500/30 transition-all">
      {/* Icon */}
      <div className="flex-shrink-0 mt-1">{getActionIcon()}</div>

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
