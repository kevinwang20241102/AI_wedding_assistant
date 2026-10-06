"""备备后端入口。"""

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pycore.api import APIConfig, APIServer, error_response
from pycore.api.middleware import ErrorHandlerMiddleware
from pycore.core import ConfigManager, Logger, LoggerConfig, LogLevel, get_logger
from pycore.core.exceptions import ConfigurationError
from src.api.deps import ApiError
from src.api.routes.budget_categories import router as budget_categories_router
from src.api.routes.conversation_images import router as conversation_images_router
from src.api.routes.conversations import router as conversations_router
from src.api.routes.guest_groups import router as guest_groups_router
from src.api.routes.guests import router as guests_router
from src.api.routes.stages import router as stages_router
from src.api.routes.tables import router as tables_router
from src.api.routes.tasks import router as tasks_router
from src.api.routes.users import router as users_router
from src.api.routes.wedding_photos import router as wedding_photos_router
from src.api.routes.weddings import router as weddings_router
from src.config.settings import AppSettings, backend_dir, load_config
from src.db.session import close_db, init_db


def _ensure_config() -> None:
    try:
        _ = ConfigManager.instance().settings
    except ConfigurationError:
        load_config()


_ensure_config()
settings: AppSettings = ConfigManager.instance().settings

Logger.configure(
    LoggerConfig(
        level=LogLevel.INFO,
        app_name="wedding_master",
        json_format=False,
        log_dir=backend_dir() / "logs",
    )
)
logger = get_logger()

server = APIServer(
    APIConfig(
        title="Wedding Master",
        version="1.0.0",
        host=settings.host,
        port=settings.port,
        debug=True,
        cors_origins=settings.cors_origins,
    )
)

server.on_startup(init_db)
server.on_shutdown(close_db)
server.include_router(users_router)
server.include_router(weddings_router)
server.include_router(wedding_photos_router)
server.include_router(tasks_router)
server.include_router(stages_router)
server.include_router(budget_categories_router)
server.include_router(guest_groups_router)
server.include_router(guests_router)
server.include_router(tables_router)
server.include_router(conversations_router)
server.include_router(conversation_images_router)
server.add_middleware(ErrorHandlerMiddleware, debug=False)

app = server.app


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    payload, status = error_response(
        error=exc.error,
        error_code=exc.error_code,
        status_code=exc.status_code,
    )
    return JSONResponse(status_code=status, content=jsonable_encoder(payload))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    missing_phone = any(
        err.get("loc", [None])[-1] == "phone" and err.get("type") == "missing"
        for err in exc.errors()
    )
    message = "未填手机号" if missing_phone else "参数验证失败"
    payload, status = error_response(
        error=message,
        error_code="VALIDATION_ERROR",
        status_code=400,
    )
    return JSONResponse(status_code=status, content=jsonable_encoder(payload))


logger.info("后端应用已创建", host=settings.host, port=settings.port)
