"""Custom exceptions with problem+json support."""
from typing import Any, Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class SDAException(Exception):
    """Base exception for SDA Platform."""
    
    def __init__(
        self,
        status_code: int,
        error_type: str,
        title: str,
        detail: str,
        instance: Optional[str] = None,
        extra: Optional[dict[str, Any]] = None,
    ):
        self.status_code = status_code
        self.error_type = error_type
        self.title = title
        self.detail = detail
        self.instance = instance
        self.extra = extra or {}
        super().__init__(detail)
    
    def to_problem_json(self) -> dict[str, Any]:
        """Convert to RFC 7807 problem+json format."""
        response = {
            "type": f"https://sda-platform.io/errors/{self.error_type}",
            "title": self.title,
            "status": self.status_code,
            "detail": self.detail,
        }
        if self.instance:
            response["instance"] = self.instance
        if self.extra:
            response.update(self.extra)
        return response


class NotFoundError(SDAException):
    """Resource not found error."""
    
    def __init__(
        self,
        resource_type: str,
        resource_id: str,
        detail: Optional[str] = None
    ):
        super().__init__(
            status_code=404,
            error_type="not-found",
            title=f"{resource_type} Not Found",
            detail=detail or f"{resource_type} with ID {resource_id} not found",
            extra={"resource_type": resource_type, "resource_id": resource_id}
        )


class ValidationError(SDAException):
    """Validation error."""
    
    def __init__(self, detail: str, errors: Optional[list[dict]] = None):
        super().__init__(
            status_code=422,
            error_type="validation-error",
            title="Validation Error",
            detail=detail,
            extra={"errors": errors} if errors else {}
        )


class AuthorizationError(SDAException):
    """Authorization error."""
    
    def __init__(self, detail: str = "Access denied"):
        super().__init__(
            status_code=403,
            error_type="authorization-error",
            title="Access Denied",
            detail=detail,
        )


class RateLimitError(SDAException):
    """Rate limit exceeded error."""
    
    def __init__(self, limit: int, window: int):
        super().__init__(
            status_code=429,
            error_type="rate-limit-exceeded",
            title="Rate Limit Exceeded",
            detail=f"Rate limit of {limit} requests per {window}s exceeded",
            extra={"limit": limit, "window_seconds": window}
        )


class AIServiceError(SDAException):
    """AI service error."""
    
    def __init__(self, detail: str):
        super().__init__(
            status_code=503,
            error_type="ai-service-error",
            title="AI Service Error",
            detail=detail,
        )


async def sda_exception_handler(
    request: Request,
    exc: SDAException
) -> JSONResponse:
    """Handle SDAException and return problem+json response."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_problem_json(),
        media_type="application/problem+json",
    )

