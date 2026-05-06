from contextlib import asynccontextmanager

import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from config import get_logger
from db import init_db
from rooms import router as rooms_router
from ws_handler import router as ws_router

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting up — A 100 pasos de La Rosada")
    await init_db()
    yield
    log.info("Shutting down")


app = FastAPI(
    title="A 100 pasos de La Rosada",
    version="0.2.0",
    lifespan=lifespan,
)

@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")
    response = await call_next(request)
    if (
        origin.endswith(".app.github.dev")
        or origin.startswith("http://localhost")
        or origin.startswith("http://127.0.0.1")
    ):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
    return response

@app.options("/{rest_of_path:path}")
async def preflight(rest_of_path: str):
    from fastapi.responses import Response
    return Response(status_code=204, headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    })

app.include_router(rooms_router)
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok"}