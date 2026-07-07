/**
 * Notifications lib for Herpetoverse mobile.
 *
 * Thin typed wrappers over the shared backend notifications API. The
 * backend is animal-aware and shared with Tarantuverse, so the shapes and
 * routes match the proven TV mobile implementation.
 *
 * apiClient's baseURL already includes `/api/v1` (see services/api.ts), so
 * every path here starts at `/notifications` — never double-prefix.
 */
import { apiClient } from '../services/api';

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deeplink: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

export interface UnreadCountResponse {
  unread_count: number;
}

/** Fetch the most recent notifications (newest first, capped by `limit`). */
export async function fetchNotifications(limit = 30): Promise<NotificationResponse[]> {
  const res = await apiClient.get<NotificationResponse[]>(`/notifications/?limit=${limit}`);
  return res.data ?? [];
}

/** Fetch the current unread count for the badge. */
export async function fetchUnreadCount(): Promise<number> {
  const res = await apiClient.get<UnreadCountResponse>('/notifications/unread-count');
  return res.data?.unread_count ?? 0;
}

/** Mark a single notification as read. */
export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

/** Mark every notification as read. */
export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post('/notifications/read-all');
}

/** Dismiss (delete) a single notification. */
export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`/notifications/${id}`);
}

/** Clear (delete) all notifications. */
export async function clearAllNotifications(): Promise<void> {
  await apiClient.delete('/notifications/');
}
