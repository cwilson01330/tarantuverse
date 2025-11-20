"""
Push Notification Service
Handles sending push notifications via Expo Push Notification Service
"""
import requests
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class PushNotificationService:
    """Service for sending push notifications through Expo"""

    @staticmethod
    def send_notification(
        expo_push_token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        badge: Optional[int] = None,
        sound: str = "default",
        priority: str = "default"
    ) -> bool:
        """
        Send a single push notification

        Args:
            expo_push_token: The Expo push token for the device
            title: Notification title
            body: Notification body/message
            data: Optional data payload to send with notification
            badge: Optional badge count
            sound: Sound to play (default, null, or custom sound name)
            priority: Priority level (default, normal, high)

        Returns:
            bool: True if sent successfully, False otherwise
        """
        if not expo_push_token or not expo_push_token.startswith('ExponentPushToken['):
            logger.warning(f"Invalid Expo push token format: {expo_push_token}")
            return False

        message = {
            "to": expo_push_token,
            "sound": sound,
            "title": title,
            "body": body,
            "priority": priority,
        }

        if data:
            message["data"] = data

        if badge is not None:
            message["badge"] = badge

        try:
            response = requests.post(
                EXPO_PUSH_URL,
                json=message,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }
            )

            response.raise_for_status()
            result = response.json()

            # Check if there were any errors in the response
            if "data" in result and len(result["data"]) > 0:
                ticket = result["data"][0]
                if ticket.get("status") == "error":
                    logger.error(f"Expo push notification error: {ticket.get('message')}")
                    return False

            logger.info(f"Push notification sent successfully to {expo_push_token[:20]}...")
            return True

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send push notification: {str(e)}")
            return False

    @staticmethod
    def send_batch_notifications(messages: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        Send multiple push notifications in a batch

        Args:
            messages: List of message dictionaries with 'to', 'title', 'body', etc.

        Returns:
            dict: Summary with 'success' and 'failed' counts
        """
        if not messages:
            return {"success": 0, "failed": 0}

        # Filter out invalid tokens
        valid_messages = [
            msg for msg in messages
            if msg.get("to") and msg["to"].startswith('ExponentPushToken[')
        ]

        if not valid_messages:
            logger.warning("No valid Expo push tokens in batch")
            return {"success": 0, "failed": len(messages)}

        try:
            response = requests.post(
                EXPO_PUSH_URL,
                json=valid_messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }
            )

            response.raise_for_status()
            result = response.json()

            # Count successes and failures
            success_count = 0
            failed_count = 0

            if "data" in result:
                for ticket in result["data"]:
                    if ticket.get("status") == "ok":
                        success_count += 1
                    else:
                        failed_count += 1
                        logger.error(f"Batch notification error: {ticket.get('message')}")

            logger.info(f"Batch push sent: {success_count} success, {failed_count} failed")
            return {"success": success_count, "failed": failed_count}

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send batch push notifications: {str(e)}")
            return {"success": 0, "failed": len(valid_messages)}


# Convenience functions for specific notification types

def send_direct_message_notification(
    expo_push_token: str,
    sender_username: str,
    message_preview: str
) -> bool:
    """Send notification for a new direct message"""
    return PushNotificationService.send_notification(
        expo_push_token=expo_push_token,
        title=f"New message from {sender_username}",
        body=message_preview[:100],  # Truncate to 100 chars
        data={
            "type": "direct_message",
            "sender": sender_username,
        },
        badge=1,
        sound="default",
        priority="high"
    )


def send_forum_reply_notification(
    expo_push_token: str,
    replier_username: str,
    thread_title: str,
    thread_id: str
) -> bool:
    """Send notification for a forum reply"""
    return PushNotificationService.send_notification(
        expo_push_token=expo_push_token,
        title=f"{replier_username} replied to your post",
        body=f'In "{thread_title}"',
        data={
            "type": "forum_reply",
            "thread_id": thread_id,
            "replier": replier_username,
        },
        badge=1,
        sound="default"
    )


def send_new_follower_notification(
    expo_push_token: str,
    follower_username: str
) -> bool:
    """Send notification for a new follower"""
    return PushNotificationService.send_notification(
        expo_push_token=expo_push_token,
        title="New Follower",
        body=f"{follower_username} started following you",
        data={
            "type": "new_follower",
            "follower": follower_username,
        },
        badge=1,
        sound="default"
    )


def send_community_activity_notification(
    expo_push_token: str,
    username: str,
    activity_type: str,
    activity_description: str
) -> bool:
    """Send notification for community activity from followed users"""
    return PushNotificationService.send_notification(
        expo_push_token=expo_push_token,
        title=f"{username} {activity_type}",
        body=activity_description,
        data={
            "type": "community_activity",
            "username": username,
            "activity_type": activity_type,
        },
        badge=1,
        sound="default"
    )
