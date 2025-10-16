from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict


class MessageBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1)


class MessageCreate(MessageBase):
    pass


class MessageUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=1)


class MessageResponse(MessageBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Author info (joined from user)
    author_username: Optional[str] = None
    author_display_name: Optional[str] = None
    author_avatar_url: Optional[str] = None
    
    # Interaction counts
    reply_count: int = 0
    like_count: int = 0
    reactions: Dict[str, int] = {}  # {emoji: count}
    
    # User's interactions (if authenticated)
    user_has_liked: bool = False
    user_reactions: List[str] = []  # List of emojis user has reacted with

    class Config:
        from_attributes = True


# Reply schemas
class ReplyBase(BaseModel):
    content: str = Field(..., min_length=1)


class ReplyCreate(ReplyBase):
    pass


class ReplyResponse(ReplyBase):
    id: str
    message_id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Author info
    author_username: Optional[str] = None
    author_display_name: Optional[str] = None
    author_avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


# Like schemas
class LikeResponse(BaseModel):
    id: str
    message_id: str
    user_id: str
    created_at: datetime
    
    # User info (optional)
    username: Optional[str] = None

    class Config:
        from_attributes = True


# Reaction schemas
class ReactionCreate(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=10)


class ReactionResponse(BaseModel):
    id: str
    message_id: str
    user_id: str
    emoji: str
    created_at: datetime
    
    # User info (optional)
    username: Optional[str] = None

    class Config:
        from_attributes = True
