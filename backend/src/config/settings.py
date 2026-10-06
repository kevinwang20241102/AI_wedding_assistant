"""应用配置：从 backend/.env 加载，不读取进程环境。"""

from pathlib import Path

from pycore.core import BaseSettings, ConfigManager
from pydantic import Field


def backend_dir() -> Path:
    return Path(__file__).resolve().parents[2]


class AppSettings(BaseSettings):
    secret_key: str
    database_path: str = "data/Wedding_Master.db"
    host: str = "127.0.0.1"
    port: int = 8099
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5199",
            "http://127.0.0.1:5199",
            "http://localhost:5175",
            "http://127.0.0.1:5175",
        ]
    )
    timezone: str = "Asia/Shanghai"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes_session: int = 720
    jwt_expire_days_remember: int = 30
    bcrypt_rounds: int = 12
    password_reset_ttl_seconds: int = 300
    password_reset_resend_seconds: int = 60
    sms_mode: str = "mock"
    aliyun_sms_access_key_id: str = ""
    aliyun_sms_access_key_secret: str = ""
    aliyun_sms_sign_name: str = ""
    aliyun_sms_template_code: str = ""
    aliyun_sms_endpoint: str = "https://dypnsapi.aliyuncs.com"
    aliyun_sms_region: str = "cn-hangzhou"
    aliyun_sms_template_param_key: str = "code"
    aliyun_sms_timeout_seconds: int = 10
    deepseek_mode: str = "mock"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_default_model: str = "deepseek-flash"
    deepseek_allowed_models: list[str] = Field(
        default_factory=lambda: ["deepseek-flash", "deepseek-v4-pro"]
    )
    deepseek_max_tokens: int = 8192
    deepseek_timeout_seconds: int = 90
    deepseek_idle_timeout_seconds: int = 45
    xiaobei_max_text_chars: int = 4000
    xiaobei_max_image_bytes: int = 5242880
    xiaobei_image_dir: str = "data/xiaobei_images"
    wedding_photo_max_count: int = 6
    wedding_photo_max_bytes: int = 5242880
    wedding_photo_dir: str = "data/wedding_photos"
    deepseek_thinking_type: str = "disabled"
    deepseek_reasoning_effort: str = "none"
    xiaobei_fault_injection: bool = False


def load_config(config_path: Path | None = None) -> AppSettings:
    path = config_path or (backend_dir() / ".env")
    manager: ConfigManager[AppSettings] = ConfigManager()
    manager.load(AppSettings, path, use_env=False)
    return manager.settings


def load_config_from_mapping(data: dict) -> AppSettings:
    manager: ConfigManager[AppSettings] = ConfigManager()
    manager.load_from_dict(AppSettings, data)
    return manager.settings


def get_settings() -> AppSettings:
    return ConfigManager.instance().settings
