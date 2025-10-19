"""Main FastAPI application for xCoS Dashboard."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import __version__
from app.routers import solve

# Create FastAPI app
app = FastAPI(
    title="xCoS Dashboard API",
    description="Explainable Constraint Solving Dashboard - Backend API",
    version=__version__,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite default + React default
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(solve.router)


@app.get("/")
async def root():
    """Root endpoint - API information."""
    return {
        "name": "xCoS Dashboard API",
        "version": __version__,
        "description": "Explainable Constraint Solving Dashboard",
        "docs": "/api/docs"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
