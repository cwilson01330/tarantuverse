from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app.database import get_db
from app.models.message import Message
from app.models.message_reply import MessageReply
from app.models.message_like import MessageLike
from app.models.message_reaction import MessageReaction
from app.models.user import User
from app.schemas.message import (
    MessageCreate, MessageResponse, MessageUpdate,
    ReplyCreate, ReplyResponse,
    LikeResponse, ReactionCreate, ReactionResponse
)
from app.utils.auth import get_current_user

router = APIRouter()


def get_current_user_optional(db: Session = Depends(get_db)) -> Optional[User]:
    """Optional auth - returns None if not authenticated"""
    try:
        return get_current_user(db)
    except:
        return None


def build_message_response(message: Message, user: User, current_user_id: Optional[str] = None, db: Session = None) -> dict:
    """Helper function to build a message response with interaction counts"""
    message_dict = {
        "id": message.id,
        "user_id": str(message.user_id),
        "title": message.title,
        "content": message.content,
        "created_at": message.created_at,
        "updated_at": message.updated_at,
        "author_username": user.username,
        "author_display_name": user.display_name or user.username,
        "author_avatar_url": user.avatar_url,
        "reply_count": 0,
        "like_count": 0,
        "reactions": {},
        "user_has_liked": False,
        "user_reactions": [],
    }
    
    if db:
        # Get reply count
        message_dict["reply_count"] = db.query(MessageReply).filter(MessageReply.message_id == message.id).count()
        
        # Get like count
        message_dict["like_count"] = db.query(MessageLike).filter(MessageLike.message_id == message.id).count()
        
        # Get reaction counts grouped by emoji
        reactions = db.query(
            MessageReaction.emoji,
            func.count(MessageReaction.id).label('count')
        ).filter(MessageReaction.message_id == message.id).group_by(MessageReaction.emoji).all()
        
        message_dict["reactions"] = {emoji: count for emoji, count in reactions}
        
        # Check if current user has liked/reacted
        if current_user_id:
            user_like = db.query(MessageLike).filter(
                MessageLike.message_id == message.id,
                MessageLike.user_id == current_user_id
            ).first()
            message_dict["user_has_liked"] = user_like is not None
            
            user_reactions = db.query(MessageReaction.emoji).filter(
                MessageReaction.message_id == message.id,
                MessageReaction.user_id == current_user_id
            ).all()
            message_dict["user_reactions"] = [r[0] for r in user_reactions]
    
    return message_dict


# ============ Message CRUD ============

@router.get("/", response_model=List[MessageResponse])
def get_messages(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Get all messages from the community board (public, no auth required).
    Returns messages with author information and interaction counts.
    """
    # Try to get current user if authenticated
    current_user_id = None
    
    messages = (
        db.query(Message, User)
        .join(User, Message.user_id == User.id)
        .order_by(Message.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    result = []
    for message, user in messages:
        message_dict = build_message_response(message, user, current_user_id, db)
        result.append(MessageResponse(**message_dict))
    
    return result


@router.get("/{message_id}", response_model=MessageResponse)
def get_message(
    message_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a single message by ID with interaction counts.
    """
    message = (
        db.query(Message, User)
        .join(User, Message.user_id == User.id)
        .filter(Message.id == message_id)
        .first()
    )
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    message_obj, user = message
    message_dict = build_message_response(message_obj, user, None, db)
    
    return MessageResponse(**message_dict)


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def create_message(
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new message on the community board (auth required).
    """
    db_message = Message(
        user_id=str(current_user.id),
        title=message.title,
        content=message.content
    )
    
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    
    # Return with author info
    message_dict = build_message_response(db_message, current_user, str(current_user.id), db)
    
    return MessageResponse(**message_dict)


@router.put("/{message_id}", response_model=MessageResponse)
def update_message(
    message_id: str,
    message_update: MessageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a message (only by the author).
    """
    db_message = db.query(Message).filter(Message.id == message_id).first()
    
    if not db_message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    # Check if user is the author
    if str(db_message.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this message"
        )
    
    # Update fields
    if message_update.title is not None:
        db_message.title = message_update.title
    if message_update.content is not None:
        db_message.content = message_update.content
    
    db.commit()
    db.refresh(db_message)
    
    # Return with author info
    message_dict = build_message_response(db_message, current_user, str(current_user.id), db)
    
    return MessageResponse(**message_dict)


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a message (only by the author).
    """
    db_message = db.query(Message).filter(Message.id == message_id).first()
    
    if not db_message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    # Check if user is the author
    if str(db_message.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this message"
        )
    
    db.delete(db_message)
    db.commit()
    
    return None


# ============ Replies ============

@router.get("/{message_id}/replies", response_model=List[ReplyResponse])
def get_replies(
    message_id: str,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Get all replies for a message (public, no auth required).
    """
    # Verify message exists
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    replies = (
        db.query(MessageReply, User)
        .join(User, MessageReply.user_id == User.id)
        .filter(MessageReply.message_id == message_id)
        .order_by(MessageReply.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    result = []
    for reply, user in replies:
        reply_dict = {
            "id": reply.id,
            "message_id": reply.message_id,
            "user_id": str(reply.user_id),
            "content": reply.content,
            "created_at": reply.created_at,
            "updated_at": reply.updated_at,
            "author_username": user.username,
            "author_display_name": user.display_name or user.username,
            "author_avatar_url": user.avatar_url,
        }
        result.append(ReplyResponse(**reply_dict))
    
    return result


@router.post("/{message_id}/replies", response_model=ReplyResponse, status_code=status.HTTP_201_CREATED)
def create_reply(
    message_id: str,
    reply: ReplyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a reply to a message (auth required).
    """
    # Verify message exists
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    db_reply = MessageReply(
        message_id=message_id,
        user_id=str(current_user.id),
        content=reply.content
    )
    
    db.add(db_reply)
    db.commit()
    db.refresh(db_reply)
    
    # Return with author info
    reply_dict = {
        "id": db_reply.id,
        "message_id": db_reply.message_id,
        "user_id": str(db_reply.user_id),
        "content": db_reply.content,
        "created_at": db_reply.created_at,
        "updated_at": db_reply.updated_at,
        "author_username": current_user.username,
        "author_display_name": current_user.display_name or current_user.username,
        "author_avatar_url": current_user.avatar_url,
    }
    
    return ReplyResponse(**reply_dict)


@router.delete("/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reply(
    reply_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a reply (only by the author).
    """
    db_reply = db.query(MessageReply).filter(MessageReply.id == reply_id).first()
    
    if not db_reply:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reply not found"
        )
    
    # Check if user is the author
    if str(db_reply.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this reply"
        )
    
    db.delete(db_reply)
    db.commit()
    
    return None


# ============ Likes ============

@router.post("/{message_id}/likes", status_code=status.HTTP_201_CREATED)
def toggle_like(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle like on a message (auth required).
    Returns {"liked": true/false, "like_count": number}
    """
    # Verify message exists
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    # Check if already liked
    existing_like = db.query(MessageLike).filter(
        MessageLike.message_id == message_id,
        MessageLike.user_id == str(current_user.id)
    ).first()
    
    if existing_like:
        # Unlike
        db.delete(existing_like)
        db.commit()
        liked = False
    else:
        # Like
        db_like = MessageLike(
            message_id=message_id,
            user_id=str(current_user.id)
        )
        db.add(db_like)
        db.commit()
        liked = True
    
    # Get new like count
    like_count = db.query(MessageLike).filter(MessageLike.message_id == message_id).count()
    
    return {"liked": liked, "like_count": like_count}


# ============ Reactions ============

@router.post("/{message_id}/reactions", status_code=status.HTTP_201_CREATED)
def toggle_reaction(
    message_id: str,
    reaction: ReactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle reaction on a message (auth required).
    Returns {"reacted": true/false, "reactions": {emoji: count}}
    """
    # Verify message exists
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    # Check if already reacted with this emoji
    existing_reaction = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == str(current_user.id),
        MessageReaction.emoji == reaction.emoji
    ).first()
    
    if existing_reaction:
        # Remove reaction
        db.delete(existing_reaction)
        db.commit()
        reacted = False
    else:
        # Add reaction
        db_reaction = MessageReaction(
            message_id=message_id,
            user_id=str(current_user.id),
            emoji=reaction.emoji
        )
        db.add(db_reaction)
        db.commit()
        reacted = True
    
    # Get new reaction counts
    reactions = db.query(
        MessageReaction.emoji,
        func.count(MessageReaction.id).label('count')
    ).filter(MessageReaction.message_id == message_id).group_by(MessageReaction.emoji).all()
    
    reaction_counts = {emoji: count for emoji, count in reactions}
    
    return {"reacted": reacted, "emoji": reaction.emoji, "reactions": reaction_counts}
