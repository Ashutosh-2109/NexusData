"""Live API, including SSE refresh cycle."""
import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from .service import service, TTL_SECONDS
from engine.development import scenario

router = APIRouter(prefix="/api/live", tags=["live"])


@router.get("/cities")
async def cities():
    return await asyncio.to_thread(service.refresh_all)


@router.get("/city/{name}")
async def city(name: str):
    result = await asyncio.to_thread(service.city_detail, name)
    if result is None:
        raise HTTPException(status_code=404, detail="City not found in registry")
    return result


class ScenarioRequest(BaseModel):
    driver: str
    target: str
    change_percent: float


@router.post("/city/{name}/scenario")
async def city_scenario(name: str, payload: ScenarioRequest):
    detail = await asyncio.to_thread(service.city_detail, name)
    if detail is None:
        raise HTTPException(status_code=404, detail="City not found in registry")
    try:
        return scenario(detail["history"], payload.driver, payload.target, payload.change_percent)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/providers/health")
async def providers_health():
    return {"providers": service.provider_health()}


@router.get("/stream")
async def stream():
    async def events():
        while True:
            snapshot = await asyncio.to_thread(service.refresh_all)
            yield f'event: snapshot\ndata: {json.dumps(snapshot)}\n\n'
            await asyncio.sleep(TTL_SECONDS)
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
