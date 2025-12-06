"""
Storage service abstraction layer for handling file uploads.
Supports both local filesystem and Cloudflare R2/S3-compatible storage.
"""
import os
import uuid
from typing import Optional, Tuple
from io import BytesIO
from PIL import Image
import boto3
from botocore.client import Config
from app.config import settings


class StorageService:
    """Abstract storage service that can use local filesystem or R2/S3."""
    
    def __init__(self):
        """Initialize storage service based on configuration."""
        # Debug: Print what we're checking
        print(f"🔍 R2 Configuration Check:")
        print(f"  R2_ACCOUNT_ID: {'✓' if settings.R2_ACCOUNT_ID else '✗ MISSING'}")
        print(f"  R2_ACCESS_KEY_ID: {'✓' if settings.R2_ACCESS_KEY_ID else '✗ MISSING'}")
        print(f"  R2_SECRET_ACCESS_KEY: {'✓' if settings.R2_SECRET_ACCESS_KEY else '✗ MISSING'}")
        print(f"  R2_BUCKET_NAME: {'✓' if settings.R2_BUCKET_NAME else '✗ MISSING'}")
        print(f"  R2_PUBLIC_URL: {'✓' if settings.R2_PUBLIC_URL else '✗ MISSING'}")
        
        self.use_r2 = all([
            settings.R2_ACCOUNT_ID,
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            settings.R2_BUCKET_NAME,
            settings.R2_PUBLIC_URL
        ])
        
        if self.use_r2:
            # Initialize R2 client (S3-compatible)
            endpoint_url = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
            print(f"  📡 R2 Endpoint: {endpoint_url}")
            self.s3_client = boto3.client(
                's3',
                endpoint_url=endpoint_url,
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                config=Config(signature_version='s3v4'),
                region_name='auto'
            )
            self.bucket_name = settings.R2_BUCKET_NAME
            self.public_url_base = settings.R2_PUBLIC_URL
            print(f"✅ Using Cloudflare R2 storage: {self.bucket_name}")
            print(f"  🌐 Public URL: {self.public_url_base}")
        else:
            # Use local filesystem
            self.upload_dir = "uploads/photos"
            self.thumbnail_dir = "uploads/thumbnails"
            os.makedirs(self.upload_dir, exist_ok=True)
            os.makedirs(self.thumbnail_dir, exist_ok=True)
            print("⚠️  Using local filesystem storage (development mode)")
    
    def _create_thumbnail(self, image_data: bytes, max_size: int = 300) -> bytes:
        """Create a thumbnail from image data."""
        img = Image.open(BytesIO(image_data))
        
        # Convert RGBA to RGB if necessary
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        
        # Calculate thumbnail size maintaining aspect ratio
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        
        # Save to bytes
        thumb_buffer = BytesIO()
        img.save(thumb_buffer, format='JPEG', quality=85)
        thumb_buffer.seek(0)
        
        return thumb_buffer.getvalue()
    
    async def upload_avatar(
        self,
        file_data: bytes,
        filename: str,
        content_type: str = "image/jpeg"
    ) -> str:
        """
        Upload an avatar image (creates a square thumbnail).

        Args:
            file_data: Raw image bytes
            filename: Original filename
            content_type: MIME type of the image

        Returns:
            Avatar URL
        """
        # Generate unique filename
        file_extension = os.path.splitext(filename)[1] or '.jpg'
        unique_filename = f"avatar_{uuid.uuid4()}{file_extension}"

        # Create square avatar (200x200)
        avatar_data = self._create_square_avatar(file_data, size=200)

        if self.use_r2:
            # Upload to R2
            avatar_url = await self._upload_to_r2(
                avatar_data,
                f"avatars/{unique_filename}",
                "image/jpeg"
            )
        else:
            # Upload to local filesystem
            avatar_dir = "uploads/avatars"
            os.makedirs(avatar_dir, exist_ok=True)
            avatar_url = await self._upload_to_local(
                avatar_data,
                unique_filename,
                avatar_dir
            )

        return avatar_url

    def _create_square_avatar(self, image_data: bytes, size: int = 200) -> bytes:
        """Create a square avatar from image data (crops to center)."""
        img = Image.open(BytesIO(image_data))

        # Convert RGBA to RGB if necessary
        if img.mode == 'RGBA':
            img = img.convert('RGB')

        # Crop to square (center crop)
        width, height = img.size
        min_dim = min(width, height)
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        right = left + min_dim
        bottom = top + min_dim

        img = img.crop((left, top, right, bottom))

        # Resize to target size
        img = img.resize((size, size), Image.Resampling.LANCZOS)

        # Save to bytes
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=90)
        buffer.seek(0)

        return buffer.getvalue()

    async def upload_photo(
        self,
        file_data: bytes,
        filename: str,
        content_type: str = "image/jpeg"
    ) -> Tuple[str, str]:
        """
        Upload a photo and its thumbnail.

        Args:
            file_data: Raw image bytes
            filename: Original filename
            content_type: MIME type of the image

        Returns:
            Tuple of (photo_url, thumbnail_url)
        """
        # Generate unique filename
        file_extension = os.path.splitext(filename)[1] or '.jpg'
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        thumbnail_filename = f"thumb_{unique_filename}"

        # Create thumbnail
        thumbnail_data = self._create_thumbnail(file_data)

        if self.use_r2:
            # Upload to R2
            photo_url = await self._upload_to_r2(
                file_data,
                f"photos/{unique_filename}",
                content_type
            )
            thumbnail_url = await self._upload_to_r2(
                thumbnail_data,
                f"thumbnails/{thumbnail_filename}",
                "image/jpeg"
            )
        else:
            # Upload to local filesystem
            photo_url = await self._upload_to_local(
                file_data,
                unique_filename,
                self.upload_dir
            )
            thumbnail_url = await self._upload_to_local(
                thumbnail_data,
                thumbnail_filename,
                self.thumbnail_dir
            )

        return photo_url, thumbnail_url
    
    async def _upload_to_r2(
        self,
        file_data: bytes,
        key: str,
        content_type: str
    ) -> str:
        """Upload file to Cloudflare R2."""
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=file_data,
                ContentType=content_type,
                CacheControl='public, max-age=31536000',  # 1 year cache
            )
            
            # Return public URL
            return f"{self.public_url_base}/{key}"
        
        except Exception as e:
            print(f"❌ R2 upload failed: {e}")
            raise Exception(f"Failed to upload to R2: {str(e)}")
    
    async def _upload_to_local(
        self,
        file_data: bytes,
        filename: str,
        directory: str
    ) -> str:
        """Upload file to local filesystem."""
        file_path = os.path.join(directory, filename)
        
        with open(file_path, "wb") as f:
            f.write(file_data)
        
        # Return relative URL (served by FastAPI StaticFiles)
        return f"/{directory}/{filename}"
    
    async def delete_photo(self, photo_url: str, thumbnail_url: str) -> None:
        """
        Delete a photo and its thumbnail.
        
        Args:
            photo_url: URL of the main photo
            thumbnail_url: URL of the thumbnail
        """
        if self.use_r2:
            await self._delete_from_r2(photo_url)
            await self._delete_from_r2(thumbnail_url)
        else:
            await self._delete_from_local(photo_url)
            await self._delete_from_local(thumbnail_url)
    
    async def _delete_from_r2(self, url: str) -> None:
        """Delete file from R2."""
        try:
            # Extract key from URL
            # Format: https://pub-xxx.r2.dev/photos/filename.jpg
            key = url.replace(f"{self.public_url_base}/", "")
            
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=key
            )
            print(f"✅ Deleted from R2: {key}")
        
        except Exception as e:
            print(f"⚠️  R2 delete failed (file may not exist): {e}")
    
    async def _delete_from_local(self, url: str) -> None:
        """Delete file from local filesystem."""
        try:
            # Convert URL to file path
            file_path = url.lstrip('/')
            
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"✅ Deleted local file: {file_path}")
        
        except Exception as e:
            print(f"⚠️  Local delete failed (file may not exist): {e}")


# Global storage service instance
storage_service = StorageService()
