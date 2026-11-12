from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Engine configuration, read from environment variables or a local .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr | None = None
    db_pool_max_size: int = 5
    engine_api_token: SecretStr = SecretStr("")
    enable_scheduler: bool = False
    scan_interval_minutes: int = 15
    whatsapp_access_token: SecretStr | None = None
    whatsapp_verify_token: SecretStr | None = None
    whatsapp_app_secret: SecretStr | None = None
    whatsapp_api_version: str = "v23.0"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.5-flash-lite"
    ai_batch_size: int = 20
    # Interactive API docs at /docs; leave off in production so the endpoint list is not public.
    engine_docs: bool = False
    # Your own number, used only by scripts/test_data.py for the 'Test · You' patient.
    test_whatsapp_number: str | None = None
    # Meta phone number ID; scripts/test_data.py copies it into the clinic's Settings if that is empty.
    whatsapp_phone_number_id: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
