"""User and tenant models."""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import relationship

from app.db.base import Base, TimestampMixin, generate_uuid


class Tenant(Base, TimestampMixin):
    """Tenant / organization."""
    __tablename__ = "tenants"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(200), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Settings
    settings = Column(JSON, default=dict)
    
    # Limits
    max_users = Column(String(10), default="unlimited")
    max_satellites_tracked = Column(String(10), default="unlimited")
    
    # Contact
    admin_email = Column(String(200), nullable=True)
    
    users = relationship("User", back_populates="tenant")


class User(Base, TimestampMixin):
    """User account."""
    __tablename__ = "users"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    tenant_id = Column(
        String(50), ForeignKey("tenants.id"), nullable=False, index=True
    )
    
    # Identity
    email = Column(String(200), nullable=False, unique=True, index=True)
    username = Column(String(100), nullable=True, unique=True)
    full_name = Column(String(200), nullable=True)
    
    # Auth
    hashed_password = Column(String(200), nullable=True)  # For local auth
    external_id = Column(String(200), nullable=True)  # Keycloak ID
    
    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Roles and permissions
    roles = Column(JSON, default=lambda: ["viewer"])  # viewer, analyst, admin
    
    # Preferences
    preferences = Column(JSON, default=dict)
    
    # Last activity
    last_login = Column(DateTime, nullable=True)
    
    tenant = relationship("Tenant", back_populates="users")

