"""
Search API schemas
"""
from pydantic import BaseModel
from typing import Optional, List


class SearchResult(BaseModel):
    """Individual search result"""
    id: str
    type: str  # "tarantula", "species", "keeper", "forum"
    title: str
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    url: str  # frontend URL path

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """Global search response"""
    query: str
    total_results: int
    tarantulas: List[SearchResult] = []
    species: List[SearchResult] = []
    keepers: List[SearchResult] = []
    forums: List[SearchResult] = []
