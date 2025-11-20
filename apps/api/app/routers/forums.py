"""
Forum API endpoints for community discussions
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime
import re

from app.database import get_db
from app.models.user import User
from app.models.forum import ForumCategory, ForumThread, ForumPost
from app.models.notification_preferences import NotificationPreferences
from app.schemas.forum import (
    ForumCategoryResponse, ForumCategoryCreate, ForumCategoryUpdate,
    ForumThreadResponse, ForumThreadCreate, ForumThreadUpdate, ForumThreadDetail,
    ForumPostResponse, ForumPostCreate, ForumPostUpdate, ForumPostBase,
    ForumThreadList, ForumPostList
)
from app.routers.auth import get_current_user
from app.utils.dependencies import get_current_user_optional
from app.services.activity_service import create_activity
from app.utils.push_notifications import send_forum_reply_notification

router = APIRouter(prefix="/api/v1/forums", tags=["forums"])


# ============================================================================
# Helper Functions
# ============================================================================

def slugify(text: str) -> str:
    """Convert text to URL-safe slug"""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text


def is_admin(user: User) -> bool:
    """Check if user is admin"""
    return user.is_admin or user.is_superuser


# ============================================================================
# Forum Category Endpoints
# ============================================================================

@router.get("/categories", response_model=List[ForumCategoryResponse])
async def list_categories(
    db: Session = Depends(get_db)
):
    """Get all forum categories ordered by display_order"""
    categories = db.query(ForumCategory).order_by(ForumCategory.display_order).all()
    return categories


@router.get("/categories/{category_slug}", response_model=ForumCategoryResponse)
async def get_category(
    category_slug: str,
    db: Session = Depends(get_db)
):
    """Get a single category by slug"""
    category = db.query(ForumCategory).filter(
        ForumCategory.slug == category_slug
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.post("/categories", response_model=ForumCategoryResponse)
async def create_category(
    category_data: ForumCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new forum category (admin only)"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if slug already exists
    existing = db.query(ForumCategory).filter(ForumCategory.slug == category_data.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category slug already exists")
    
    category = ForumCategory(**category_data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=ForumCategoryResponse)
async def update_category(
    category_id: int,
    category_data: ForumCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a forum category (admin only)"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    category = db.query(ForumCategory).filter(ForumCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Update fields
    update_data = category_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)
    
    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a forum category (admin only)"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    category = db.query(ForumCategory).filter(ForumCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    db.delete(category)
    db.commit()
    return {"message": "Category deleted successfully"}


# ============================================================================
# Forum Thread Endpoints
# ============================================================================

@router.get("/categories/{category_slug}/threads", response_model=ForumThreadList)
async def list_threads(
    category_slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("recent", regex="^(recent|popular|pinned)$"),
    db: Session = Depends(get_db)
):
    """Get threads in a category with pagination"""
    # Find category
    category = db.query(ForumCategory).filter(ForumCategory.slug == category_slug).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Build query
    query = db.query(ForumThread).filter(ForumThread.category_id == category.id)
    query = query.options(
        joinedload(ForumThread.author),
        joinedload(ForumThread.last_post_user)
    )
    
    # Apply sorting
    if sort == "pinned":
        query = query.order_by(desc(ForumThread.is_pinned), desc(ForumThread.updated_at))
    elif sort == "popular":
        query = query.order_by(desc(ForumThread.view_count))
    else:  # recent
        query = query.order_by(desc(ForumThread.is_pinned), desc(ForumThread.updated_at))
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * limit
    threads = query.offset(offset).limit(limit).all()
    
    return {
        "threads": threads,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (offset + limit) < total
    }


@router.get("/threads/{thread_id}", response_model=ForumThreadDetail)
async def get_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    """Get thread details with first post"""
    thread = db.query(ForumThread).filter(ForumThread.id == thread_id).options(
        joinedload(ForumThread.author),
        joinedload(ForumThread.last_post_user)
    ).first()

    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Only increment view count if viewer is not the thread author
    if not current_user or str(current_user.id) != str(thread.author_id):
        thread.view_count += 1
        db.commit()
    
    # Get first post
    first_post = db.query(ForumPost).filter(
        ForumPost.thread_id == thread_id
    ).options(joinedload(ForumPost.author)).order_by(ForumPost.created_at).first()
    
    # Convert to dict and add first_post
    thread_dict = {
        "id": thread.id,
        "category_id": thread.category_id,
        "author_id": thread.author_id,
        "author": thread.author,
        "title": thread.title,
        "slug": thread.slug,
        "is_pinned": thread.is_pinned,
        "is_locked": thread.is_locked,
        "view_count": thread.view_count,
        "post_count": thread.post_count,
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
        "last_post_at": thread.last_post_at,
        "last_post_user_id": thread.last_post_user_id,
        "last_post_user": thread.last_post_user,
        "first_post": first_post
    }
    
    return thread_dict


@router.post("/threads", response_model=ForumThreadResponse)
async def create_thread(
    thread_data: ForumThreadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new thread with initial post"""
    # Verify category exists
    category = db.query(ForumCategory).filter(
        ForumCategory.id == thread_data.category_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Create thread
    slug = slugify(thread_data.title)
    thread = ForumThread(
        category_id=thread_data.category_id,
        author_id=current_user.id,
        title=thread_data.title,
        slug=slug,
        post_count=1,
        last_post_at=datetime.utcnow(),
        last_post_user_id=current_user.id
    )
    db.add(thread)
    db.flush()  # Get thread.id without committing
    
    # Create first post
    first_post = ForumPost(
        thread_id=thread.id,
        author_id=current_user.id,
        content=thread_data.content
    )
    db.add(first_post)
    
    # Update category counts
    category.thread_count += 1
    category.post_count += 1
    
    db.commit()
    db.refresh(thread)
    
    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="forum_thread",
        target_type="thread",
        target_id=thread.id,
        metadata={
            "thread_title": thread.title,
            "category_name": category.name
        }
    )
    
    # Load relationships for response
    thread = db.query(ForumThread).filter(ForumThread.id == thread.id).options(
        joinedload(ForumThread.author),
        joinedload(ForumThread.last_post_user)
    ).first()
    
    return thread


@router.patch("/threads/{thread_id}", response_model=ForumThreadResponse)
async def update_thread(
    thread_id: int,
    thread_data: ForumThreadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update thread (author or admin only)"""
    thread = db.query(ForumThread).filter(ForumThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Check permissions
    if thread.author_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to edit this thread")
    
    # Only admin can pin/lock
    update_data = thread_data.model_dump(exclude_unset=True)
    if ('is_pinned' in update_data or 'is_locked' in update_data) and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required for pin/lock")
    
    # Update fields
    for field, value in update_data.items():
        setattr(thread, field, value)
    
    # Update slug if title changed
    if 'title' in update_data:
        thread.slug = slugify(update_data['title'])
    
    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(thread)
    
    # Load relationships
    thread = db.query(ForumThread).filter(ForumThread.id == thread.id).options(
        joinedload(ForumThread.author),
        joinedload(ForumThread.last_post_user)
    ).first()
    
    return thread


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete thread (author or admin only)"""
    thread = db.query(ForumThread).filter(ForumThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Check permissions
    if thread.author_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to delete this thread")
    
    # Update category counts
    category = db.query(ForumCategory).filter(ForumCategory.id == thread.category_id).first()
    if category:
        category.thread_count = max(0, category.thread_count - 1)
        category.post_count = max(0, category.post_count - thread.post_count)
    
    db.delete(thread)
    db.commit()
    return {"message": "Thread deleted successfully"}


# ============================================================================
# Forum Post Endpoints
# ============================================================================

@router.get("/threads/{thread_id}/posts", response_model=ForumPostList)
async def list_posts(
    thread_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get posts in a thread with pagination"""
    # Verify thread exists
    thread = db.query(ForumThread).filter(ForumThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Build query
    query = db.query(ForumPost).filter(ForumPost.thread_id == thread_id)
    query = query.options(joinedload(ForumPost.author))
    query = query.order_by(ForumPost.created_at)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * limit
    posts = query.offset(offset).limit(limit).all()
    
    return {
        "posts": posts,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (offset + limit) < total
    }


@router.post("/threads/{thread_id}/posts", response_model=ForumPostResponse)
async def create_post(
    thread_id: int,
    post_data: ForumPostBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new post (reply) in a thread"""
    # Verify thread exists and is not locked
    thread = db.query(ForumThread).filter(ForumThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.is_locked and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Thread is locked")
    
    # Create post
    post = ForumPost(
        thread_id=thread_id,
        author_id=current_user.id,
        content=post_data.content
    )
    db.add(post)
    
    # Update thread
    thread.post_count += 1
    thread.last_post_at = datetime.utcnow()
    thread.last_post_user_id = current_user.id
    thread.updated_at = datetime.utcnow()
    
    # Update category count
    category = db.query(ForumCategory).filter(ForumCategory.id == thread.category_id).first()
    if category:
        category.post_count += 1
    
    db.commit()
    db.refresh(post)
    
    # Create activity feed entry (only for replies, not first post)
    # First post is created with the thread itself
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="forum_post",
        target_type="post",
        target_id=post.id,
        metadata={
            "thread_title": thread.title,
            "thread_id": thread.id
        }
    )

    # Send push notification to thread author (if not replying to own thread)
    try:
        if thread.author_id != current_user.id:
            author_prefs = db.query(NotificationPreferences).filter(
                NotificationPreferences.user_id == thread.author_id
            ).first()

            if (author_prefs and
                author_prefs.push_notifications_enabled and
                author_prefs.forum_replies_enabled and
                author_prefs.expo_push_token):

                send_forum_reply_notification(
                    expo_push_token=author_prefs.expo_push_token,
                    replier_username=current_user.username,
                    thread_title=thread.title,
                    thread_id=str(thread.id)
                )
    except Exception as e:
        # Log error but don't fail the request
        print(f"Failed to send forum reply push notification: {str(e)}")

    # Load author relationship
    post = db.query(ForumPost).filter(ForumPost.id == post.id).options(
        joinedload(ForumPost.author)
    ).first()

    return post


@router.patch("/posts/{post_id}", response_model=ForumPostResponse)
async def update_post(
    post_id: int,
    post_data: ForumPostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a post (author or admin only)"""
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check permissions
    if post.author_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to edit this post")
    
    # Update post
    post.content = post_data.content
    post.is_edited = True
    post.edited_at = datetime.utcnow()
    
    db.commit()
    db.refresh(post)
    
    # Load author relationship
    post = db.query(ForumPost).filter(ForumPost.id == post.id).options(
        joinedload(ForumPost.author)
    ).first()
    
    return post


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a post (author or admin only)"""
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check permissions
    if post.author_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")
    
    # Get thread and category for count updates
    thread = db.query(ForumThread).filter(ForumThread.id == post.thread_id).first()
    category = db.query(ForumCategory).filter(ForumCategory.id == thread.category_id).first() if thread else None
    
    # Update counts
    if thread:
        thread.post_count = max(0, thread.post_count - 1)
    if category:
        category.post_count = max(0, category.post_count - 1)
    
    db.delete(post)
    db.commit()
    return {"message": "Post deleted successfully"}
