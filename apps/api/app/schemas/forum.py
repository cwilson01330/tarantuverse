"""
Pydantic schemas for forum endpoints
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# ============================================================================
# Forum Category Schemas
# ============================================================================

class ForumCategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    slug: str = Field(..., max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    display_order: int = Field(default=0)


class ForumCategoryCreate(ForumCategoryBase):
    pass


class ForumCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    slug: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    display_order: Optional[int] = None


class ForumCategoryResponse(ForumCategoryBase):
    id: int
    thread_count: int
    post_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Forum Thread Schemas
# ============================================================================

class ForumThreadBase(BaseModel):
    title: str = Field(..., max_length=200)
    category_id: int


class ForumThreadCreate(ForumThreadBase):
    content: str  # First post content


class ForumThreadUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    is_pinned: Optional[bool] = None
    is_locked: Optional[bool] = None


class ForumThreadAuthor(BaseModel):
    id: UUID
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class ForumThreadResponse(BaseModel):
    id: int
    category_id: int
    author_id: UUID
    author: ForumThreadAuthor
    title: str
    slug: str
    is_pinned: bool
    is_locked: bool
    view_count: int
    post_count: int
    created_at: datetime
    updated_at: datetime
    last_post_at: Optional[datetime]
    last_post_user_id: Optional[UUID]
    last_post_user: Optional[ForumThreadAuthor] = None

    class Config:
        from_attributes = True


class ForumThreadDetail(ForumThreadResponse):
    """Extended thread response with first post"""
    first_post: Optional['ForumPostResponse'] = None


# ============================================================================
# Forum Post Schemas
# ============================================================================

class ForumPostBase(BaseModel):
    content: str


class ForumPostCreate(ForumPostBase):
    thread_id: int


class ForumPostUpdate(BaseModel):
    content: str


class ForumPostResponse(BaseModel):
    id: int
    thread_id: int
    author_id: UUID
    author: ForumThreadAuthor
    content: str
    is_edited: bool
    edited_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Pagination & List Responses
# ============================================================================

class ForumThreadList(BaseModel):
    threads: List[ForumThreadResponse]
    total: int
    page: int
    limit: int
    has_more: bool


class ForumPostList(BaseModel):
    posts: List[ForumPostResponse]
    total: int
    page: int
    limit: int
    has_more: bool


# Fix forward references
ForumThreadDetail.model_rebuild()
