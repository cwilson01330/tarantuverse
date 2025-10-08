"""
API routes for direct messaging functionality
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.models.user import User
from app.models.direct_message import Conversation, DirectMessage
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/messages/direct", tags=["direct_messages"])


class SendMessageRequest(BaseModel):
    recipient_username: str
    content: str


class MessageResponse(BaseModel):
    id: str
    content: str
    sender_id: str
    sender_username: str
    sender_display_name: Optional[str]
    is_read: bool
    created_at: str


@router.get("/conversations")
async def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all conversations for the current user"""
    conversations = db.query(Conversation).filter(
        or_(
            Conversation.participant1_id == current_user.id,
            Conversation.participant2_id == current_user.id
        )
    ).order_by(Conversation.updated_at.desc()).all()
    
    result = []
    for conv in conversations:
        # Get the other participant
        other_participant = conv.participant1 if conv.participant1_id != current_user.id else conv.participant2
        
        # Get last message
        last_message = db.query(DirectMessage).filter(
            DirectMessage.conversation_id == conv.id
        ).order_by(DirectMessage.created_at.desc()).first()
        
        # Count unread messages
        unread_count = db.query(func.count(DirectMessage.id)).filter(
            DirectMessage.conversation_id == conv.id,
            DirectMessage.sender_id != current_user.id,
            DirectMessage.is_read == False
        ).scalar() or 0
        
        result.append({
            "id": str(conv.id),
            "other_user": {
                "id": str(other_participant.id),
                "username": other_participant.username,
                "display_name": other_participant.display_name,
                "avatar_url": other_participant.avatar_url,
            },
            "last_message": {
                "content": last_message.content if last_message else None,
                "created_at": last_message.created_at.isoformat() if last_message else None,
                "sender_id": str(last_message.sender_id) if last_message else None,
            } if last_message else None,
            "unread_count": unread_count,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else conv.created_at.isoformat(),
        })
    
    return result


@router.post("/send")
async def send_message(
    request: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a direct message to another user"""
    # Get recipient
    recipient = db.query(User).filter(User.username == request.recipient_username).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Can't message yourself
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    
    # Find or create conversation
    conversation = db.query(Conversation).filter(
        or_(
            and_(
                Conversation.participant1_id == current_user.id,
                Conversation.participant2_id == recipient.id
            ),
            and_(
                Conversation.participant1_id == recipient.id,
                Conversation.participant2_id == current_user.id
            )
        )
    ).first()
    
    if not conversation:
        conversation = Conversation(
            participant1_id=current_user.id,
            participant2_id=recipient.id
        )
        db.add(conversation)
        db.flush()
    
    # Create message
    message = DirectMessage(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=request.content
    )
    db.add(message)
    
    # Update conversation timestamp
    from sqlalchemy import func as sa_func
    conversation.updated_at = sa_func.now()
    
    db.commit()
    db.refresh(message)
    
    return {
        "id": str(message.id),
        "conversation_id": str(conversation.id),
        "content": message.content,
        "created_at": message.created_at.isoformat()
    }


@router.get("/conversation/{username}")
async def get_conversation_with_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get conversation and messages with a specific user"""
    # Get the other user
    other_user = db.query(User).filter(User.username == username).first()
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find conversation
    conversation = db.query(Conversation).filter(
        or_(
            and_(
                Conversation.participant1_id == current_user.id,
                Conversation.participant2_id == other_user.id
            ),
            and_(
                Conversation.participant1_id == other_user.id,
                Conversation.participant2_id == current_user.id
            )
        )
    ).first()
    
    if not conversation:
        # Return empty conversation
        return {
            "conversation_id": None,
            "other_user": {
                "id": str(other_user.id),
                "username": other_user.username,
                "display_name": other_user.display_name,
                "avatar_url": other_user.avatar_url,
            },
            "messages": []
        }
    
    # Get messages
    messages = db.query(DirectMessage).filter(
        DirectMessage.conversation_id == conversation.id
    ).order_by(DirectMessage.created_at.asc()).all()
    
    # Mark messages as read
    db.query(DirectMessage).filter(
        DirectMessage.conversation_id == conversation.id,
        DirectMessage.sender_id != current_user.id,
        DirectMessage.is_read == False
    ).update({"is_read": True})
    db.commit()
    
    return {
        "conversation_id": str(conversation.id),
        "other_user": {
            "id": str(other_user.id),
            "username": other_user.username,
            "display_name": other_user.display_name,
            "avatar_url": other_user.avatar_url,
        },
        "messages": [
            {
                "id": str(msg.id),
                "content": msg.content,
                "sender_id": str(msg.sender_id),
                "is_read": msg.is_read,
                "created_at": msg.created_at.isoformat(),
                "is_own": msg.sender_id == current_user.id
            }
            for msg in messages
        ]
    }


@router.get("/unread-count")
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get total unread message count for current user"""
    # Get all conversations
    conversations = db.query(Conversation).filter(
        or_(
            Conversation.participant1_id == current_user.id,
            Conversation.participant2_id == current_user.id
        )
    ).all()
    
    total_unread = 0
    for conv in conversations:
        unread = db.query(func.count(DirectMessage.id)).filter(
            DirectMessage.conversation_id == conv.id,
            DirectMessage.sender_id != current_user.id,
            DirectMessage.is_read == False
        ).scalar() or 0
        total_unread += unread
    
    return {"unread_count": total_unread}


@router.delete("/{message_id}")
async def delete_message(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a direct message (only if you're the sender)"""
    message = db.query(DirectMessage).filter(DirectMessage.id == uuid.UUID(message_id)).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this message")
    
    db.delete(message)
    db.commit()
    
    return {"message": "Message deleted successfully"}
