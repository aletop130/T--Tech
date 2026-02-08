"""Security utilities for authentication and authorization."""
from datetime import datetime, timedelta
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


class TokenData(BaseModel):
    """Token payload data."""
    sub: str
    tenant_id: str
    roles: list[str] = []
    exp: Optional[datetime] = None

    @property
    def user_id(self) -> str:
        """Alias for sub for convenience."""
        return self.sub


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate password hash."""
    return pwd_context.hash(password)


def create_access_token(
    data: dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=ALGORITHM
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
        return TokenData(
            sub=payload.get("sub", ""),
            tenant_id=payload.get("tenant_id", "default"),
            roles=payload.get("roles", []),
            exp=payload.get("exp"),
        )
    except JWTError:
        return None


class ABACPolicy:
    """Attribute-Based Access Control policy checker."""
    
    @staticmethod
    def can_read(
        user_roles: list[str],
        user_tenant: str,
        resource_tenant: str,
        resource_owner: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> bool:
        """Check if user can read a resource."""
        # Admin can read everything in their tenant
        if "admin" in user_roles and user_tenant == resource_tenant:
            return True
        # Users can read resources in their tenant
        if user_tenant == resource_tenant:
            return True
        return False
    
    @staticmethod
    def can_write(
        user_roles: list[str],
        user_tenant: str,
        resource_tenant: str,
        resource_owner: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> bool:
        """Check if user can write to a resource."""
        # Admin can write everything in their tenant
        if "admin" in user_roles and user_tenant == resource_tenant:
            return True
        # Analysts can write in their tenant
        if "analyst" in user_roles and user_tenant == resource_tenant:
            return True
        # Owner can always write
        if resource_owner and user_id and resource_owner == user_id:
            return True
        return False
    
    @staticmethod
    def can_delete(
        user_roles: list[str],
        user_tenant: str,
        resource_tenant: str,
        resource_owner: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> bool:
        """Check if user can delete a resource."""
        # Only admin can delete
        if "admin" in user_roles and user_tenant == resource_tenant:
            return True
        return False

