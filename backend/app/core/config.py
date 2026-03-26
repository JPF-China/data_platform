import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/harbin_traffic",
    )
    db_conninfo: str = os.getenv(
        "DB_CONNINFO", "dbname=harbin_traffic user=postgres host=localhost port=5432"
    )
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    business_timezone: str = os.getenv("BUSINESS_TIMEZONE", "Asia/Shanghai")


settings = Settings()
