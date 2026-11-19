"""
FastAPI stub for the future reconstruction service.

This file exists to pin the contract, not to do any work: the MVP deliberately
ships *no* photo-to-3D reconstruction. Every reconstruction endpoint answers
501 with a machine-readable body so the frontend can feature-detect it without
guessing.

Run locally:
    python -m venv .venv
    .venv/Scripts/activate      # Windows
    source .venv/bin/activate   # macOS / Linux
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Floor Plan Reconstruction API",
    version="0.1.0-stub",
    description=(
        "Contract-only stub. Photo-to-3D reconstruction is on the roadmap; "
        "no endpoint in this service produces geometry yet."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReconstructionOptions(BaseModel):
    """Knobs the real service will accept once it exists."""

    units: Literal["m", "cm", "mm", "ft"] = "m"
    wall_height: float = Field(default=2.8, gt=0, le=10)
    simplify_tolerance: float = Field(
        default=0.01,
        ge=0,
        le=0.5,
        description="Polygon simplification tolerance in metres before vertices reach the client.",
    )
    detect_holes: bool = Field(
        default=True,
        description="Whether the service should look for inner courtyards.",
    )


class ReconstructionRequest(BaseModel):
    image_url: str | None = Field(
        default=None, description="Signed URL of an uploaded floor-plan image."
    )
    project_id: str | None = Field(default=None, description="Supabase project / room id.")
    options: ReconstructionOptions = ReconstructionOptions()


class ReconstructionResponse(BaseModel):
    """Shape the real endpoint must return; mirrors `ValidatedFloorPlan` on the client."""

    outer: list[tuple[float, float]]
    holes: list[list[tuple[float, float]]]
    units: Literal["m", "cm", "mm", "ft"] = "m"
    wall_height: float = 2.8
    confidence: float = Field(ge=0, le=1)
    warnings: list[str] = []


class NotImplementedBody(BaseModel):
    code: Literal["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED"
    message: str
    roadmap: list[str]
    request_echo: dict | None = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "floorplan-reconstruct",
        "version": app.version,
        "reconstruction_enabled": False,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/capabilities")
def capabilities() -> dict:
    """Lets the Next.js client decide whether to show the 'auto-trace' button."""
    return {
        "reconstruction": {
            "enabled": False,
            "reason": "Photo-to-3D reconstruction is roadmap-only in this MVP.",
            "planned_inputs": ["image_url", "file upload (png/jpeg/pdf)"],
            "planned_outputs": ["outer ring", "holes", "wall height estimate", "confidence"],
        },
        "geometry": {
            "client_side": True,
            "triangulation": "earcut",
            "cleanup": "polygon-clipping",
        },
    }


@app.post("/api/v1/reconstruct")
def reconstruct(payload: ReconstructionRequest) -> None:
    """Contract placeholder — always 501 until the service lands."""
    raise HTTPException(
        status_code=501,
        detail=NotImplementedBody(
            message=(
                "Reconstruction is not implemented. This MVP only previews floor plans "
                "that were authored as polygons."
            ),
            roadmap=[
                "Raster -> vector outline extraction (OpenCV)",
                "Wall thickness inference",
                "Hole / courtyard detection",
                "Wall height estimation from reference photos",
                "Server-side validation of the returned polygon",
            ],
            request_echo={
                "image_url": payload.image_url,
                "project_id": payload.project_id,
                "units": payload.options.units,
            },
        ).model_dump(),
    )


@app.post("/api/v1/reconstruct/upload")
async def reconstruct_upload(file: UploadFile = File(...)) -> None:
    """Same contract, multipart flavour. Also 501."""
    raise HTTPException(
        status_code=501,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": f"Received '{file.filename}', but reconstruction is roadmap-only in this MVP.",
            "roadmap": ["persist upload to Supabase storage", "run raster->vector extraction"],
        },
    )
