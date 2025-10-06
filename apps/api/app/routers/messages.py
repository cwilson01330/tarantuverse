from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.message import Message
from app.models.user import User
from app.schemas.message import MessageCreate, MessageResponse, MessageUpdate
from app.utils.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[MessageResponse])
def get_messages(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Get all messages from the community board (public, no auth required).
    Returns messages with author information.
    """
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
        }
        result.append(MessageResponse(**message_dict))
    
    return result


@router.get("/{message_id}", response_model=MessageResponse)
def get_message(
    message_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a single message by ID (public, no auth required).
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
    message_dict = {
        "id": message_obj.id,
        "user_id": str(message_obj.user_id),
        "title": message_obj.title,
        "content": message_obj.content,
        "created_at": message_obj.created_at,
        "updated_at": message_obj.updated_at,
        "author_username": user.username,
        "author_display_name": user.display_name or user.username,
        "author_avatar_url": user.avatar_url,
    }
    
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
    message_dict = {
        "id": db_message.id,
        "user_id": str(db_message.user_id),
        "title": db_message.title,
        "content": db_message.content,
        "created_at": db_message.created_at,
        "updated_at": db_message.updated_at,
        "author_username": current_user.username,
        "author_display_name": current_user.display_name or current_user.username,
        "author_avatar_url": current_user.avatar_url,
    }
    
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
    message_dict = {
        "id": db_message.id,
        "user_id": str(db_message.user_id),
        "title": db_message.title,
        "content": db_message.content,
        "created_at": db_message.created_at,
        "updated_at": db_message.updated_at,
        "author_username": current_user.username,
        "author_display_name": current_user.display_name or current_user.username,
        "author_avatar_url": current_user.avatar_url,
    }
    
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
